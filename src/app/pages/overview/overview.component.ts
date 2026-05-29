import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Booking, PasswordResetRequest, SupabaseService, UserProfile } from '../../supabase.service';

interface CalendarDay {
  value: string;
  label: string;
  booked: boolean;
  bookings: Booking[];
}

@Component({
  selector: 'app-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss']
})
export class OverviewComponent implements OnInit {
  user: UserProfile | null = null;
  bookings: Booking[] = [];
  pendingResets: PasswordResetRequest[] = [];
  users: UserProfile[] = [];
  showAddUser = false;
  newUserEmail = '';
  newUserName = '';
  newUserPassword = '';
  newUserIsAdmin = false;
  confirmDeleteEmail = '';
  days: CalendarDay[] = [];
  currentMonth = new Date();
  reportFrom = this.formatDate(new Date());
  reportTo = this.formatDate(new Date());
  reportResults: Booking[] = [];
  showReport = false;
  showReportModal = false;
  message = '';
  error = '';

  constructor(public supabase: SupabaseService, private router: Router) {}

  ngOnInit(): void {
    this.supabase.authUser$.subscribe(async user => {
      this.user = user;
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }
      await this.loadBookings();
      if (user.is_admin) {
        this.pendingResets = await this.supabase.getPendingPasswordResets();
        this.users = await this.supabase.getUsers();
      }
    });
  }

  private formatDate(date: Date) {
    return date.toISOString().split('T')[0];
  }

  private async loadBookings() {
    this.bookings = await this.supabase.getBookings();
    this.buildCalendar();
  }

  private buildCalendar() {
    const daysInMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfWeek = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), 1).getDay();
    this.days = [];
    // Blank slots for day-of-week alignment (Sun=0)
    for (let i = 0; i < firstDayOfWeek; i++) {
      this.days.push({ value: '', label: '', booked: false, bookings: [] });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), i);
      const value = this.formatDate(date);
      const matched = this.bookings.filter(b => b.booking_date === value && b.status !== 'rejected');
      this.days.push({ value, label: String(i), booked: matched.length > 0, bookings: matched });
    }
  }

  getPendingBookings(): Booking[] {
    return this.bookings.filter(b => b.status === 'pending');
  }

  async approveBooking(id: string | null | undefined, status: 'approved' | 'rejected') {
    if (!id) {
      this.error = 'Invalid booking ID';
      return;
    }
    try {
      await this.supabase.updateBooking(id, { status });
      this.message = `Booking ${status === 'approved' ? 'approved' : 'rejected'} successfully!`;
      await this.loadBookings();
      setTimeout(() => this.message = '', 3000);
    } catch (err) {
      this.error = `Failed to update booking: ${err}`;
      setTimeout(() => this.error = '', 3000);
    }
  }

  async approveReset(id: string, email: string) {
    this.error = '';
    this.message = '';
    const result = await this.supabase.approvePasswordReset(id, email);
    if (result.error) {
      this.error = result.error;
    } else {
      this.message = `Password reset approved for ${email}. They can now set a new password on their next sign-in.`;
      this.pendingResets = await this.supabase.getPendingPasswordResets();
      setTimeout(() => this.message = '', 6000);
    }
  }

  async addUser() {
    this.error = '';
    this.message = '';
    if (!this.newUserEmail || !this.newUserPassword) {
      this.error = 'Email and password are required.';
      return;
    }
    if (this.newUserPassword.length < 6) {
      this.error = 'Password must be at least 6 characters.';
      return;
    }
    const result = await this.supabase.createUser(
      this.newUserEmail.trim(),
      this.newUserPassword,
      this.newUserName.trim(),
      this.newUserIsAdmin
    );
    if (result.error) {
      this.error = result.error;
    } else {
      this.message = `User ${this.newUserEmail} created successfully.`;
      this.newUserEmail = '';
      this.newUserName = '';
      this.newUserPassword = '';
      this.newUserIsAdmin = false;
      this.showAddUser = false;
      this.users = await this.supabase.getUsers();
      setTimeout(() => this.message = '', 4000);
    }
  }

  async deleteUser(user: UserProfile) {
    if (!user.auth_user_id) {
      this.error = 'Cannot delete: user has no auth account linked.';
      return;
    }
    if (!confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    this.error = '';
    this.message = '';
    const result = await this.supabase.deleteUser(user.id, user.auth_user_id);
    if (result.error) {
      this.error = result.error;
    } else {
      this.message = `User ${user.email} deleted.`;
      this.users = await this.supabase.getUsers();
      setTimeout(() => this.message = '', 4000);
    }
  }

  async pullReport() {
    this.error = '';
    this.message = '';
    if (!this.reportFrom || !this.reportTo) {
      this.error = 'Choose a start and end date for the report.';
      return;
    }
    const { data, error } = await this.supabase.pullReport(this.reportFrom, this.reportTo);
    if (error) {
      this.error = error.message;
      return;
    }
    this.reportResults = data || [];
    this.showReport = true;
    this.showReportModal = false;
  }

  pastBookingDays(day: CalendarDay) {
    return day.bookings.map(b => `${b.booking_date}: ${b.reason} (${b.status})`).join('\n');
  }

  nextMonth() {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
    this.buildCalendar();
  }

  previousMonth() {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
    this.buildCalendar();
  }
}
