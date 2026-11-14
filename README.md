# Nihon Sar Loat

Nihon Sar Loat is a Next.js study workspace for JLPT N2 learners.

## Run locally

Use Node.js 22.18 or later. Install dependencies with `npm ci` and copy `.env.example` to `.env.local`.

1. Open your Nihon Sar Loat project in Supabase. Apply the SQL files in `supabase/migrations` once in filename order using the SQL Editor.
2. In **Connect**, choose **Session pooler** and copy the PostgreSQL connection string into `DATABASE_URL`. Replace the password placeholder with your URL-encoded database password. The web app and worker both use this server-only setting. If Node reports a certificate-chain error, download the CA from **Database Settings → SSL Configuration** and set `NIHON_DATABASE_CA_FILE` to its path. This applies to both pooler and direct connections. Restart the app and worker after changing it. [Supabase TLS setup](https://supabase.com/docs/guides/database/psql)
3. Set `NIHON_DEV_EMAIL_LINKS=1` to display verification and reset links in the app on localhost. Enter your Groq key to enable PDF imports and generated reading.

Run this command from the project root. It starts both Next.js and the PDF worker.

```sh
npm run dev
```

Open [the local app](http://localhost:3000). The worker processes queued PDF pages and removes expired imports. Manual entry, flashcards, and library browsing work without Groq.

The terminal shows `[PDF worker] Ready to process queued PDFs.` once the worker can access the database and has a Groq key configured. If you change the database URI or Groq key, restart `npm run dev`. Open a queued import again or use **Refresh status** to resume checking its progress.

## Transfer an existing SQLite library

Stop the old app and worker, apply the schema to the new PostgreSQL database, then run `npm run db:import-sqlite` before creating accounts there. The command reads `.nihon-data/study.sqlite` by default. To choose another file, append `-- "path/to/study.sqlite"`.

The transfer preserves account verification, password hashes, study history, and active imports. Learners sign in again and can request fresh verification or password reset links. The command leaves the source file intact and rolls back on transfer errors. Keep the SQLite file as a backup until you verify the new workspace.

## Configure a hosted instance

- Set `GROQ_API_KEY` and choose a strict Structured Outputs model with `GROQ_MODEL`. Benchmark the model with permission-cleared study pages and Japanese reading samples before the pilot.
- Set `RESEND_API_KEY`, `NIHON_EMAIL_FROM` to a verified sender, and `NIHON_ORIGIN` to the app’s HTTPS origin. Keep `NIHON_DEV_EMAIL_LINKS` disabled.
- Run `npm run build`, then run `npm start` and `npm run worker` as supervised processes with the same `DATABASE_URL`. PostgreSQL stores study records and temporary PDF uploads in the private `nihon_private` schema. Keep the connection string server-side. Configure the reverse proxy to accept 50 MB PDF uploads and allow at least 100 seconds for reading generation. Confirm the applicable Groq retention settings before accepting learner uploads.

Provider setup details are available in the [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres), [Groq Structured Outputs documentation](https://console.groq.com/docs/structured-outputs), and [Resend email API reference](https://resend.com/docs/api-reference/emails/send-email).
