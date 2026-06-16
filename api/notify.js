const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;
  const resendKey = process.env.RESEND_API_KEY || process.env.RESEND_API;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!supabaseUrl || !serviceKey || !resendKey || !fromEmail) {
    return res.status(500).json({ error: 'Email service is not configured on the server.' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }

  const { type, payload } = req.body || {};
  if (!type || !payload) {
    return res.status(400).json({ error: 'Missing notification type or payload' });
  }

  const { data: admins, error: adminError } = await supabase
    .from('profiles')
    .select('email')
    .eq('is_admin', true);

  if (adminError) {
    return res.status(500).json({ error: 'Could not load admin recipients.' });
  }

  const fallback = (process.env.ADMIN_NOTIFY_EMAILS || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);

  const recipients = [...new Set((admins || []).map(a => a.email).concat(fallback))];
  if (!recipients.length) {
    return res.status(500).json({ error: 'No admin email recipients configured.' });
  }

  const subject = buildSubject(type, payload);
  const html = buildHtml(type, payload);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to: recipients,
      subject,
      html
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    return res.status(502).json({ error: 'Resend request failed', detail });
  }

  return res.status(200).json({ ok: true });
};

function buildSubject(type, payload) {
  switch (type) {
    case 'new_booking':
      return `New car booking request — ${payload.userEmail || 'user'}`;
    case 'odometer_mismatch':
      return `Odometer mismatch — ${payload.userEmail || 'user'}`;
    case 'settlement_request':
      return `Settlement request — ${payload.userEmail || 'user'}`;
    case 'missing_prior_end_km':
      return `Missing end KM — ${payload.priorDriverEmail || 'prior driver'}`;
    default:
      return 'Cotton Car Booking notification';
  }
}

function buildHtml(type, payload) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));

  if (type === 'new_booking') {
    return `
      <h2>New booking request</h2>
      <p><strong>User:</strong> ${esc(payload.userEmail)}</p>
      <p><strong>Date:</strong> ${esc(payload.bookingDate)}</p>
      <p><strong>Trip type:</strong> ${esc(payload.reason)}</p>
      <p><strong>Time:</strong> ${esc(payload.timeLabel)}</p>
      <p><strong>Estimated KMs:</strong> ${esc(payload.estimatedKm)}</p>
      <p>Review it in the Cotton Car Booking app under All Bookings.</p>
    `;
  }

  if (type === 'odometer_mismatch') {
    return `
      <h2>Odometer mismatch detected</h2>
      <p><strong>User:</strong> ${esc(payload.userEmail)}</p>
      <p><strong>Trip date:</strong> ${esc(payload.bookingDate)}</p>
      <p><strong>Expected start KM:</strong> ${esc(payload.expectedKm)} (from previous trip end)</p>
      <p><strong>Actual start KM entered:</strong> ${esc(payload.actualKm)}</p>
      <p>Please review the trip in the app.</p>
    `;
  }

  if (type === 'settlement_request') {
    return `
      <h2>Settlement request</h2>
      <p><strong>User:</strong> ${esc(payload.userEmail)}</p>
      <p><strong>Amount:</strong> R ${esc(payload.amount)}</p>
      <p><strong>Trips included:</strong> ${esc(payload.tripCount)}</p>
      <p>Approve or reject it in the Cotton Car Booking app overview.</p>
    `;
  }

  if (type === 'missing_prior_end_km') {
    return `
      <h2>Prior driver has not logged end KMs</h2>
      <p><strong>Current driver:</strong> ${esc(payload.userEmail)} started their trip (${esc(payload.timeLabel)} on ${esc(payload.bookingDate)}) and entered start KM ${esc(payload.actualStartKm)}.</p>
      <p><strong>Prior driver:</strong> ${esc(payload.priorDriverEmail)} has not entered end KMs for their trip (${esc(payload.priorTimeLabel)} on ${esc(payload.priorBookingDate)}).</p>
      <p>Please follow up so odometer readings stay in sync.</p>
    `;
  }

  return `<p>${esc(JSON.stringify(payload))}</p>`;
}
