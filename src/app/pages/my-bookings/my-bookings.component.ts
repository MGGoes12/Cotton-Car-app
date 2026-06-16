import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  findPrecedingHandoffBooking,
  formatBookingTimeLabel,
  isMissingEndKm
} from '../../booking-interval.utils';
import { REJECTED_VISIBLE_DAYS } from '../../booking.constants';
import { NotifyService } from '../../notify.service';
import { buildTripCharges, formatRand, totalDebtFromBookings } from '../../settlement.utils';
import { Booking, SettlementRequest, SupabaseService, UserProfile } from '../../supabase.service';

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
  pendingSettlement: SettlementRequest | null = null;
  showCompleted = false;
  showRejected = false;
  error = '';
  message = '';
  selectedBooking: Booking | null = null;
  actualStartKm?: number;
  actualEndKm?: number;
  returnTime = '';
  odometerWarning = '';
  priorDriverWarning = '';
  expectedStartKmFromLastTrip: number | null = null;
  settling = false;

  formatTime = formatBookingTimeLabel;
  formatRand = formatRand;

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private supabase: SupabaseService,
    private notify: NotifyService
  ) {}

  ngOnInit(): void {
    this.supabase.authUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async user => {
        this.user = user;
        if (!user) return;
        await this.loadBookings();
      });
  }

  get currentDebt(): number {
    return totalDebtFromBookings(this.completedBookings);
  }

  get canRequestSettlement(): boolean {
    return this.currentDebt > 0 && !this.pendingSettlement && !this.settling;
  }

  async loadBookings() {
    const all = await this.supabase.getMyBookings();
    const visible = all.filter(b => this.isRejectedVisible(b));
    this.partitionBookings(visible);
    this.pendingSettlement = await this.supabase.getMyPendingSettlement();
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

  async setSelectedBooking(booking: Booking) {
    if (!this.canEditTrip(booking)) return;
    this.selectedBooking = booking;
    this.actualStartKm = booking.actual_start_km;
    this.actualEndKm = booking.actual_end_km;
    this.returnTime = booking.return_time || '';
    this.odometerWarning = '';
    this.priorDriverWarning = '';
    this.expectedStartKmFromLastTrip = null;

    if (!this.user?.id) return;
    const lastTrip = await this.supabase.getLastCompletedTrip(this.user.id, booking.id);
    if (lastTrip?.actual_end_km != null) {
      this.expectedStartKmFromLastTrip = lastTrip.actual_end_km;
      this.checkOdometerMismatch();
    }

    await this.checkPriorDriverEndKm(booking);
  }

  private async checkPriorDriverEndKm(booking: Booking) {
    this.priorDriverWarning = '';
    const nearby = await this.supabase.getBookingsNearDate(booking.booking_date);
    const prior = findPrecedingHandoffBooking(nearby, booking);
    if (!prior || !isMissingEndKm(prior)) return;

    const priorName = prior.user_email?.split('@')[0] || 'The previous driver';
    this.priorDriverWarning =
      `${priorName} has not entered end KMs for their trip (${formatBookingTimeLabel(prior)}). Admins will be notified when you save your start KM.`;
  }

  onActualStartKmChange() {
    this.checkOdometerMismatch();
  }

  private checkOdometerMismatch() {
    if (this.expectedStartKmFromLastTrip == null || this.actualStartKm == null) {
      this.odometerWarning = '';
      return;
    }
    if (this.actualStartKm !== this.expectedStartKmFromLastTrip) {
      this.odometerWarning =
        `Warning: your start KM (${this.actualStartKm}) does not match the end KM of your last trip (${this.expectedStartKmFromLastTrip}). Admins will be notified.`;
      return;
    }
    this.odometerWarning = '';
  }

  async saveOdometer() {
    if (!this.selectedBooking || !this.canEditTrip(this.selectedBooking) || !this.user) return;

    if (this.actualStartKm != null && this.actualEndKm != null && this.actualEndKm < this.actualStartKm) {
      this.error = 'End KM must be greater than or equal to start KM.';
      return;
    }

    const updates: Partial<Booking> = {};
    if (this.actualStartKm != null) updates.actual_start_km = this.actualStartKm;
    if (this.actualEndKm != null) updates.actual_end_km = this.actualEndKm;
    if (this.returnTime) updates.return_time = this.returnTime;

    const completing = this.actualStartKm != null && this.actualEndKm != null;
    if (completing) {
      updates.status = 'completed';
    }

    if (
      completing &&
      this.expectedStartKmFromLastTrip != null &&
      this.actualStartKm != null &&
      this.actualStartKm !== this.expectedStartKmFromLastTrip
    ) {
      updates.odometer_mismatch = true;
      updates.odometer_mismatch_expected = this.expectedStartKmFromLastTrip;
      updates.odometer_mismatch_actual = this.actualStartKm;
    }

    const bookingId = this.selectedBooking.id as string;
    const bookingDate = this.selectedBooking.booking_date;
    const userEmail = this.user.email;
    const isFirstStartKmEntry = this.selectedBooking.actual_start_km == null && this.actualStartKm != null;

    const { error } = await this.supabase.updateBooking(bookingId, updates);
    if (error) {
      this.error = error.message;
      this.message = '';
      return;
    }

    if (isFirstStartKmEntry && this.actualStartKm != null) {
      const nearby = await this.supabase.getBookingsNearDate(bookingDate);
      const prior = findPrecedingHandoffBooking(nearby, this.selectedBooking);
      if (prior && isMissingEndKm(prior) && prior.user_email !== userEmail) {
        await this.notify.notifyAdmins('missing_prior_end_km', {
          userEmail,
          bookingDate,
          timeLabel: formatBookingTimeLabel(this.selectedBooking),
          actualStartKm: this.actualStartKm,
          priorDriverEmail: prior.user_email,
          priorBookingDate: prior.booking_date,
          priorTimeLabel: formatBookingTimeLabel(prior)
        });
      }
    }

    if (updates.odometer_mismatch) {
      await this.notify.notifyAdmins('odometer_mismatch', {
        userEmail,
        bookingDate,
        expectedKm: updates.odometer_mismatch_expected,
        actualKm: updates.odometer_mismatch_actual
      });
    }

    this.message = completing ? 'Trip completed.' : 'Booking details updated.';
    this.error = '';
    this.selectedBooking = null;
    this.odometerWarning = '';
    this.priorDriverWarning = '';
    await this.loadBookings();
  }

  async requestSettlement() {
    if (!this.canRequestSettlement) return;
    this.error = '';
    this.message = '';
    this.settling = true;

    const charges = buildTripCharges(this.completedBookings);
    const amount = totalDebtFromBookings(this.completedBookings);
    const items = charges.map(c => ({
      booking_id: c.booking.id as string,
      km: c.km,
      rate: c.rate,
      amount: c.amount
    }));

    const { data, error } = await this.supabase.requestSettlement(amount, items);
    this.settling = false;

    if (error || !data) {
      this.error = error || 'Could not submit settlement request.';
      return;
    }

    await this.notify.notifyAdmins('settlement_request', {
      userEmail: this.user?.email,
      amount: amount.toFixed(2),
      tripCount: items.length
    });

    this.message = `Settlement request submitted for ${formatRand(amount)}. An admin will review it.`;
    this.pendingSettlement = data;
  }
}
