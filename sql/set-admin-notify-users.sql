-- Run in Supabase SQL editor
-- These users receive admin notification emails (new bookings, missing end KMs, etc.)

update profiles
set is_admin = true
where lower(email) in (
  lower('mark@thecottonclub.co.za'),
  lower('lyndsay@lcproofing.co.za')
);

-- Verify:
-- select email, is_admin from profiles where is_admin = true;
