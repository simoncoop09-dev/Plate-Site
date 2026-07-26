// Plate — 7-day meal plan generator
// Returns strict JSON so the front end can render a plan and derive a grocery list.

export const config = { maxDuration: 60 };

// ---- Rate limiting (in-memory, per warm instance) ----
// Not perfect (cold starts reset it) but blocks sustained abuse cheaply.
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


const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const PLAN_SYSTEM = `You are the meal planning engine for Plate, a nutrition app for people taking GLP-1 medications (Ozempic, Wegovy, Mounjaro, Zepbound).

You generate a 7-day meal plan tuned to the user's weekly injection cycle.

CYCLE RULES (critical — this is what makes Plate different):
- Cycle day 1 is injection day. Days 1-3 are typically nausea-prone and appetite is lowest: choose cool or room-temperature, bland, low-odour, low-fat, protein-dense foods in SMALL portions (Greek yogurt, cottage cheese, eggs, protein shakes, broth-based soups, plain chicken, crackers, bananas). Avoid fried, greasy, heavily spiced, or strongly aromatic dishes on these days.
- Days 4-5 are a transition: normal foods, still modest portions.
- Days 6-7 appetite usually returns: this is when to front-load protein and fibre with fuller, more varied meals.

NUTRITION RULES:
- Protein at every meal. Muscle retention is the top priority for this population.
- Total daily protein should land near the user's goal, and may fall slightly short on the roughest days — that is expected and fine.
- Keep portions realistic for a suppressed appetite: small meals plus a protein-forward snack beats three large meals.
- Respect every dietary restriction absolutely. If a restriction conflicts with a food, do not use that food.

OUTPUT RULES:
- Respond with ONE valid JSON object and NOTHING else. No markdown fences, no commentary.
- Every ingredient needs an "aisle" from exactly this list: Produce, Meat & Seafood, Dairy & Eggs, Pantry, Frozen, Bakery, Other.
- Keep ingredient names generic and shoppable ("chicken breast", not "1 organic free-range chicken breast from the good butcher").
- GROCERY VOCABULARY: build meals primarily from widely-stocked staples, using exactly these generic names when used: chicken breast, ground turkey, salmon, canned tuna, shrimp, eggs, egg whites, greek yogurt, cottage cheese, string cheese, cheddar cheese, milk, firm tofu, black beans, chickpeas, lentils, rotisserie chicken, deli turkey, protein powder, oats, brown rice, quinoa, whole wheat bread, corn tortillas, potatoes, sweet potatoes, pasta, baby spinach, broccoli, bell pepper, cucumber, carrots, zucchini, green beans, lettuce, tomatoes, onion, garlic, avocado, banana, apple, blueberries, strawberries, lemon, olive oil, peanut butter, almonds, chicken broth, salsa, soy sauce, honey. Specialty items are allowed when a recipe truly needs one, but most of the list should come from these staples - it makes the grocery list orderable in one tap.
- "how" is ONE short sentence of preparation, 12 words maximum.
- 3 or 4 ingredients per meal, never more. "qty" stays short ("6 oz", "1 cup").
- "note" is 10 words maximum. Keep every string tight — this must generate fast.
- Never mention medication dosing, medical treatment, or expected weight loss anywhere in the output.

Schema:
{
  "proteinGoal": <number, grams per day>,
  "summary": "<one encouraging sentence about the week, max 20 words>",
  "days": [
    {
      "day": "<weekday name>",
      "cycleDay": <1-7>,
      "mode": "<gentle|steady|fuller>",
      "note": "<one short sentence explaining today's approach, max 15 words>",
      "meals": [
        {
          "slot": "<Breakfast|Lunch|Dinner|Snack>",
          "name": "<dish name>",
          "protein": <grams, number>,
          "calories": <number>,
          "how": "<one sentence>",
          "ingredients": [
            {"item": "<generic name>", "qty": "<amount>", "aisle": "<from list>"}
          ]
        }
      ]
    }
  ]
}

Exactly 7 day objects. Exactly 4 meals per day (Breakfast, Lunch, Dinner, Snack).`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Server is not configured yet.' });
    return;
  }

  const rl = rateLimit(req, 'plan', 6, 10000);
  if (!rl.ok) {
    res.status(429).json({ error: rl.why === 'daily'
      ? "You've built today's limit of plans — tomorrow brings a fresh batch."
      : 'Give the kitchen a few seconds between plans.' });
    return;
  }
  const b = req.body || {};
  const med = typeof b.med === 'string' ? b.med.slice(0, 40) : 'a GLP-1 medication';
  const shotDay = (typeof b.shotDay === 'number' && b.shotDay >= 0 && b.shotDay <= 6) ? DAYS[b.shotDay] : null;
  const proteinGoal = Number.isFinite(b.proteinGoal) ? Math.min(Math.max(Math.round(b.proteinGoal), 40), 220) : 100;
  const restrictions = Array.isArray(b.restrictions)
    ? b.restrictions.filter(r => typeof r === 'string').slice(0, 12).map(r => r.slice(0, 40))
    : [];
  const dislikes = typeof b.dislikes === 'string' ? b.dislikes.slice(0, 300) : '';

  const startDay = DAYS[new Date().getDay()];

  const prompt = [
    `Medication: ${med}.`,
    shotDay ? `Injection day: ${shotDay}. Build the week so ${shotDay} is cycle day 1.` : `No injection day given — treat the week as steady, with mild variation.`,
    `Start the plan on ${startDay} and list 7 consecutive days from there.`,
    `Daily protein goal: ${proteinGoal}g.`,
    restrictions.length ? `Dietary restrictions (absolute): ${restrictions.join(', ')}.` : 'No dietary restrictions.',
    dislikes ? `Foods to avoid or dislikes: ${dislikes}.` : '',
    'Return the JSON object now.'
  ].filter(Boolean).join('\n');

  try {
    const doFetch = () => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 7000,
        stream: true,
        system: PLAN_SYSTEM,
        messages: [
          { role: 'user', content: prompt + '\n\nBegin your response with the opening brace of the JSON object.' }
        ]
      })
    });

    let upstream = await doFetch();
    for (let attempt = 0; attempt < 2 && !upstream.ok && (upstream.status === 429 || upstream.status >= 500); attempt++) {
      const ra = parseInt(upstream.headers.get('retry-after') || '0', 10);
      const wait = Math.min((ra > 0 ? ra * 1000 : 2500 * (attempt + 1)), 15000);
      await new Promise(r => setTimeout(r, wait));
      upstream = await doFetch();
    }

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => '');
      console.error('[plan] upstream error', upstream.status, t.slice(0, 300));
      let detail = '';
      try { detail = (JSON.parse(t).error || {}).message || ''; } catch (e) {}
      const friendly = upstream.status === 429
        ? 'The kitchen is at capacity for a moment — wait about a minute and try again.'
        : 'Could not build your plan right now (' + upstream.status + (detail ? ': ' + detail.slice(0, 140) : '') + ').';
      res.status(502).json({ error: friendly });
      return;
    }

    // Pipe the SSE stream straight through — the client assembles the JSON.
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) {
    console.error('[plan] error', String(err && err.message));
    if (!res.headersSent) {
      res.status(500).json({ error: 'Something went wrong building your plan.' });
    } else {
      res.end();
    }
  }
}
