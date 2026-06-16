-- Sample profile data for family users

insert into profiles (email, full_name, is_admin) values
  ('mark@thecottonclub.co.za', 'Mark', true),
  ('david@thecottonclub.co.za', 'David', false),
  ('lyndsay@lcproofing.co.za', 'Lyndsay', true);

-- Example booking for testing. Note: use a real date when inserting.
insert into bookings (
  user_profile_id,
  user_email,
  booking_date,
  start_time,
  end_time,
  all_day,
  reason,
  expected_start_km,
  status
) values (
  (select id from profiles where email = 'mark@thecottonclub.co.za'),
  'mark@thecottonclub.co.za',
  current_date + 1,
  '09:00',
  '12:00',
  false,
  'School run and shopping',
  15000,
  'approved'
);
