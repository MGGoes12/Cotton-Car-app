-- Run in Supabase SQL editor after rls-policies.sql
-- Settlements, odometer mismatch flags, and related RLS

alter table bookings
  add column if not exists settled_in_settlement_id uuid,
  add column if not exists odometer_mismatch boolean not null default false,
  add column if not exists odometer_mismatch_expected integer,
  add column if not exists odometer_mismatch_actual integer;

create table if not exists settlement_requests (
  id uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references profiles(id) on delete cascade,
  user_email text not null,
  amount numeric(12, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id)
);

create table if not exists settlement_items (
  settlement_id uuid not null references settlement_requests(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  km integer not null,
  rate numeric(8, 2) not null,
  amount numeric(12, 2) not null,
  primary key (settlement_id, booking_id)
);

alter table bookings
  drop constraint if exists bookings_settled_in_settlement_id_fkey;

alter table bookings
  add constraint bookings_settled_in_settlement_id_fkey
  foreign key (settled_in_settlement_id) references settlement_requests(id);

create index if not exists settlement_requests_by_user on settlement_requests(user_profile_id, status);
create index if not exists bookings_odometer_mismatch on bookings(odometer_mismatch) where odometer_mismatch = true;

alter table settlement_requests enable row level security;
alter table settlement_items enable row level security;

drop policy if exists "Users read own settlements" on settlement_requests;
create policy "Users read own settlements"
  on settlement_requests for select
  using (user_profile_id = public.my_profile_id());

drop policy if exists "Users insert own settlements" on settlement_requests;
create policy "Users insert own settlements"
  on settlement_requests for insert
  with check (
    user_profile_id = public.my_profile_id()
    and status = 'pending'
  );

drop policy if exists "Admins read all settlements" on settlement_requests;
create policy "Admins read all settlements"
  on settlement_requests for select
  using (public.is_admin());

drop policy if exists "Admins update settlements" on settlement_requests;
create policy "Admins update settlements"
  on settlement_requests for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Users read own settlement items" on settlement_items;
create policy "Users read own settlement items"
  on settlement_items for select
  using (
    settlement_id in (
      select id from settlement_requests where user_profile_id = public.my_profile_id()
    )
  );

drop policy if exists "Users insert own settlement items" on settlement_items;
create policy "Users insert own settlement items"
  on settlement_items for insert
  with check (
    settlement_id in (
      select id from settlement_requests
      where user_profile_id = public.my_profile_id() and status = 'pending'
    )
  );

drop policy if exists "Admins read all settlement items" on settlement_items;
create policy "Admins read all settlement items"
  on settlement_items for select
  using (public.is_admin());
