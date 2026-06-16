import { bookingsOverlap, findPrecedingHandoffBooking, formatBookingTimeLabel, isMissingEndKm } from './booking-interval.utils';
import { Booking } from './supabase.service';

function booking(partial: Partial<Booking>): Booking {
  return {
    user_profile_id: 'u1',
    user_email: 'a@test.com',
    booking_date: '2026-06-01',
    start_time: '09:00',
    end_time: '17:00',
    all_day: false,
    full_evening: false,
    reason: 'Private use',
    expected_start_km: 0,
    status: 'approved',
    ...partial
  };
}

describe('bookingsOverlap', () => {
  it('detects same-day overlap', () => {
    const a = booking({ start_time: '09:00', end_time: '12:00' });
    const b = booking({ booking_date: '2026-06-01', start_time: '11:00', end_time: '14:00' });
    expect(bookingsOverlap(a, b)).toBe(true);
  });

  it('allows adjacent non-overlapping slots', () => {
    const a = booking({ start_time: '09:00', end_time: '12:00' });
    const b = booking({ start_time: '12:00', end_time: '14:00' });
    expect(bookingsOverlap(a, b)).toBe(false);
  });

  it('detects overnight overlap into next morning', () => {
    const overnight = booking({
      start_time: '22:00',
      end_time: '06:00',
      overnight: true
    });
    const morning = booking({
      booking_date: '2026-06-02',
      start_time: '07:00',
      end_time: '09:00'
    });
    expect(bookingsOverlap(overnight, morning)).toBe(true);
  });

  it('ignores rejected bookings', () => {
    const a = booking({ status: 'rejected' });
    const b = booking({ start_time: '10:00', end_time: '11:00' });
    expect(bookingsOverlap(a, b)).toBe(false);
  });

  it('ignores completed full day when booking evening slot', () => {
    const done = booking({
      all_day: true,
      start_time: '06:00',
      end_time: '17:00',
      status: 'completed'
    });
    const evening = booking({
      booking_date: '2026-06-01',
      full_evening: true,
      start_time: '17:00',
      end_time: '22:00',
      status: 'pending'
    });
    expect(bookingsOverlap(done, evening)).toBe(false);
  });

  it('blocks midday when full day still approved', () => {
    const active = booking({ all_day: true, start_time: '06:00', end_time: '17:00', status: 'approved' });
    const midday = booking({ start_time: '10:00', end_time: '11:00' });
    expect(bookingsOverlap(active, midday)).toBe(true);
  });

  it('allows evening when full day still approved', () => {
    const active = booking({ all_day: true, start_time: '06:00', end_time: '17:00', status: 'approved' });
    const evening = booking({ full_evening: true, start_time: '17:00', end_time: '22:00' });
    expect(bookingsOverlap(active, evening)).toBe(false);
  });

  it('blocks overlap within full evening window', () => {
    const evening = booking({ full_evening: true, start_time: '17:00', end_time: '22:00', status: 'approved' });
    const slot = booking({ start_time: '18:00', end_time: '19:00' });
    expect(bookingsOverlap(evening, slot)).toBe(true);
  });
});

describe('findPrecedingHandoffBooking', () => {
  it('finds overnight driver before next timed booking', () => {
    const daniel = booking({
      id: 'daniel',
      user_email: 'daniel@test.com',
      booking_date: '2026-06-16',
      start_time: '14:00',
      end_time: '10:00',
      overnight: true,
      status: 'approved'
    });
    const david = booking({
      id: 'david',
      user_email: 'david@test.com',
      booking_date: '2026-06-17',
      start_time: '10:00',
      end_time: '14:00',
      status: 'approved'
    });
    const prior = findPrecedingHandoffBooking([daniel, david], david);
    expect(prior?.user_email).toBe('daniel@test.com');
    expect(isMissingEndKm(daniel)).toBe(true);
  });
});

describe('formatBookingTimeLabel', () => {
  it('formats full day and full evening', () => {
    expect(formatBookingTimeLabel({ all_day: true, full_evening: false, start_time: '06:00', end_time: '17:00', overnight: false }))
      .toBe('Full day (6am–5pm)');
    expect(formatBookingTimeLabel({ all_day: false, full_evening: true, start_time: '17:00', end_time: '22:00', overnight: false }))
      .toBe('Full evening (5pm–10pm)');
  });

  it('formats overnight trips', () => {
    expect(
      formatBookingTimeLabel({
        all_day: false,
        full_evening: false,
        start_time: '22:00:00',
        end_time: '07:00:00',
        overnight: true
      })
    ).toBe('22:00 – 07:00 (next day)');
  });
});
