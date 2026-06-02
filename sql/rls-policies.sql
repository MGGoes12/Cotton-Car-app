-- Run in Supabase SQL editor after create-supabase-tables.sql
-- Secures bookings and profiles using Row Level Security

alter table profiles enable row level security;
alter table bookings enable row level security;

-- Helper: current user is admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from profiles where auth_user_id = auth.uid() limit 1),
    false
  );
$$;

create or replace function public.my_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles where auth_user_id = auth.uid() limit 1;
$$;

-- ---------- profiles ----------
drop policy if exists "Users read own profile" on profiles;
create policy "Users read own profile"
  on profiles for select
  using (auth_user_id = auth.uid());

drop policy if exists "Admins read all profiles" on profiles;
create policy "Admins read all profiles"
  on profiles for select
  using (public.is_admin());

drop policy if exists "Users update own profile" on profiles;
create policy "Users update own profile"
  on profiles for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ---------- bookings ----------
drop policy if exists "Users read own bookings" on bookings;
create policy "Users read own bookings"
  on bookings for select
  using (user_profile_id = public.my_profile_id());

drop policy if exists "Admins read all bookings" on bookings;
create policy "Admins read all bookings"
  on bookings for select
  using (public.is_admin());

drop policy if exists "Users insert own bookings" on bookings;
create policy "Users insert own bookings"
  on bookings for insert
  with check (
    user_profile_id = public.my_profile_id()
    and status = 'pending'
  );

drop policy if exists "Users update own trip data" on bookings;
create policy "Users update own trip data"
  on bookings for update
  using (
    user_profile_id = public.my_profile_id()
    and status in ('approved', 'pending')
  )
  with check (user_profile_id = public.my_profile_id());

drop policy if exists "Admins update booking status" on bookings;
create policy "Admins update booking status"
  on bookings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- password_reset_requests (optional table) ----------
alter table password_reset_requests enable row level security;

drop policy if exists "Anyone can request reset" on password_reset_requests;
create policy "Anyone can request reset"
  on password_reset_requests for insert
  with check (true);

drop policy if exists "Read reset by email" on password_reset_requests;
create policy "Read reset by email"
  on password_reset_requests for select
  using (true);

drop policy if exists "Admins update resets" on password_reset_requests;
create policy "Admins update resets"
  on password_reset_requests for update
  using (public.is_admin());
