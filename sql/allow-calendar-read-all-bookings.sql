-- Run in Supabase SQL editor if you already applied rls-policies.sql before this change.
-- Lets every signed-in user see all bookings on the shared calendar (My Trips still scoped in the app).

drop policy if exists "Authenticated read all bookings for calendar" on bookings;
create policy "Authenticated read all bookings for calendar"
  on bookings for select
  using (auth.uid() is not null);
