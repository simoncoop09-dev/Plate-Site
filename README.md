# Plate — Deployment Guide

This folder is a complete, deployable site:

```
plate-deploy/
├── index.html    ← the full Plate site (Libby chat auto-detects the backend)
├── api/
│   └── chat.js   ← serverless function: hides your API key + streams replies
└── README.md
```

## Deploy in ~15 minutes (Vercel — free tier is fine)

### 1. Get an Anthropic API key
1. Go to https://console.anthropic.com and create an account.
2. Add a payment method under Billing (the API is pay-per-use; a chat like
   Libby costs fractions of a cent per message at this scale — current rates:
   https://docs.claude.com/en/docs/about-claude/pricing).
3. Create an API key and copy it. Never paste this key into the website code.

### 2. Put this folder on GitHub
1. Create a new repository at https://github.com (e.g. `plate-site`).
2. Upload the contents of this folder (index.html, the api folder, this README).

### 3. Deploy on Vercel
1. Go to https://vercel.com and sign up with your GitHub account.
2. Click "Add New → Project" and import your `plate-site` repo.
3. Before deploying, open Environment Variables and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: (your key from step 1)
4. Click Deploy. You'll get a live URL like `plate-site.vercel.app`.

### 4. Custom domain (optional but recommended)
Buy a domain (Namecheap, Cloudflare, etc.) and add it in
Vercel → Project → Settings → Domains. Vercel handles HTTPS automatically.

## How the chat works after deployment
- On your live site, Libby talks to `/api/chat` — your key stays secret on the
  server, and replies **stream in word-by-word**, so long/complex answers can't
  time out.
- If the backend isn't there (e.g. previewing the raw file inside Claude), the
  page automatically falls back to the in-preview API so you can still test.
- The system prompt lives in `api/chat.js` on the server, so visitors can't
  read or tamper with Libby's instructions.

## Before you drive real traffic (important)
- **Replace the placeholder social proof.** The testimonials, "Lost 34 lbs"
  claims, "2,000+ users" count, and "As seen in" press logos are demo
  placeholders. Publishing them as-is is deceptive advertising (FTC rules are
  strict about fake testimonials and health claims). Swap in real ones or
  remove them until you have real ones.
- **Wire up the buttons.** "Start Free Trial" currently goes nowhere. The usual
  pre-launch move: point it at an email waitlist (Tally.so or a Google Form
  takes 10 minutes) so you capture interest before the product exists.
- **Add real Privacy Policy / Terms / Medical Disclaimer pages** (the footer
  links are placeholders). Especially important for a health-adjacent product.
- **Consider rate limiting** `api/chat.js` (e.g. Vercel's rate-limit examples)
  so strangers can't run up your API bill.


---

## What's in this site now

- `index.html` — the landing page, with Libby (AI nutritionist) and the early-access waitlist
- `api/chat.js` — secure streaming backend for Libby (needs `ANTHROPIC_API_KEY`)
- `api/waitlist.js` — collects early-access emails
- `privacy.html`, `terms.html`, `disclaimer.html` — legal pages (TEMPLATES — have a lawyer review before scaling)
- `robots.txt`, `sitemap.xml` — search + AI assistant crawling

## Where waitlist signups go

Every signup is written to your Vercel logs immediately (Project -> Logs -> search "waitlist"),
so it works with zero setup.

To send them somewhere real, add a second environment variable in Vercel:

    WAITLIST_WEBHOOK_URL = <a URL that accepts POST>

Anything works: Formspree, Zapier, Make, Beehiiv, ConvertKit, or a Google Sheet via Apps Script.
The payload is `{ email, source, ts }`.

## Honesty rules baked into this site

- No invented testimonials, user counts, or press logos. Do not add them back.
- Features that don't exist yet are labelled "Coming soon".
- Nothing is for sale yet; every CTA collects an email instead of a payment.

When Premium actually exists, wire the pricing buttons to Stripe Checkout and remove
the "coming soon" pills for whatever has shipped.
