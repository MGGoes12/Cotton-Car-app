export const BOOKING_REASONS = [
  'Student use',
  'Private use',
  'Landlord trip'
] as const;

export type BookingReason = (typeof BOOKING_REASONS)[number];

export const LANDLORD_TRIP_REASON: BookingReason = 'Landlord trip';

export function isLandlordTrip(reason: string | undefined | null): boolean {
  return (reason || '').trim().toLowerCase() === LANDLORD_TRIP_REASON.toLowerCase();
}

export const REJECTED_VISIBLE_DAYS = 7;
