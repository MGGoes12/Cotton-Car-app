import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { formatBookingTimeLabel } from '../../booking-interval.utils';
import { REJECTED_VISIBLE_DAYS } from '../../booking.constants';
import { Booking, SupabaseService, UserProfile } from '../../supabase.service';

@Component({
  selector: 'app-my-bookings',
  templateUrl: './my-bookings.component.html',
  styleUrls: ['./my-bookings.component.scss']
})
export class MyBookingsComponent implements OnInit {
  user: UserProfile | null = null;
  activeBookings: Booking[] = [];
  completedBookings: Booking[] = [];
  rejectedBookings: Booking[] = [];
  showCompleted = false;
  showRejected = false;
  error = '';
  message = '';
  selectedBooking: Booking | null = null;
  actualStartKm?: number;
  actualEndKm?: number;
  returnTime = '';

  formatTime = formatBookingTimeLabel;

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

  async loadBookings() {
    const all = await this.supabase.getMyBookings();
    const visible = all.filter(b => this.isRejectedVisible(b));
    this.partitionBookings(visible);
  }

  private isRejectedVisible(booking: Booking): boolean {
    if (booking.status !== 'rejected') return true;
    const ref = booking.updated_at || booking.created_at || booking.booking_date;
    const refDate = new Date(ref.includes('T') ? ref : `${ref}T12:00:00`);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - REJECTED_VISIBLE_DAYS);
    return refDate >= cutoff;
  }

  private partitionBookings(bookings: Booking[]) {
    const active: Booking[] = [];
    const completed: Booking[] = [];
    const rejected: Booking[] = [];

    for (const b of bookings) {
      if (b.status === 'completed') {
        completed.push(b);
      } else if (b.status === 'rejected') {
        rejected.push(b);
      } else {
        active.push(b);
      }
    }

    const byDateDesc = (a: Booking, b: Booking) =>
      b.booking_date.localeCompare(a.booking_date) || b.start_time.localeCompare(a.start_time);
    const byDateAsc = (a: Booking, b: Booking) =>
      a.booking_date.localeCompare(b.booking_date) || a.start_time.localeCompare(b.start_time);

    active.sort((a, b) => {
      const order = { pending: 0, approved: 1 };
      const diff = (order[a.status] ?? 2) - (order[b.status] ?? 2);
      return diff !== 0 ? diff : byDateAsc(a, b);
    });
    completed.sort(byDateDesc);
    rejected.sort(byDateDesc);

    this.activeBookings = active;
    this.completedBookings = completed;
    this.rejectedBookings = rejected;
  }

  get hasAnyBookings(): boolean {
    return (
      this.activeBookings.length > 0 ||
      this.completedBookings.length > 0 ||
      this.rejectedBookings.length > 0
    );
  }

  canEditTrip(booking: Booking): boolean {
    return booking.status === 'approved';
  }

  canAdminReview(booking: Booking): boolean {
    return !!this.user?.is_admin && booking.status !== 'completed';
  }

  setSelectedBooking(booking: Booking) {
    if (!this.canEditTrip(booking)) return;
    this.selectedBooking = booking;
    this.actualStartKm = booking.actual_start_km;
    this.actualEndKm = booking.actual_end_km;
    this.returnTime = booking.return_time || '';
  }

  async saveOdometer() {
    if (!this.selectedBooking || !this.canEditTrip(this.selectedBooking)) return;
    const updates: Partial<Booking> = {};
    if (this.actualStartKm != null) updates.actual_start_km = this.actualStartKm;
    if (this.actualEndKm != null) updates.actual_end_km = this.actualEndKm;
    if (this.returnTime) updates.return_time = this.returnTime;
    if (this.actualStartKm != null && this.actualEndKm != null) {
      updates.status = 'completed';
    }

    const { error } = await this.supabase.updateBooking(this.selectedBooking.id as string, updates);
    if (error) {
      this.error = error.message;
      this.message = '';
    } else {
      this.message = 'Booking details updated.';
      this.error = '';
      this.selectedBooking = null;
      await this.loadBookings();
    }
  }

  async approveBooking(booking: Booking, status: 'approved' | 'rejected') {
    if (!booking.id) {
      this.error = 'Invalid booking ID.';
      return;
    }
    this.error = '';
    this.message = '';
    const { data, error } = await this.supabase.approveBooking(booking.id, status);
    if (error) {
      this.error = error.message;
      return;
    }
    if (!data?.length) {
      this.error = 'Could not update booking. Check admin permissions.';
      return;
    }
    this.message = `Booking ${status}.`;
    await this.loadBookings();
  }
}
