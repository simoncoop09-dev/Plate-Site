// Plate — Snap your plate: photo -> protein/calorie estimate via Claude vision.
export const config = { maxDuration: 30 };

const RL = globalThis.__plateRL || (globalThis.__plateRL = new Map());
function rateLimit(req, kind, perDay, minGapMs) {
  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const key = kind + ':' + ip;
  const now = Date.now();
  let rec = RL.get(key);
  if (!rec || rec.day !== day) rec = { day, count: 0, last: 0 };
  if (now - rec.last < minGapMs) return { ok: false, why: 'burst' };
  if (rec.count >= perDay) return { ok: false, why: 'daily' };
  rec.count++; rec.last = now;
  RL.set(key, rec);
  if (RL.size > 5000) { const k = RL.keys().next().value; RL.delete(k); }
  return { ok: true };
}

const SNAP_SYSTEM =
  'You are the vision engine of Plate, a nutrition app for people on GLP-1 medications. ' +
  'You will receive one photo of food. Estimate what it is and its nutrition. ' +
  'Respond with ONLY a JSON object, no markdown, no backticks, exactly this shape: ' +
  '{"food":"short name of the dish","protein":<grams, integer>,"calories":<integer>,' +
  '"confidence":"high"|"medium"|"low","note":"one short encouraging sentence, cycle-aware if context given"} ' +
  'Estimate visible portion size honestly. If the image is not food, return ' +
  '{"food":"","protein":0,"calories":0,"confidence":"low","note":"I could not spot food in that photo - try another angle?"} ' +
  'Never include medical advice. Keep the note under 20 words.';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set' }); return; }

  const rl = rateLimit(req, 'snap', 25, 3000);
  if (!rl.ok) {
    res.status(429).json({ error: rl.why === 'daily' ? "That's today's snap limit — back tomorrow!" : 'One sec between snaps.' });
    return;
  }

  const b = req.body || {};
  const img = typeof b.image === 'string' ? b.image : '';
  const media = (b.media === 'image/png' || b.media === 'image/webp') ? b.media : 'image/jpeg';
  const ctx = typeof b.context === 'string' ? b.context.slice(0, 300) : '';
  if (!img || img.length < 100) { res.status(400).json({ error: 'No image' }); return; }
  if (img.length > 1500000) { res.status(413).json({ error: 'Image too large' }); return; }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: SNAP_SYSTEM + (ctx ? ' User context: ' + ctx : ''),
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data: img } },
            { type: 'text', text: 'Estimate this meal.' }
          ]
        }]
      })
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(502).json({ error: 'Vision request failed' });
      return;
    }
    const text = (data.content || []).map(x => x.text || '').join('').replace(/```json|```/g, '').trim();
    let out;
    try { out = JSON.parse(text); } catch (e) {
      const m = text.match(/\{[\s\S]*\}/);
      out = m ? JSON.parse(m[0]) : null;
    }
    if (!out || typeof out !== 'object') { res.status(502).json({ error: 'Could not read that photo' }); return; }
    res.status(200).json({
      food: String(out.food || '').slice(0, 80),
      protein: Math.max(0, Math.min(200, parseInt(out.protein) || 0)),
      calories: Math.max(0, Math.min(3000, parseInt(out.calories) || 0)),
      confidence: ['high','medium','low'].includes(out.confidence) ? out.confidence : 'medium',
      note: String(out.note || '').slice(0, 140)
    });
  } catch (e) {
    res.status(500).json({ error: 'Vision error' });
  }
}
