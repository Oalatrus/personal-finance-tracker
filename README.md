# Personal Finance Tracker

Next.js, React, TypeScript, and Bootstrap. Requires Node.js 22.13.1 and npm 10.9.2.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Copy `.env.example` to `.env.local` and set your
Supabase project URL and publishable key. Never use a secret/service-role key.
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
