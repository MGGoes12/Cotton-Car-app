import { isLandlordTrip } from './booking.constants';
import { Booking } from './supabase.service';

export const PRIVATE_RATE = 1;
export const STUDENT_RATE = 0.4;

export interface TripCharge {
  booking: Booking;
  km: number;
  rate: number;
  amount: number;
}

export function isStudentTrip(reason: string | undefined | null): boolean {
  return (reason || '').trim().toLowerCase().startsWith('student use');
}

export function isPrivateTrip(reason: string | undefined | null): boolean {
  return (reason || '').trim().toLowerCase().startsWith('private use');
}

export function tripDistanceKm(booking: Pick<Booking, 'actual_start_km' | 'actual_end_km'>): number | null {
  if (booking.actual_start_km == null || booking.actual_end_km == null) {
    return null;
  }
  return booking.actual_end_km - booking.actual_start_km;
}

export function tripRatePerKm(reason: string | undefined | null): number {
  if (isLandlordTrip(reason)) return 0;
  if (isStudentTrip(reason)) return STUDENT_RATE;
  if (isPrivateTrip(reason)) return PRIVATE_RATE;
  return PRIVATE_RATE;
}

export function tripChargeAmount(booking: Booking): number {
  const km = tripDistanceKm(booking);
  if (km == null || km <= 0) return 0;
  return roundMoney(km * tripRatePerKm(booking.reason));
}

export function isBillableCompletedTrip(booking: Booking): boolean {
  return booking.status === 'completed'
    && !booking.settled_in_settlement_id
    && !isLandlordTrip(booking.reason)
    && tripDistanceKm(booking) != null
    && tripDistanceKm(booking)! > 0;
}

export function buildTripCharges(bookings: Booking[]): TripCharge[] {
  return bookings
    .filter(isBillableCompletedTrip)
    .map(booking => {
      const km = tripDistanceKm(booking)!;
      const rate = tripRatePerKm(booking.reason);
      return { booking, km, rate, amount: roundMoney(km * rate) };
    });
}

export function totalDebtFromBookings(bookings: Booking[]): number {
  return roundMoney(buildTripCharges(bookings).reduce((sum, t) => sum + t.amount, 0));
}

export function formatRand(amount: number): string {
  return `R ${amount.toFixed(2)}`;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
