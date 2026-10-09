# Personal Finance Tracker

Next.js, React, TypeScript, and Bootstrap. Requires Node.js 22.13.1 and npm 10.9.2.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Copy `.env.example` to `.env.local` and set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Never use a secret/service-role key.
Set `SITE_URL=http://localhost:3000` locally. In Supabase Auth → URL Configuration,
set Site URL to that address and allow `http://localhost:3000/auth/callback` and
`http://localhost:3000/auth/callback?next=/auth/reset-password`.
Open confirmation/reset links in the browser that requested them. Default Supabase
email delivery is restricted; custom SMTP is needed for other recipients.

The migrations are already applied to the connected development project.
For a fresh project, run the SQL in `supabase/migrations/` in filename order. It creates private tables with
row-level security. The workspace requires a confirmed account.

```sh
npm run check   # Formatting, lint, TypeScript, and essential tests
npm test        # Finance and CSV tests
npm run format  # Apply formatting
npm run build  # Production build
npm start      # Serve the production build
```

CSV import accepts UTF-8 exports up to 512 KB / 1,000 rows. Map dates and signed
amounts or debit/credit columns, review categories and duplicates, then confirm.
Transfers use manual entry. Raw CSV files are not stored.

`npm run test:e2e` uses installed Google Chrome. Set `E2E_TEST_EMAIL` and
`E2E_TEST_PASSWORD` to a disposable, confirmed Supabase test account ending in
`@example.invalid` to include the signed-in flow. It writes fictional test data;
use a fresh test account for each run. Without these variables, only public-route
and authentication validation checks run.

Saved financial records live in Supabase and persist when the local server stops.
For later hosting, use a Next.js Node/serverless host with the same environment
variables, set `SITE_URL` to its HTTPS address, and update Supabase Auth’s Site URL
and callback allowlist. Choose email delivery and a database backup plan before
using real financial data. The hosted app uses the same Supabase records as local development.

Plaid uses manual sync and a review queue at `/banks`. Set server-only
`PLAID_CLIENT_ID`, `PLAID_SECRET` (Sandbox key), `PLAID_ENV=sandbox`, and
`PLAID_TOKEN_ENCRYPTION_KEY` (64 hexadecimal characters; generate with
`openssl rand -hex 32`). Keep the encryption key backed up and identical locally
and on Vercel; replacing it makes saved bank tokens unreadable. Allow
`http://localhost:3000/banks` and your hosted HTTPS `/banks` URL in Plaid’s
Dashboard → Developers → API → Allowed redirect URIs. Never prefix these secrets
with `NEXT_PUBLIC_` or commit them. Sandbox uses fictional data.

For real banks, obtain Plaid’s free Trial approval first, then use its Production
secret, `PLAID_ENV=production`, and `PLAID_FREE_TRIAL_APPROVED=true`. The Trial
allows 10 total Production Items; disconnecting does not restore that allowance.
No paid plan is required or enabled by this app. Map bank accounts to existing
tracker accounts, sync, then review posted USD transactions. Bank corrections
and removals require confirmation; pending transactions are excluded. Sync
does not run in the background. Disconnect revokes bank access and keeps
imported ledger entries. Manual/CSV duplicates are flagged by account, date,
amount, and type; separate identical transactions need explicit confirmation.
