# Portfolio Dashboard

Live portfolio value dashboard for Bursa Malaysia + US holdings, with prices kept
server-side so no API keys are ever visible to anyone viewing the page.

## Before you deploy

**Regenerate your API keys.** The Twelve Data key and iTick token used during testing
were shared in chat, so treat them as compromised:
- Twelve Data: dashboard → API Keys → regenerate
- iTick: dashboard → regenerate token

You'll enter the *new* keys as environment variables in step 3 below — never in the code.

## Deploy to Vercel (free tier is enough for this)

1. **Install the Vercel CLI** (skip if you already have it):
   ```
   npm install -g vercel
   ```

2. **From this folder, log in and deploy:**
   ```
   vercel login
   vercel
   ```
   Follow the prompts (accept defaults). This creates a preview deployment.

3. **Add your API keys as environment variables** (do this in the Vercel dashboard,
   not in any file):
   - Go to your project on vercel.com → Settings → Environment Variables
   - Add `TWELVE_DATA_KEY` with your new Twelve Data key
   - Add `ITICK_TOKEN` with your new iTick token
   - Redeploy so the function picks them up:
     ```
     vercel --prod
     ```

4. **Set up storage for holdings** (so your portfolio persists instead of resetting
   on every reload). Vercel's old standalone "KV" product has been retired — the
   equivalent today is an **Upstash Redis** database, installed through the Vercel
   Marketplace:
   - In your Vercel project dashboard, go to **Storage** → **Marketplace Database
     Integrations** (or visit vercel.com/marketplace and search "Upstash")
   - Install the **Upstash** integration, choose **Redis**
   - Create a database (the free tier is enough for this) and connect it to this project
   - Vercel automatically adds the required environment variables — you don't need
     to set these yourself
   - Redeploy once more:
     ```
     vercel --prod
     ```

5. **You'll get a URL** like `https://your-project.vercel.app` — that's the link you
   can share. The dashboard calls `/api/prices` and `/api/holdings` on the same domain,
   so no separate backend hosting is needed.

## Local testing (optional)

```
vercel dev
```
This runs both the frontend and the `/api/prices` function locally, reading keys from
a `.env` file if you create one (add `TWELVE_DATA_KEY=...` and `ITICK_TOKEN=...` —
make sure `.env` is in `.gitignore` and never committed).

## What's still manual / editable in the dashboard

- Holdings (symbol, quantity, avg cost) are now saved to Upstash Redis, so they persist
  across reloads and across visits — as long as you've completed step 4 above.
- All holdings currently share one saved portfolio (no per-customer separation yet).
  That's the natural next step once you're ready for customers to have their own views.
- Prices refresh every 30 seconds automatically, or on demand via the Refresh button.
