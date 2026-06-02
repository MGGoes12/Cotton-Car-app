import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { bookingsOverlap } from '../../booking-interval.utils';
import { BOOKING_REASONS } from '../../booking.constants';
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
  overnight = false;
  reason = '';
  expectedStartKm = 0;
  message = '';
  error = '';
  timeRangeError = '';
  readonly timeMinuteStep = 5;

  constructor(private supabase: SupabaseService, private router: Router) {}

  get minEndTime(): string | undefined {
    return this.overnight ? undefined : addMinutes(this.startTime, this.timeMinuteStep, this.timeMinuteStep);
  }

  ngOnInit(): void {
    this.supabase.authUser$.subscribe(async user => {
      this.user = user;
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }
      this.allBookings = await this.supabase.getAllBookings();
    });
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
    if (this.allDay) {
      this.endTime = value;
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
      this.timeRangeError = '';
      return;
    }
    this.syncTimeRange(false);
  }

  onOvernightChange() {
    if (this.overnight) {
      this.allDay = false;
      if (timeToMinutes(this.endTime) > timeToMinutes(this.startTime)) {
        this.endTime = '07:00';
      }
      this.timeRangeError = '';
      return;
    }
    this.syncTimeRange(false);
  }

  private syncTimeRange(showHint: boolean) {
    if (this.allDay || this.overnight) {
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
    const end = this.allDay ? '23:59' : this.endTime;
    this.syncTimeRange(true);
    if (!this.allDay && !this.overnight && timeToMinutes(this.endTime) <= timeToMinutes(this.startTime)) {
      this.error = 'Expected return time must be after your leaving time.';
      return;
    }
    const proposed = {
      booking_date: this.bookingDate,
      start_time: this.startTime,
      end_time: end,
      all_day: this.allDay,
      overnight: this.overnight,
      status: 'pending' as const
    };
    const conflicting = this.allBookings.find(b =>
      b.status !== 'rejected' && bookingsOverlap(b, proposed)
    );
    if (conflicting) {
      const isOwnBooking = conflicting.user_profile_id === this.user!.id;
      this.error = isOwnBooking
        ? 'You already have a booking at this time.'
        : 'Another user has already booked the car at this time.';
      return;
    }

    const newBooking: Partial<Booking> = {
      user_profile_id: this.user.id,
      user_email: this.user.email,
      booking_date: this.bookingDate,
      start_time: this.startTime,
      end_time: end,
      all_day: this.allDay,
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
    this.allBookings = await this.supabase.getAllBookings();
  }
}
