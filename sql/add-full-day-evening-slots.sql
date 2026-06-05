-- Run in Supabase SQL editor after create-supabase-tables.sql / add-overnight-column.sql
-- Full day = 6am–5pm, full evening = 5pm–10pm (stored on booking_range for overlap checks)

alter table bookings
  add column if not exists full_evening boolean not null default false;

alter table bookings drop constraint if exists no_overlapping_bookings;
alter table bookings drop column if exists booking_range;

alter table bookings
  add column booking_range tsrange generated always as (
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
  ) stored;

alter table bookings
  add constraint no_overlapping_bookings
  exclude using gist (
    booking_date with =,
    booking_range with &&
  ) where (status in ('pending', 'approved'));
