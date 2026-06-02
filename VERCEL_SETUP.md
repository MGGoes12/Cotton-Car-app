# Vercel Environment Variables Setup

## Required variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL (`https://your-project.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase **anon public** key |

## Setting up on Vercel

1. Open your project on [vercel.com](https://vercel.com/dashboard).
2. **Settings** → **Environment Variables**.
3. Add both variables for **Production** (and Preview if you use it).
4. Redeploy the latest deployment.

## How it works

1. `npm run build:vercel` runs the Angular production build.
2. `scripts/inject-env.js` replaces placeholders in `dist/.../index.html` with your env values.
3. The app reads `window.__env__` at runtime via `src/environments/environment.ts`.

## Do not add

- **`SUPABASE_SERVICE_ROLE`** — must never be injected into the client bundle. Admin booking operations use Row Level Security instead.

## Supabase credentials

1. [Supabase Dashboard](https://app.supabase.com) → your project → **Settings** → **API**
2. Copy **Project URL** → `SUPABASE_URL`
3. Copy **anon public** key → `SUPABASE_PUBLISHABLE_KEY`

## After deploy

Run `sql/rls-policies.sql` in Supabase if you have not already, so approve/reject and reports work for admin users.
