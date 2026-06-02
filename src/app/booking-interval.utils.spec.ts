import { bookingsOverlap, formatBookingTimeLabel } from './booking-interval.utils';
import { Booking } from './supabase.service';

function booking(partial: Partial<Booking>): Booking {
  return {
    user_profile_id: 'u1',
    user_email: 'a@test.com',
    booking_date: '2026-06-01',
    start_time: '09:00',
    end_time: '17:00',
    all_day: false,
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
});

describe('formatBookingTimeLabel', () => {
  it('formats overnight trips', () => {
    expect(
      formatBookingTimeLabel({
        all_day: false,
        start_time: '22:00:00',
        end_time: '07:00:00',
        overnight: true
      })
    ).toBe('22:00 – 07:00 (next day)');
  });
});
