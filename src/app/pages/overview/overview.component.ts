import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { bookingAppliesToCalendarDay, formatBookingTimeLabel } from '../../booking-interval.utils';
import { shrekForMonth } from '../../shrek-months';
import { isLandlordTrip } from '../../booking.constants';
import { Booking, PasswordResetRequest, SupabaseService, UserProfile } from '../../supabase.service';

interface CalendarDay {
  value: string;
  label: string;
  booked: boolean;
  bookings: Booking[];
  isToday: boolean;
}

interface ReportTrip {
  reason: string;
  date: string;
  km: number | null;
}

interface ReportGroup {
  email: string;
  name: string;
  totalKm: number;
  landlordKm: number;
  trips: ReportTrip[];
  expanded: boolean;
}

@Component({
  selector: 'app-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss']
})
export class OverviewComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly todayStr = this.formatDate(new Date());

  user: UserProfile | null = null;
  bookings: Booking[] = [];
  pendingResets: PasswordResetRequest[] = [];
  users: UserProfile[] = [];
  showAddUser = false;
  newUserEmail = '';
  newUserName = '';
  newUserPassword = '';
  newUserIsAdmin = false;
  days: CalendarDay[] = [];
  currentMonth = new Date();
  reportFrom = this.formatDate(new Date());
  reportTo = this.formatDate(new Date());
  reportResults: Booking[] = [];
  showReport = false;
  showReportModal = false;
  reportGroups: ReportGroup[] = [];
  message = '';
  error = '';

  formatTime = formatBookingTimeLabel;

  constructor(
    public supabase: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.supabase.authUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async user => {
        this.user = user;
        if (!user) return;
        await this.loadBookings();
        if (user.is_admin) {
          this.pendingResets = await this.supabase.getPendingPasswordResets();
          this.users = await this.supabase.getUsers();
        }
      });
  }

  get pendingCount(): number {
    return this.bookings.filter(b => b.status === 'pending').length;
  }

  get calendarShrekSrc(): string {
    return shrekForMonth(this.currentMonth.getMonth());
  }

  private formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async loadBookings() {
    this.bookings = await this.supabase.getBookings();
    this.buildCalendar();
  }

  private buildCalendar() {
    const daysInMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfWeek = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), 1).getDay();
    this.days = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      this.days.push({ value: '', label: '', booked: false, bookings: [], isToday: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), i);
      const value = this.formatDate(date);
      const matched = this.bookings.filter(b => bookingAppliesToCalendarDay(b, value));
      this.days.push({
        value,
        label: String(i),
        booked: matched.length > 0,
        bookings: matched,
        isToday: value === this.todayStr
      });
    }
  }

  goToToday() {
    this.currentMonth = new Date();
    this.buildCalendar();
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
      setTimeout(() => (this.message = ''), 6000);
    }
  }

  async addUser() {
    this.error = '';
    this.message = '';
    if (!this.supabase.hasAdminApi) {
      this.error = 'Create users in the Supabase dashboard (Auth → Users).';
      return;
    }
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
      setTimeout(() => (this.message = ''), 4000);
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
      setTimeout(() => (this.message = ''), 4000);
    }
  }

  async pullReport() {
    this.error = '';
    this.message = '';
    if (!this.reportFrom || !this.reportTo) {
      this.error = 'Choose a start and end date for the report.';
      return;
    }
    if (this.reportFrom > this.reportTo) {
      this.error = 'The start date must be on or before the end date.';
      return;
    }
    const { data, error } = await this.supabase.pullReport(this.reportFrom, this.reportTo);
    if (error) {
      this.error = error.message;
      return;
    }
    this.reportResults = data ?? [];
    this.buildReportGroups();
    this.showReportModal = false;
    this.showReport = true;
    this.cdr.detectChanges();
  }

  exportReportCsv() {
    const rows = ['User,Date,Trip type,Km'];
    for (const g of this.reportGroups) {
      for (const t of g.trips) {
        rows.push(`"${g.email}","${t.date}","${t.reason}",${t.km ?? ''}`);
      }
    }
    rows.push('', `"Total","","",${this.reportTotalKm}`);
    rows.push(`"Landlord trips","","",${this.reportLandlordKm}`);
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `car-report-${this.reportFrom}-${this.reportTo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private buildReportGroups() {
    const map = new Map<string, ReportGroup>();
    for (const b of this.reportResults) {
      if (b.status === 'rejected' || b.status === 'pending') continue;
      const email = b.user_email || 'Unknown';
      let group = map.get(email);
      if (!group) {
        group = {
          email,
          name: email.includes('@') ? email.slice(0, email.indexOf('@')) : email,
          totalKm: 0,
          landlordKm: 0,
          trips: [],
          expanded: false
        };
        map.set(email, group);
      }
      const km = b.actual_end_km != null && b.actual_start_km != null
        ? b.actual_end_km - b.actual_start_km
        : null;
      if (km != null) {
        group.totalKm += km;
        if (isLandlordTrip(b.reason)) {
          group.landlordKm += km;
        }
      }
      group.trips.push({ reason: b.reason || 'No reason given', date: b.booking_date, km });
    }
    this.reportGroups = Array.from(map.values()).sort((a, b) => b.totalKm - a.totalKm);
  }

  get reportTotalKm(): number {
    return this.reportGroups.reduce((sum, g) => sum + g.totalKm, 0);
  }

  get reportLandlordKm(): number {
    return this.reportGroups.reduce((sum, g) => sum + g.landlordKm, 0);
  }

  closeReport() {
    this.showReport = false;
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
