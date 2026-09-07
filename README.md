# The Bag Index

Value-retention briefs for luxury handbags. Enter a bag and a client horizon; the app researches
resale and auction data, house financials, ownership / M&A / supply chain, the creative director,
and social momentum (TikTok, Instagram, Pinterest, search), then scores the bag on five weighted
layers and renders a sourced, client-ready brief.

Built with Next.js and the Claude API. The rubric that makes the calls lives in `src/lib/rubric.ts`
and is the product's core IP. Everything else is plumbing.

## How it works

1. **Research** (`src/lib/research.ts`): one Claude call with server-side web search builds an
   evidence dossier under eight required headings (retail price, resale, house results, ownership
   and M&A, supply chain, creative director, social momentum, macro).
2. **Score** (`src/lib/score.ts`): a second Claude call reads only that dossier and returns a
   structured JSON brief (structured outputs guarantee the shape; the composite is recomputed
   from the weights in code).
3. **Save + render**: the brief is stored in Supabase (or in memory in local dev) and rendered
   at `/brief/<id>`, which is the page you share with a client.

## Run it locally

You need Node.js 20 or newer. Install it from https://nodejs.org (the LTS download), then:

```bash
cd ~/Desktop/bag-index
npm install
cp .env.example .env.local
# open .env.local and paste your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000.

## Deploy it (Vercel, free tier)

1. Push this folder to a GitHub repository.
   ```bash
   cd ~/Desktop/bag-index
   git init && git add -A && git commit -m "The Bag Index v0.1"
   gh repo create bag-index --private --source=. --push
   ```
2. Go to https://vercel.com, "Add New Project", import the repo. Framework is auto-detected.
3. In the project's Environment Variables add `ANTHROPIC_API_KEY`, and optionally `ACCESS_CODE`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Deploy. Research turns can run two to four minutes; `maxDuration = 300` is set on the API route,
   which needs Vercel's Fluid Compute (on by default for new projects). If a brief times out at 60s,
   check that setting in Project Settings → Functions.

## The tracker (Katie's Fashion Data Lab)

The analyst reads a sourced evidence dossier from `data/tracker.db` (a read-only copy of the
Fashion Data Lab SQLite database) before it searches the web. Locally it prefers the live Desktop
copy. Before each deploy run `npm run sync-tracker` and commit the refreshed `data/tracker.db`.
Set `TRACKER_DB_PATH` to override.

## Persistent storage (Supabase, free tier)

1. Create a project at https://supabase.com.
2. Open the SQL editor, paste `supabase/schema.sql`, run it.
3. Copy the project URL and the **service role** key (Settings → API) into your env vars.
   The service-role key is server-only; never expose it in client code.

## Pilot access

Set `ACCESS_CODE` to any string and share it with pilot users. Every page and API route is gated
until the code is entered once (30-day cookie). Leave it blank to open the app.

## Cost

Each brief makes two Claude calls. At Claude Opus 5 list pricing ($5 / $25 per million input /
output tokens) a brief that reads ~60k tokens of search results and writes ~8k tokens costs
roughly $0.50. The `usage` column in the database records the real number per brief.

## What's deliberately not here yet

- **Payments.** Stripe Checkout + a `customers` table is the next step once a pilot user says
  they would pay. Don't build billing before that.
- **Accounts.** The passcode gate is enough for a pilot. Replace with Supabase Auth or Clerk when
  there are more than a handful of users.
- **Your own data layer.** The Fashion Data Lab database on the Desktop (Google Trends time-series,
  scored briefs) can be exposed to the research step as a custom tool so the model reads your
  proprietary history alongside web search. That is where the moat compounds.
- **Refusal fallbacks.** For hardening, the research call can pass Anthropic's server-side
  `fallbacks: "default"` (beta header `server-side-fallback-2026-07-01`) so a rare policy decline
  is re-run on a fallback model automatically. Refusals on this content are very unlikely.

## Legal

Every brief ends with: *"This is value-retention analysis based on public market data, not
investment advice. Past resale performance does not guarantee future results."* Keep that line in
the interface. Before charging, get a lawyer's read on terms of service and on how resale-platform
report data may be reused in a paid product.
