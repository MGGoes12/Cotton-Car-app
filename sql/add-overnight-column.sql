-- Run in Supabase SQL editor if bookings table already exists

alter table bookings
  add column if not exists overnight boolean not null default false;

alter table bookings drop constraint if exists no_overlapping_bookings;

alter table bookings drop column if exists booking_range;

alter table bookings
  add column booking_range tsrange generated always as (
    case
      when all_day then tsrange(booking_date::timestamp, (booking_date + 1)::timestamp, '[)')
      when overnight then tsrange(
        booking_date + start_time,
        booking_date + interval '1 day' + end_time,
        '[)'
      )
      else tsrange(booking_date + start_time, booking_date + end_time, '[)')
    end
  ) stored;

alter table bookings
  add constraint no_overlapping_bookings
  exclude using gist (
    booking_date with =,
    booking_range with &&
  ) where (status in ('pending', 'approved'));
