-- Run in Supabase SQL editor if you already applied add-settlements-and-alerts.sql

alter table bookings
  add column if not exists odometer_mismatch_resolved boolean not null default false;

create index if not exists bookings_unresolved_odometer_mismatch
  on bookings (booking_date desc)
  where odometer_mismatch = true and odometer_mismatch_resolved = false;
