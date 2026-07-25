// Plate — 7-day meal plan generator
// Returns strict JSON so the front end can render a plan and derive a grocery list.

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
- "how" is ONE short sentence of preparation.
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
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: PLAN_SYSTEM,
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: '{' }   // prefill forces clean JSON
        ]
      })
    });

    if (!upstream.ok) {
      const t = await upstream.text().catch(() => '');
      console.error('[plan] upstream error', upstream.status, t.slice(0, 300));
      res.status(502).json({ error: 'Could not build your plan right now. Please try again.' });
      return;
    }

    const data = await upstream.json();
    let text = (data.content || [])
      .map(bl => (bl.type === 'text' ? bl.text : ''))
      .join('')
      .trim();

    // Strip any stray fencing FIRST, then re-attach the prefill brace
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    if (!text.startsWith('{')) text = '{' + text;

    let plan;
    try {
      plan = JSON.parse(text);
    } catch (e) {
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first !== -1 && last > first) {
        try { plan = JSON.parse(text.slice(first, last + 1)); } catch (e2) { plan = null; }
      }
    }

    if (!plan || !Array.isArray(plan.days) || !plan.days.length) {
      console.error('[plan] unparseable output:', text.slice(0, 400));
      res.status(502).json({ error: 'Your plan came back malformed. Please try again.' });
      return;
    }

    plan.generatedAt = new Date().toISOString();
    plan.proteinGoal = plan.proteinGoal || proteinGoal;
    res.status(200).json(plan);
  } catch (err) {
    console.error('[plan] error', String(err && err.message));
    res.status(500).json({ error: 'Something went wrong building your plan.' });
  }
}
