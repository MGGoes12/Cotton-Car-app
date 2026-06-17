import { Booking } from './supabase.service';
import {
  FULL_DAY_END,
  FULL_DAY_START,
  FULL_EVENING_END,
  FULL_EVENING_START
} from './booking.constants';
import { addDaysToDateString, timeToMinutes } from './time.utils';

type BookingSlot = Pick<
  Booking,
  'booking_date' | 'start_time' | 'end_time' | 'all_day' | 'full_evening' | 'overnight'
>;

export function formatBookingTimeLabel(
  booking: Pick<Booking, 'all_day' | 'full_evening' | 'start_time' | 'end_time' | 'overnight'>
): string {
  if (booking.all_day) {
    return 'Full day (6am–5pm)';
  }
  if (booking.full_evening) {
    return 'Full evening (5pm–10pm)';
  }
  const start = (booking.start_time || '').slice(0, 5);
  const end = (booking.end_time || '').slice(0, 5);
  if (booking.overnight) {
    return `${start} – ${end} (next day)`;
  }
  return `${start} – ${end}`;
}

/** Absolute minute index for overlap checks (day index * 1440 + time). */
export function bookingIntervalMinutes(booking: BookingSlot): { start: number; end: number } {
  const dayIndex = dateStringToDayIndex(booking.booking_date);
  const dayStart = dayIndex * 1440;

  if (booking.all_day) {
    return {
      start: dayStart + timeToMinutes(FULL_DAY_START),
      end: dayStart + timeToMinutes(FULL_DAY_END)
    };
  }

  if (booking.full_evening) {
    return {
      start: dayStart + timeToMinutes(FULL_EVENING_START),
      end: dayStart + timeToMinutes(FULL_EVENING_END)
    };
  }

  const start = dayStart + timeToMinutes(booking.start_time);
  const end = booking.overnight
    ? dayStart + 1440 + timeToMinutes(booking.end_time)
    : dayStart + timeToMinutes(booking.end_time);

  return { start, end };
}

export function bookingsOverlap(
  a: Pick<Booking, 'booking_date' | 'start_time' | 'end_time' | 'all_day' | 'full_evening' | 'overnight' | 'status'>,
  b: Pick<Booking, 'booking_date' | 'start_time' | 'end_time' | 'all_day' | 'full_evening' | 'overnight' | 'status'>
): boolean {
  if (a.status === 'rejected' || b.status === 'rejected') {
    return false;
  }
  if (a.status === 'completed' || b.status === 'completed') {
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

type HandoffBooking = Pick<
  Booking,
  'id' | 'booking_date' | 'start_time' | 'end_time' | 'all_day' | 'full_evening' | 'overnight' | 'status' | 'user_email' | 'actual_end_km'
>;

/** Booking that should have returned the car immediately before this trip starts. */
export function findPrecedingHandoffBooking(all: HandoffBooking[], current: HandoffBooking): HandoffBooking | null {
  if (!current.id) return null;

  const currentStart = bookingIntervalMinutes(current).start;
  let best: HandoffBooking | null = null;
  let bestEnd = -Infinity;

  for (const b of all) {
    if (b.id === current.id || b.status === 'rejected' || b.status === 'pending') continue;
    const { end } = bookingIntervalMinutes(b);
    if (end <= currentStart && end > bestEnd) {
      best = b;
      bestEnd = end;
    }
  }

  return best;
}

export function isMissingEndKm(booking: Pick<Booking, 'status' | 'actual_end_km'>): boolean {
  return booking.actual_end_km == null;
}
