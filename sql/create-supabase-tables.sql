-- Supabase SQL schema for Cotton Car Booking

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  email text not null unique,
  full_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references profiles(id) on delete cascade,
  user_email text not null,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  all_day boolean not null default false,
  full_evening boolean not null default false,
  overnight boolean not null default false,
  reason text not null,
  expected_start_km int not null,
  actual_start_km int,
  actual_end_km int,
  return_time time,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  booking_range tsrange generated always as (
    case
      when all_day then tsrange(
        booking_date + time '06:00',
        booking_date + time '17:00',
        '[)'
      )
      when full_evening then tsrange(
        booking_date + time '17:00',
        booking_date + time '22:00',
        '[)'
      )
      when overnight then tsrange(
        booking_date + start_time,
        booking_date + interval '1 day' + end_time,
        '[)'
      )
      else tsrange(booking_date + start_time, booking_date + end_time, '[)')
    end
  ) stored,
  check (status in ('pending', 'approved', 'rejected', 'completed'))
);

alter table bookings
  add constraint no_overlapping_bookings
  exclude using gist (
    booking_date with =,
    booking_range with &&
  ) where (status in ('pending', 'approved'));

create index bookings_by_user_date on bookings(user_profile_id, booking_date);
create index bookings_by_status_date on bookings(status, booking_date);

create function update_timestamp() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger bookings_updated_at
  before update on bookings
  for each row execute function update_timestamp();

-- Password reset requests (admin-approval flow, no email)
create table password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  temp_password text,
  created_at timestamptz not null default now()
);

-- Allow unauthenticated users to insert reset requests and read their own status
-- Run these in the Supabase SQL editor after creating the table:
--
--   alter table password_reset_requests enable row level security;
--
--   create policy "Anyone can request a reset"
--     on password_reset_requests for insert
--     with check (true);
--
--   create policy "Anyone can read reset status by email"
--     on password_reset_requests for select
--     using (true);
--
--   create policy "Service role can update"
--     on password_reset_requests for update
--     using (true);
