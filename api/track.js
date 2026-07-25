// Plate — conversion event tracker.
// Events land in Vercel's function logs (Project → Logs, filter "[track]").
// Zero dependencies, no cookies, no third parties.
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  try {
    const b = req.body || {};
    const event = String(b.event || '').slice(0, 40).replace(/[^a-z0-9_-]/gi, '');
    const meta = String(b.meta || '').slice(0, 120);
    const ref = String(req.headers['referer'] || '').slice(0, 120);
    if (event) console.log('[track]', event, meta ? '|' + meta : '', ref ? '<' + ref : '');
  } catch (e) {}
  res.status(204).end();
}
