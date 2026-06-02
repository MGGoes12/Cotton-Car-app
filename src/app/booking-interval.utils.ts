import { Booking } from './supabase.service';
import { addDaysToDateString, timeToMinutes } from './time.utils';

export function formatBookingTimeLabel(booking: Pick<Booking, 'all_day' | 'start_time' | 'end_time' | 'overnight'>): string {
  if (booking.all_day) {
    return 'Full day';
  }
  const start = (booking.start_time || '').slice(0, 5);
  const end = (booking.end_time || '').slice(0, 5);
  if (booking.overnight) {
    return `${start} – ${end} (next day)`;
  }
  return `${start} – ${end}`;
}

/** Absolute minute index for overlap checks (day index * 1440 + time). */
export function bookingIntervalMinutes(booking: Pick<Booking, 'booking_date' | 'start_time' | 'end_time' | 'all_day' | 'overnight'>): {
  start: number;
  end: number;
} {
  const dayIndex = dateStringToDayIndex(booking.booking_date);
  const dayStart = dayIndex * 1440;

  if (booking.all_day) {
    return { start: dayStart, end: dayStart + 1440 };
  }

  const start = dayStart + timeToMinutes(booking.start_time);
  const end = booking.overnight
    ? dayStart + 1440 + timeToMinutes(booking.end_time)
    : dayStart + timeToMinutes(booking.end_time);

  return { start, end };
}

export function bookingsOverlap(
  a: Pick<Booking, 'booking_date' | 'start_time' | 'end_time' | 'all_day' | 'overnight' | 'status'>,
  b: Pick<Booking, 'booking_date' | 'start_time' | 'end_time' | 'all_day' | 'overnight' | 'status'>
): boolean {
  if (a.status === 'rejected' || b.status === 'rejected') {
    return false;
  }
  const rangeA = bookingIntervalMinutes(a);
  const rangeB = bookingIntervalMinutes(b);
  return rangeA.start < rangeB.end && rangeB.start < rangeA.end;
}

/** True if this booking should appear on a calendar day cell. */
export function bookingAppliesToCalendarDay(
  booking: Pick<Booking, 'booking_date' | 'overnight' | 'status'>,
  dayValue: string
): boolean {
  if (booking.status === 'rejected' || !dayValue) {
    return false;
  }
  if (booking.booking_date === dayValue) {
    return true;
  }
  if (booking.overnight) {
    return addDaysToDateString(booking.booking_date, 1) === dayValue;
  }
  return false;
}

function dateStringToDayIndex(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T12:00:00`).getTime() / 86400000);
}
