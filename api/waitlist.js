// Plate — early access waitlist endpoint
//
// Every signup is written to your Vercel logs (Project → Logs), so it works
// immediately with zero setup.
//
// To also pipe signups into a real list (recommended once you have traffic),
// set a WAITLIST_WEBHOOK_URL environment variable in Vercel. Anything that
// accepts a POST works — Formspree, Zapier, Make, Google Sheets via Apps
// Script, Beehiiv, ConvertKit, etc. The body sent is: { email, source, ts }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : '';
  const source = typeof body.source === 'string' ? body.source.slice(0, 60) : 'unknown';

  // Simple, permissive validation — good enough to catch typos, not a gatekeeper
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!looksLikeEmail) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  const record = { email, source, ts: new Date().toISOString() };

  // Always log — visible in Vercel → your project → Logs
  console.log('[waitlist]', JSON.stringify(record));

  // Optionally forward to a real list provider
  if (process.env.WAITLIST_WEBHOOK_URL) {
    try {
      await fetch(process.env.WAITLIST_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(record)
      });
    } catch (err) {
      // Never fail the user's signup because a downstream service hiccuped
      console.error('[waitlist] webhook failed:', String(err && err.message));
    }
  }

  res.status(200).json({ ok: true });
}
