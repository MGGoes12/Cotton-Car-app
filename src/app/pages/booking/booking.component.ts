import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BOOKING_REASONS } from '../../booking.constants';
import { Booking, SupabaseService, UserProfile } from '../../supabase.service';

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
  reason = '';
  expectedStartKm = 0;
  message = '';
  error = '';

  constructor(private supabase: SupabaseService, private router: Router) {}

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

  onStartTimeChange() {
    this.enforceEndAfterStart();
  }

  onEndTimeChange() {
    this.enforceEndAfterStart();
  }

  onAllDayChange() {
    if (!this.allDay) {
      this.enforceEndAfterStart();
    }
  }

  private enforceEndAfterStart() {
    if (this.allDay || this.endTime > this.startTime) return;
    const [h, m] = this.startTime.split(':').map(Number);
    const endH = Math.min(h + 1, 23);
    this.endTime = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
    if (!this.allDay && this.endTime <= this.startTime) {
      this.error = 'Expected return time must be after your leaving time.';
      return;
    }
    const proposed = {
      booking_date: this.bookingDate,
      start_time: this.startTime,
      end_time: end,
      all_day: this.allDay
    } as Booking;
    const conflicting = this.allBookings.find(b =>
      b.status !== 'rejected' && this.hasOverlap(b, proposed)
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
    this.allBookings = await this.supabase.getAllBookings();
  }

  hasOverlap(existing: Booking, current: Booking) {
    if (existing.booking_date !== current.booking_date) return false;
    if (existing.status === 'rejected') return false;
    if (existing.all_day || current.all_day) return true;
    return current.start_time < existing.end_time && existing.start_time < current.end_time;
  }
}
