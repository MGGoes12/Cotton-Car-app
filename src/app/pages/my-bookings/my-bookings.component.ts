import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Booking, SupabaseService, UserProfile } from '../../supabase.service';

@Component({
  selector: 'app-my-bookings',
  templateUrl: './my-bookings.component.html',
  styleUrls: ['./my-bookings.component.scss']
})
export class MyBookingsComponent implements OnInit {
  user: UserProfile | null = null;
  bookings: Booking[] = [];
  error = '';
  message = '';
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

  async loadBookings() {
    this.bookings = await this.supabase.getBookings();
  }

  setSelectedBooking(booking: Booking) {
    this.selectedBooking = booking;
    this.actualStartKm = booking.actual_start_km;
    this.actualEndKm = booking.actual_end_km;
    this.returnTime = booking.return_time || '';
  }

  async saveOdometer() {
    if (!this.selectedBooking) return;
    const updates: Partial<Booking> = {};
    if (this.actualStartKm != null) updates.actual_start_km = this.actualStartKm;
    if (this.actualEndKm != null) updates.actual_end_km = this.actualEndKm;
    if (this.returnTime) updates.return_time = this.returnTime;
    if (this.actualStartKm != null && this.actualEndKm != null) updates.status = 'completed';

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
