# Cotton Car Booking App

A mobile-first Angular booking app for family car access, built for Supabase authentication and data storage, and optimized for Vercel hosting.

## Features

- Supabase auth with email/password flow
- Password reset flow (admin-approved)
- Booking creation with trip types, times, whole-day and overnight options
- Booking approval workflow for admin users
- Odometer capture before and after the trip
- Calendar overview with today highlight
- Trip report by date range with landlord km totals and CSV export
- PWA install support

## Setup

1. Create a Supabase project.
2. Run SQL scripts in order in the Supabase SQL editor:
   - `sql/create-supabase-tables.sql`
   - `sql/add-overnight-column.sql` (if the database already existed)
   - `sql/rls-policies.sql` (**required for security**)
3. Set environment variables (see below).
4. Run `npm install` and `npm start`.

## Environment variables

| Variable | Where | Description |
|----------|--------|-------------|
| `SUPABASE_URL` | Vercel / local shell | Project URL, e.g. `https://xxx.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Vercel / local shell | Anon/public key |

**Do not** expose `SUPABASE_SERVICE_ROLE` in the browser. Admin booking actions use RLS. Create users in Supabase Auth → Users, or add a secure Edge Function later.

For local dev, optional service role can be set in `src/environments/environment.ts` only (never commit real keys).

## Deploy (Vercel)

1. Connect the repo to Vercel.
2. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in project settings.
3. Build command: `npm run build:vercel` (see `vercel.json`).

## Sample users

See `sql/sample-data.sql` and create matching users in Supabase Auth.

## Security notes

- Run `sql/rls-policies.sql` so users can only read/write their own data; admins can manage all bookings.
- Approve/reject and reports use the anon key with RLS — no service role in `index.html`.
