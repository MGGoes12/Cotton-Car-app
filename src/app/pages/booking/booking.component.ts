import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { bookingsOverlap } from '../../booking-interval.utils';
import {
  BOOKING_REASONS,
  FULL_DAY_END,
  FULL_DAY_START,
  FULL_EVENING_END,
  FULL_EVENING_START,
  TRIP_TYPE_HINTS
} from '../../booking.constants';
import { Booking, SupabaseService, UserProfile } from '../../supabase.service';
import { addMinutes, timeToMinutes } from '../../time.utils';

@Component({
  selector: 'app-booking',
  templateUrl: './booking.component.html',
  styleUrls: ['./booking.component.scss']
})
export class BookingComponent implements OnInit {
  user: UserProfile | null = null;
  allBookings: Booking[] = [];
  bookingReasons = BOOKING_REASONS;
  bookingDate = this.formatDate(new Date());
  startTime = '09:00';
  endTime = '17:00';
  allDay = false;
  fullEvening = false;
  overnight = false;
  reason = '';
  expectedStartKm = 0;
  message = '';
  error = '';
  timeRangeError = '';
  readonly timeMinuteStep = 5;
  readonly minBookingDate = this.formatDate(new Date());

  private readonly destroyRef = inject(DestroyRef);

  constructor(private supabase: SupabaseService) {}

  get minEndTime(): string | undefined {
    return this.overnight ? undefined : addMinutes(this.startTime, this.timeMinuteStep, this.timeMinuteStep);
  }

  get tripTypeHint(): string | null {
    if (!this.reason) return null;
    return TRIP_TYPE_HINTS[this.reason as keyof typeof TRIP_TYPE_HINTS] ?? null;
  }

  ngOnInit(): void {
    this.supabase.authUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async user => {
        this.user = user;
        if (!user) return;
        await this.refreshOverlapData();
      });
  }

  async refreshOverlapData() {
    this.allBookings = await this.supabase.getBookingsNearDate(this.bookingDate);
  }

  private formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  onStartTimeChange(value: string) {
    this.startTime = value;
    this.syncTimeRange(false);
  }

  onEndTimeChange(value: string) {
    if (this.allDay || this.fullEvening) {
      return;
    }
    if (this.overnight) {
      this.endTime = value;
      this.timeRangeError = '';
      return;
    }
    if (timeToMinutes(value) <= timeToMinutes(this.startTime)) {
      this.endTime = this.minEndTime!;
      this.timeRangeError = 'Return time must be after leaving time — adjusted to the earliest allowed time.';
    } else {
      this.endTime = value;
      this.timeRangeError = '';
    }
  }

  onAllDayChange() {
    if (this.allDay) {
      this.overnight = false;
      this.fullEvening = false;
      this.startTime = FULL_DAY_START;
      this.endTime = FULL_DAY_END;
      this.timeRangeError = '';
      return;
    }
    this.syncTimeRange(false);
  }

  onFullEveningChange() {
    if (this.fullEvening) {
      this.allDay = false;
      this.overnight = false;
      this.startTime = FULL_EVENING_START;
      this.endTime = FULL_EVENING_END;
      this.timeRangeError = '';
      return;
    }
    this.syncTimeRange(false);
  }

  onOvernightChange() {
    if (this.overnight) {
      this.allDay = false;
      this.fullEvening = false;
      if (timeToMinutes(this.endTime) > timeToMinutes(this.startTime)) {
        this.endTime = '07:00';
      }
      this.timeRangeError = '';
      return;
    }
    this.syncTimeRange(false);
  }

  private syncTimeRange(showHint: boolean) {
    if (this.allDay || this.fullEvening || this.overnight) {
      this.timeRangeError = '';
      return;
    }
    if (timeToMinutes(this.endTime) <= timeToMinutes(this.startTime)) {
      this.endTime = this.minEndTime!;
      if (showHint) {
        this.timeRangeError = 'Return time must be after leaving time — adjusted to the earliest allowed time.';
      }
    } else {
      this.timeRangeError = '';
    }
  }

  private slotTimes(): { start: string; end: string } {
    if (this.allDay) {
      return { start: FULL_DAY_START, end: FULL_DAY_END };
    }
    if (this.fullEvening) {
      return { start: FULL_EVENING_START, end: FULL_EVENING_END };
    }
    return { start: this.startTime, end: this.endTime };
  }

  private overlapErrorMessage(conflicting: Booking, proposed: ReturnType<typeof this.buildProposedBooking>): string {
    const isOwnBooking = conflicting.user_profile_id === this.user!.id;
    const who = isOwnBooking ? 'You already have a booking' : 'Another user has already booked the car';

    if (proposed.all_day) {
      return `${who} during full day hours (6am–5pm).`;
    }
    if (proposed.full_evening) {
      return `${who} during full evening hours (5pm–10pm).`;
    }
    return `${who} at this time.`;
  }

  private buildProposedBooking() {
    const { start, end } = this.slotTimes();
    return {
      booking_date: this.bookingDate,
      start_time: start,
      end_time: end,
      all_day: this.allDay,
      full_evening: this.fullEvening,
      overnight: this.overnight,
      status: 'pending' as const
    };
  }

  async submitBooking() {
    this.error = '';
    this.message = '';
    if (!this.user) {
      this.error = 'You must be logged in to create a booking.';
      return;
    }
    if (!this.reason || !this.bookingDate) {
      this.error = 'Please choose a trip type and booking date.';
      return;
    }
    if (this.bookingDate < this.minBookingDate) {
      this.error = 'Booking date cannot be in the past.';
      return;
    }
    await this.refreshOverlapData();
    this.syncTimeRange(true);
    if (!this.allDay && !this.fullEvening && !this.overnight && timeToMinutes(this.endTime) <= timeToMinutes(this.startTime)) {
      this.error = 'Expected return time must be after your leaving time.';
      return;
    }

    const proposed = this.buildProposedBooking();
    const conflicting = this.allBookings.find(b =>
      b.status !== 'rejected' && b.status !== 'completed' && bookingsOverlap(b, proposed)
    );
    if (conflicting) {
      this.error = this.overlapErrorMessage(conflicting, proposed);
      return;
    }

    const { start, end } = this.slotTimes();
    const newBooking: Partial<Booking> = {
      user_profile_id: this.user.id,
      user_email: this.user.email,
      booking_date: this.bookingDate,
      start_time: start,
      end_time: end,
      all_day: this.allDay,
      full_evening: this.fullEvening,
      overnight: this.overnight,
      reason: this.reason,
      expected_start_km: this.expectedStartKm,
      status: 'pending'
    };

    const { error } = await this.supabase.createBooking(newBooking);
    if (error) {
      this.error = error.message;
      return;
    }
    this.message = 'Booking request created and waiting for admin approval.';
    this.reason = '';
    this.expectedStartKm = 0;
    this.overnight = false;
    this.allDay = false;
    this.fullEvening = false;
    await this.refreshOverlapData();
  }
}
