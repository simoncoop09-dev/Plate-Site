// Plate — Walmart cart resolver.
// Turns grocery item names into Walmart product IDs via the Walmart.io
// Affiliate Product Search API, then returns a ready-to-go bulk cart URL.
//
// DORMANT until these env vars are set in Vercel (from the approved
// Walmart affiliate / Impact Radius account):
//   WALMART_CONSUMER_ID   - from walmart.io dashboard
//   WALMART_PRIVATE_KEY   - RSA private key (PEM, base64 or raw) from walmart.io
//   WALMART_KEY_VERSION   - usually "1"
// GET  /api/walmart  -> { enabled: boolean }
// POST /api/walmart  { items: ["chicken breast", ...] }
//   -> { cartUrl, resolved: [{item,id,name}], unresolved: ["..."] }

export const config = { maxDuration: 30 };

import crypto from 'crypto';

const RL = globalThis.__plateRL || (globalThis.__plateRL = new Map());
function rateLimit(req, kind, perDay, minGapMs) {
  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const key = kind + ':' + ip;
  const now = Date.now();
  let rec = RL.get(key);
  if (!rec || rec.day !== day) rec = { day, count: 0, last: 0 };
  if (now - rec.last < minGapMs) return { ok: false };
  if (rec.count >= perDay) return { ok: false };
  rec.count++; rec.last = now;
  RL.set(key, rec);
  return { ok: true };
}

function walmartHeaders() {
  const consumerId = process.env.WALMART_CONSUMER_ID;
  let key = process.env.WALMART_PRIVATE_KEY || '';
  const keyVersion = process.env.WALMART_KEY_VERSION || '1';
  if (key && !key.includes('BEGIN')) key = Buffer.from(key, 'base64').toString('utf8');
  const ts = Date.now().toString();
  const data = consumerId + '\n' + ts + '\n' + keyVersion + '\n';
  const signature = crypto.createSign('RSA-SHA256').update(data).sign(key, 'base64');
  return {
    'WM_CONSUMER.ID': consumerId,
    'WM_CONSUMER.INTIMESTAMP': ts,
    'WM_SEC.KEY_VERSION': keyVersion,
    'WM_SEC.AUTH_SIGNATURE': signature
  };
}

async function resolveItem(name) {
  const url = 'https://developer.api.walmart.com/api-proxy/service/affil/product/v2/search?numItems=3&query=' + encodeURIComponent(name);
  const r = await fetch(url, { headers: walmartHeaders() });
  if (!r.ok) return null;
  const d = await r.json();
  const items = Array.isArray(d.items) ? d.items : [];
  // prefer grocery-priced sensible matches; take the first with an itemId
  const hit = items.find(it => it && it.itemId);
  return hit ? { id: String(hit.itemId), name: String(hit.name || '').slice(0, 90) } : null;
}

export default async function handler(req, res) {
  const enabled = !!(process.env.WALMART_CONSUMER_ID && process.env.WALMART_PRIVATE_KEY);

  if (req.method === 'GET') { res.status(200).json({ enabled }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!enabled) { res.status(503).json({ error: 'Walmart integration not configured yet' }); return; }

  const rl = rateLimit(req, 'walmart', 20, 5000);
  if (!rl.ok) { res.status(429).json({ error: 'A moment between carts, please.' }); return; }

  const b = req.body || {};
  let items = Array.isArray(b.items) ? b.items.slice(0, 60) : [];
  items = items.map(x => String(x || '').slice(0, 60).trim()).filter(Boolean);
  if (!items.length) { res.status(400).json({ error: 'No items' }); return; }

  const resolved = [];
  const unresolved = [];
  for (const item of items) {
    try {
      const hit = await resolveItem(item);
      if (hit) resolved.push({ item, id: hit.id, name: hit.name });
      else unresolved.push(item);
    } catch (e) { unresolved.push(item); }
  }

  if (!resolved.length) { res.status(502).json({ error: 'Could not match any items' }); return; }
  const cartUrl = 'https://affil.walmart.com/cart/addToCart?items=' + resolved.map(x => x.id).join(',');
  res.status(200).json({ cartUrl, resolved, unresolved });
}
