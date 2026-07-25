# Plate — App Store Submission Playbook

Everything needed to take Plate from website to approved iOS app.
The code side is done; the steps below are in order.

## Step 0 — Prerequisites (the only parts Claude can't do)
1. **Apple Developer account** — $99/yr at developer.apple.com. Requires 18+
   (parent enrolls; "Individual" is fine now, switch to the LLC later — the
   LLC route needs a free D-U-N-S number, ~1-2 weeks).
2. **A Mac** (any, borrowed is fine) with Xcode, OR a cloud build service
   (Codemagic has a free tier and supports Capacitor + App Store upload).

## Step 1 — Build the app shell (~30 min on a Mac)
```bash
cd app
npm install
PLATE_SITE_URL=https://YOUR-SITE.vercel.app npm run sync   # pulls the live site into www/
npx cap add ios
npx cap open ios          # opens Xcode
```
In Xcode: set the Team (the Apple account), Bundle ID `com.plate.nutrition`,
and the app icons (use icon-1024 derived from /icon-512.png).

## Step 2 — Why this passes Review guideline 4.2 ("not just a website")
The site already contains a native bridge (see `scheduleNativeReminders` in
index.html). Inside the app it schedules **on-device notifications**:
- Evening before shot day: "Shot day tomorrow — I've planned tomorrow gentle."
- Shot-day morning: check-in reminder.
Mention this in Review Notes. It is genuine native functionality tied to the
core product (the injection-cycle mechanic), not decoration.

## Step 3 — App Store Connect listing
Use the copy in `appstore-listing.md` (name, subtitle, description, keywords,
privacy answers, review notes). Screenshots: run the app in Xcode's simulator
(iPhone 15 Pro Max + iPad Pro) and screenshot: hero, Libby chat, a meal plan
day, the grocery list.

## Step 4 — Payments rule (important, saves 30%)
Ship the app **free with no purchases inside it**. Do not link to pricing or
"upgrade" from within the app, and do not mention the website's subscription
in the app description. When Premium launches, sell it on the website only
(Netflix model). This keeps Apple's IAP rules — and their 30% — entirely out
of scope.

## Step 5 — Submit and iterate
First submissions commonly get one rejection on a small item. Health apps get
extra scrutiny — the medical disclaimers, Libby's dosing refusals, and the
privacy policy already anticipate this. Answer reviewers plainly; turnaround
on resubmission is usually 24-48h.

## Review-risk checklist (all already handled in the product)
- [x] Medical disclaimer page + "not medical advice" in-app language
- [x] AI assistant refuses dosing/medical advice
- [x] Privacy policy live at /privacy.html
- [x] No health claims, invented testimonials, or outcome promises
- [x] 18+ intended audience stated in terms
- [x] Native functionality (cycle notifications)
- [x] All content bundled locally; only API calls go to the network
