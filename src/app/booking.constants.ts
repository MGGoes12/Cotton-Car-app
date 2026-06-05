export const BOOKING_REASONS = [
  'Student use',
  'Private use',
  'Landlord trip'
] as const;

export type BookingReason = (typeof BOOKING_REASONS)[number];

export const FULL_DAY_START = '06:00';
export const FULL_DAY_END = '17:00';
export const FULL_EVENING_START = '17:00';
export const FULL_EVENING_END = '22:00';

export const TRIP_TYPE_HINTS: Partial<Record<BookingReason, string>> = {
  'Student use': 'Student trips relate directly with studies and are not for personal use.',
  'Private use': 'Private trips are for personal outings.'
};

export const LANDLORD_TRIP_REASON: BookingReason = 'Landlord trip';

export function isLandlordTrip(reason: string | undefined | null): boolean {
  return (reason || '').trim().toLowerCase() === LANDLORD_TRIP_REASON.toLowerCase();
}

export const REJECTED_VISIBLE_DAYS = 7;
