import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatBookingTimeLabel } from '../../booking-interval.utils';
import { Booking, SupabaseService, UserProfile } from '../../supabase.service';

@Component({
  selector: 'app-all-bookings',
  templateUrl: './all-bookings.component.html',
  styleUrls: ['./all-bookings.component.scss']
})
export class AllBookingsComponent implements OnInit {
  user: UserProfile | null = null;
  pendingBookings: Booking[] = [];
  approvedBookings: Booking[] = [];
  error = '';
  message = '';

  formatTime = formatBookingTimeLabel;

  private readonly destroyRef = inject(DestroyRef);

  constructor(private supabase: SupabaseService) {}

  ngOnInit(): void {
    this.supabase.authUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async user => {
        this.user = user;
        if (!user) return;
        await this.loadBookings();
      });
  }

  async loadBookings() {
    const all = await this.supabase.getAllBookingsForAdmin();
    const upcoming = all.filter(b => b.status === 'pending' || b.status === 'approved');
    const byDateAsc = (a: Booking, b: Booking) =>
      a.booking_date.localeCompare(b.booking_date) || a.start_time.localeCompare(b.start_time);

    this.pendingBookings = upcoming.filter(b => b.status === 'pending').sort(byDateAsc);
    this.approvedBookings = upcoming.filter(b => b.status === 'approved').sort(byDateAsc);
  }

  get hasAnyBookings(): boolean {
    return this.pendingBookings.length > 0 || this.approvedBookings.length > 0;
  }

  userLabel(email: string): string {
    return email.includes('@') ? email.slice(0, email.indexOf('@')) : email;
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
    this.message = status === 'rejected'
      ? `Booking rejected for ${booking.user_email}.`
      : `Booking approved for ${booking.user_email}.`;
    await this.loadBookings();
  }

  async cancelBooking(booking: Booking) {
    if (!booking.id) {
      this.error = 'Invalid booking ID.';
      return;
    }
    const when = `${booking.booking_date} · ${this.formatTime(booking)}`;
    if (!confirm(`Cancel this approved booking for ${booking.user_email} (${when})? The slot will be free again.`)) {
      return;
    }
    this.error = '';
    this.message = '';
    const { data, error } = await this.supabase.cancelBooking(booking.id);
    if (error) {
      this.error = error.message;
      return;
    }
    if (!data?.length) {
      this.error = 'Could not cancel booking. Check admin permissions.';
      return;
    }
    this.message = `Booking cancelled for ${booking.user_email}.`;
    await this.loadBookings();
  }
}
