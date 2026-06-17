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
  priorHandoffBooking: Booking | null = null;
  actualStartKm?: number;
  actualEndKm?: number;
  returnTime = '';
  odometerWarning = '';
  priorDriverWarning = '';
  expectedStartKmFromPriorTrip: number | null = null;
  settling = false;

  formatTime = formatBookingTimeLabel;
  formatRand = formatRand;

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private supabase: SupabaseService,
    private notify: NotifyService
  ) {}

  get priorHandoffDriverLabel(): string {
    if (!this.priorHandoffBooking?.user_email) return '';
    const name = this.priorHandoffBooking.user_email.split('@')[0];
    return ` (${name}'s trip)`;
  }

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
    this.expectedStartKmFromPriorTrip = null;
    this.priorHandoffBooking = null;

    const nearby = await this.supabase.getBookingsForHandoffCheck(booking.booking_date);
    const prior = findPrecedingHandoffBooking(nearby, booking) as Booking | null;
    this.priorHandoffBooking = prior;

    if (!prior) return;

    if (isMissingEndKm(prior)) {
      const priorName = prior.user_email?.split('@')[0] || 'The previous driver';
      this.priorDriverWarning =
        `${priorName} has not entered end KMs for their trip (${formatBookingTimeLabel(prior)}). Admins will be notified when you save your start KM.`;
      return;
    }

    if (prior.actual_end_km != null) {
      this.expectedStartKmFromPriorTrip = prior.actual_end_km;
      this.checkOdometerMismatch();
    }
  }

  onActualStartKmChange() {
    this.checkOdometerMismatch();
  }

  private checkOdometerMismatch() {
    if (this.expectedStartKmFromPriorTrip == null || this.actualStartKm == null) {
      this.odometerWarning = '';
      return;
    }
    if (this.actualStartKm !== this.expectedStartKmFromPriorTrip) {
      this.odometerWarning =
        `Warning: your start KM (${this.actualStartKm}) does not match the end KM from the last trip (${this.expectedStartKmFromPriorTrip}${this.priorHandoffDriverLabel}). Admins will be notified.`;
      return;
    }
    this.odometerWarning = '';
  }

  private async sendNotify(type: Parameters<NotifyService['notifyAdmins']>[0], payload: Record<string, unknown>) {
    const result = await this.notify.notifyAdmins(type, payload);
    if (!result.ok) {
      console.warn('Email notification failed:', result.error);
    }
    return result;
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

    const hasMismatch =
      this.actualStartKm != null &&
      this.expectedStartKmFromPriorTrip != null &&
      this.actualStartKm !== this.expectedStartKmFromPriorTrip;

    if (hasMismatch) {
      updates.odometer_mismatch = true;
      updates.odometer_mismatch_expected = this.expectedStartKmFromPriorTrip!;
      updates.odometer_mismatch_actual = this.actualStartKm!;
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

    let notifyFailed = false;

    if (isFirstStartKmEntry && this.actualStartKm != null) {
      const nearby = await this.supabase.getBookingsForHandoffCheck(bookingDate);
      const prior = findPrecedingHandoffBooking(nearby, this.selectedBooking);
      if (prior && isMissingEndKm(prior) && prior.user_email !== userEmail) {
        const r = await this.sendNotify('missing_prior_end_km', {
          userEmail,
          bookingDate,
          timeLabel: formatBookingTimeLabel(this.selectedBooking),
          actualStartKm: this.actualStartKm,
          priorDriverEmail: prior.user_email,
          priorBookingDate: prior.booking_date,
          priorTimeLabel: formatBookingTimeLabel(prior)
        });
        notifyFailed = notifyFailed || !r.ok;
      }
    }

    if (hasMismatch) {
      const r = await this.sendNotify('odometer_mismatch', {
        userEmail,
        bookingDate,
        expectedKm: updates.odometer_mismatch_expected,
        actualKm: updates.odometer_mismatch_actual,
        priorDriverEmail: this.priorHandoffBooking?.user_email
      });
      notifyFailed = notifyFailed || !r.ok;
    }

    this.message = completing ? 'Trip completed.' : 'Booking details updated.';
    if (notifyFailed) {
      this.message += ' (Admin email could not be sent — check Vercel env vars: RESEND_API, RESEND_FROM_EMAIL, SUPABASE_SERVICE_ROLE.)';
    }
    this.error = '';
    this.selectedBooking = null;
    this.priorHandoffBooking = null;
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

    await this.sendNotify('settlement_request', {
      userEmail: this.user?.email,
      amount: amount.toFixed(2),
      tripCount: items.length
    });

    this.message = `Settlement request submitted for ${formatRand(amount)}. An admin will review it.`;
    this.pendingSettlement = data;
  }
}
