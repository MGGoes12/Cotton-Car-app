# Vercel Environment Variables Setup

## Required variables (client app)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL (`https://your-project.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase **anon public** key |

These are injected into the Angular bundle at build time via `scripts/inject-env.js`.

## Required variables (email API — server only)

Add these in Vercel for **Production** (and Preview if needed). They are used by `api/notify.js` only — never put them in `index.html`.

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_ROLE` | Supabase service role key (validates user tokens + loads admin emails) |
| `RESEND_API_KEY` or `RESEND_API` | API key from [resend.com](https://resend.com) |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `Cotton Car Booking <bookings@thecottonclub.co.za>` |
| `ADMIN_NOTIFY_EMAILS` | **Optional** fallback only — normally leave empty; admins come from Supabase `profiles.is_admin` |

Admin recipients are loaded from **Supabase**, not Vercel:

```sql
select email from profiles where is_admin = true;
```

Run `sql/set-admin-notify-users.sql` to mark Mark and Lyndsay as admins.

## Resend setup (step by step)

1. **Sign in** at [resend.com](https://resend.com) (your account is linked to GitHub / `mark@thecottonclub.co.za`).

2. **Verify your domain** (recommended for production):
   - Resend dashboard → **Domains** → **Add domain** → `thecottonclub.co.za`
   - Add the DNS records Resend shows (SPF, DKIM, etc.) at your domain host
   - Wait until status is **Verified**

3. **Create an API key**:
   - **API Keys** → **Create API Key**
   - Name it e.g. `cotton-car-booking`
   - Copy the key (starts with `re_`)

4. **Choose a from address**:
   - Production: `Cotton Car Booking <bookings@thecottonclub.co.za>` (must use verified domain)
   - Testing only: Resend allows sending to your own email from `onboarding@resend.dev` until the domain is verified

5. **Add env vars in Vercel**:
   - Project → **Settings** → **Environment Variables**
   - Add all variables from the tables above
   - **Redeploy** (env changes do not apply to old deployments)

6. **Ensure admins exist in Supabase**:
   - `profiles.is_admin = true` for users who should receive emails
   - Or set `ADMIN_NOTIFY_EMAILS=mark@thecottonclub.co.za`

## What triggers emails

| Event | When |
|-------|------|
| New booking | User submits a booking request |
| Odometer mismatch | User’s start KM ≠ end KM of their previous completed trip |
| Missing prior end KM | Next driver saves start KM but previous driver has not logged end KM |
| Settlement request | User requests to settle their balance |

## Supabase SQL (run once)

After existing migrations, run in order:

1. `sql/rls-policies.sql`
2. `sql/add-settlements-and-alerts.sql`

## Do not add to client bundle

- **`RESEND_API_KEY`** — server only (`api/notify.js`)
- **`SUPABASE_SERVICE_ROLE`** — server only for email API; optional in local `environment.ts` for user management only

## How the client build works

1. `npm run build:vercel` runs the Angular production build.
2. `scripts/inject-env.js` replaces placeholders in `dist/.../index.html` with `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
3. Vercel serves the static app and routes `/api/*` to serverless functions.

## Supabase credentials

1. [Supabase Dashboard](https://app.supabase.com) → your project → **Settings** → **API**
2. Copy **Project URL** → `SUPABASE_URL`
3. Copy **anon public** key → `SUPABASE_PUBLISHABLE_KEY`
4. Copy **service_role** key → Vercel only (`SUPABASE_SERVICE_ROLE`)

## After deploy

Run `sql/add-settlements-and-alerts.sql` in Supabase if you have not already, so settlements and odometer flags work.
