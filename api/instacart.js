// Plate — Instacart cart builder
// Turns the week's grocery list into an Instacart shopping-list page where the
// user picks their local store and checks out with every item pre-matched.
//
// SETUP (one time):
// 1. Apply for the Instacart Developer Platform and get an API key.
// 2. In Vercel → Settings → Environment Variables add:
//      INSTACART_API_KEY = <your key>
//    Optionally, while testing against Instacart's dev environment:
//      INSTACART_API_BASE = https://connect.dev.instacart.tools
// 3. Redeploy. The "Shop with Instacart" button appears automatically.
//
// NOTE: verify the endpoint path against Instacart's current docs when your
// key arrives — this uses their products-link API shape and is easy to adjust.

export const config = { maxDuration: 30 };

const API_BASE = process.env.INSTACART_API_BASE || 'https://connect.instacart.com';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Lets the front end know whether to show the Instacart button at all
    res.status(200).json({ enabled: Boolean(process.env.INSTACART_API_KEY) });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!process.env.INSTACART_API_KEY) {
    res.status(503).json({ error: 'Instacart is not connected yet.' });
    return;
  }

  const b = req.body || {};
  let items = Array.isArray(b.items) ? b.items : [];
  items = items
    .filter(it => it && typeof it.name === 'string' && it.name.trim())
    .slice(0, 80)
    .map(it => ({
      name: it.name.trim().slice(0, 80),
      quantity: Number.isFinite(it.quantity) && it.quantity > 0 ? Math.min(it.quantity, 20) : 1
    }));

  if (!items.length) {
    res.status(400).json({ error: 'No items to shop for.' });
    return;
  }

  try {
    const upstream = await fetch(API_BASE + '/idp/v1/products/products_link', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'authorization': 'Bearer ' + process.env.INSTACART_API_KEY
      },
      body: JSON.stringify({
        title: 'Plate — your 7-day grocery list',
        link_type: 'shopping_list',
        line_items: items.map(it => ({ name: it.name, quantity: it.quantity }))
      })
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      console.error('[instacart] upstream', upstream.status, text.slice(0, 300));
      res.status(502).json({ error: 'Instacart could not build the cart right now (' + upstream.status + ').' });
      return;
    }

    let data = {};
    try { data = JSON.parse(text); } catch (e) {}
    const url = data.products_link_url || data.url || (data.data && data.data.products_link_url);
    if (!url) {
      console.error('[instacart] no url in response:', text.slice(0, 300));
      res.status(502).json({ error: 'Instacart responded without a cart link.' });
      return;
    }

    res.status(200).json({ url });
  } catch (err) {
    console.error('[instacart] error', String(err && err.message));
    res.status(500).json({ error: 'Something went wrong building the cart.' });
  }
}
