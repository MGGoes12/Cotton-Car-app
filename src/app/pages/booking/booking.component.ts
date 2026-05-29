import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Booking, SupabaseService, UserProfile } from '../../supabase.service';

@Component({
  selector: 'app-booking',
  templateUrl: './booking.component.html',
  styleUrls: ['./booking.component.scss']
})
export class BookingComponent implements OnInit {
  user: UserProfile | null = null;
  bookings: Booking[] = [];        // user's own bookings
  allBookings: Booking[] = [];     // all bookings for overlap checking
  bookingDate = this.formatDate(new Date());
  startTime = '09:00';
  endTime = '17:00';
  allDay = false;
  reason = '';
  expectedStartKm = 0;
  message = '';
  error = '';
  selectedBooking: Booking | null = null;
  actualStartKm?: number;
  actualEndKm?: number;
  returnTime = '';

  constructor(private supabase: SupabaseService, private router: Router) {}

  ngOnInit(): void {
    this.supabase.authUser$.subscribe(async user => {
      this.user = user;
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }
      await this.loadBookings();
    });
  }

  private formatDate(date: Date) {
    return date.toISOString().split('T')[0];
  }

  async loadBookings() {
    this.bookings = await this.supabase.getBookings();
    this.allBookings = await this.supabase.getAllBookings();
  }

  async submitBooking() {
    this.error = '';
    this.message = '';
    if (!this.user) {
      this.error = 'You must be logged in to create a booking.';
      return;
    }
    if (!this.reason.trim() || !this.bookingDate) {
      this.error = 'Please complete the booking date and reason.';
      return;
    }
    const end = this.allDay ? '23:59' : this.endTime;
    if (!this.allDay && this.endTime <= this.startTime) {
      this.error = 'End time must be after start time.';
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
      reason: this.reason.trim(),
      expected_start_km: this.expectedStartKm,
      status: 'pending'
    };

    const { error } = await this.supabase.createBooking(newBooking);
    if (error) {
      this.error = error.message;
      return;
    }
    this.message = 'Booking request created and waiting for admin approval.';
    await this.loadBookings();
  }

  hasOverlap(existing: Booking, current: Booking) {
    if (existing.booking_date !== current.booking_date) {
      return false;
    }
    if (existing.status === 'rejected') {
      return false;
    }
    if (existing.all_day || current.all_day) {
      return true;
    }
    return current.start_time < existing.end_time && existing.start_time < current.end_time;
  }

  async setSelectedBooking(booking: Booking) {
    this.selectedBooking = booking;
    this.actualStartKm = booking.actual_start_km;
    this.actualEndKm = booking.actual_end_km;
    this.returnTime = booking.return_time || '';
  }

  async saveOdometer() {
    if (!this.selectedBooking) {
      return;
    }
    const updates: Partial<Booking> = {};
    if (this.actualStartKm != null) {
      updates.actual_start_km = this.actualStartKm;
    }
    if (this.actualEndKm != null) {
      updates.actual_end_km = this.actualEndKm;
    }
    if (this.returnTime) {
      updates.return_time = this.returnTime;
    }
    if (this.actualStartKm != null && this.actualEndKm != null) {
      updates.status = 'completed';
    }
    const { error } = await this.supabase.updateBooking(this.selectedBooking.id as string, updates);
    if (error) {
      this.error = error.message;
    } else {
      this.message = 'Booking details updated.';
      this.selectedBooking = null;
      await this.loadBookings();
    }
  }

  async approveBooking(booking: Booking, status: 'approved' | 'rejected') {
    const { error } = await this.supabase.approveBooking(booking.id as string, status);
    if (error) {
      this.error = error.message;
    } else {
      this.message = `Booking ${status}.`;
      await this.loadBookings();
    }
  }
}
