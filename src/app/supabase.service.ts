import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../environments/environment';

export interface UserProfile {
  id: string;
  auth_user_id?: string;
  email: string;
  full_name?: string;
  is_admin: boolean;
}

export interface PasswordResetRequest {
  id?: string;
  email: string;
  status: 'pending' | 'approved';
  temp_password?: string;
  created_at?: string;
}

export interface Booking {
  id?: string;
  user_profile_id: string;
  user_email: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  full_evening?: boolean;
  overnight?: boolean;
  reason: string;
  expected_start_km: number;
  actual_start_km?: number;
  actual_end_km?: number;
  return_time?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  settled_in_settlement_id?: string | null;
  odometer_mismatch?: boolean;
  odometer_mismatch_expected?: number | null;
  odometer_mismatch_actual?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SettlementRequest {
  id: string;
  user_profile_id: string;
  user_email: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;
  private supabaseAdmin: SupabaseClient | null = null;
  public authUser$ = new BehaviorSubject<UserProfile | null>(null);
  public configMissing = false;

  constructor() {
    const url = environment.supabaseUrl;
    const key = environment.supabaseKey;
    const validUrl = url && url.startsWith('https://') && !url.includes('YOUR_SUPABASE');
    const validKey = key && key.length > 20 && !key.includes('YOUR_SUPABASE');
    if (!validUrl || !validKey) {
      console.error('Supabase credentials are not configured.');
      this.configMissing = true;
      this.supabase = createClient('https://placeholder.supabase.co', 'placeholder-key');
      return;
    }
    // Strip any accidental path suffix (e.g. if SUPABASE_URL was set to .../rest/v1)
    const cleanUrl = url.replace(/\/(rest\/v1|auth\/v1)\/?$/, '').replace(/\/$/, '');
    this.supabase = createClient(cleanUrl, key);
    const serviceKey = environment.supabaseServiceKey;
    if (serviceKey && serviceKey.length > 20) {
      this.supabaseAdmin = createClient(cleanUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
    }
    this.initializeAuth();
  }

  private async initializeAuth() {
    const { data } = await this.supabase.auth.getSession();
    const session = data.session;
    if (session?.user) {
      await this.syncProfile(session.user);
    }
    this.supabase.auth.onAuthStateChange(async (_, session) => {
      if (session?.user) {
        await this.syncProfile(session.user);
      } else {
        this.authUser$.next(null);
      }
    });
  }

  private async syncProfile(user: User) {
    const email = user.email || '';
    // Query by auth_user_id so RLS policy (auth_user_id = auth.uid()) allows it
    const { data, error } = await (this.supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .limit(1)
      .single() as any);

    if (data) {
      this.authUser$.next(data);
      return;
    }

    // Profile not found by auth_user_id — try by email (handles legacy rows)
    const { data: byEmail } = await (this.supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .limit(1)
      .single() as any);

    if (byEmail) {
      // Backfill auth_user_id if missing
      if (!byEmail.auth_user_id) {
        await (this.supabase.from('profiles').update({ auth_user_id: user.id }).eq('email', email) as any);
        byEmail.auth_user_id = user.id;
      }
      this.authUser$.next(byEmail);
      return;
    }

    if (error) {
      console.error('Unable to load profile:', error.message);
    }
  }

  async signIn(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({ email, password });
  }

  async createUser(email: string, password: string, fullName: string, isAdmin: boolean): Promise<{ error?: string }> {
    if (!this.supabaseAdmin) {
      return { error: 'Service key not configured. Add SUPABASE_SERVICE_ROLE to your environment variables.' };
    }
    // Check if auth user already exists (failed previous attempt)
    let authUserId: string;
    const { data: existing } = await this.supabaseAdmin.auth.admin.listUsers();
    const existingUser = existing?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      authUserId = existingUser.id;
    } else {
      const { data, error } = await this.supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (error) return { error: error.message };
      authUserId = data.user.id;
    }
    // Upsert profile using admin client to bypass RLS
    const { error: profileError } = await (this.supabaseAdmin
      .from('profiles')
      .upsert({ email, auth_user_id: authUserId, full_name: fullName || null, is_admin: isAdmin }, { onConflict: 'email' }) as any);
    if (profileError) return { error: profileError.message };
    // If we found an existing auth user without profile, also set their password
    if (existingUser) {
      await this.supabaseAdmin.auth.admin.updateUserById(authUserId, { password });
    }
    return {};
  }

  async getUsers(): Promise<UserProfile[]> {
    const { data, error } = await (this.supabase
      .from('profiles')
      .select('*')
      .order('email', { ascending: true }) as any);
    if (error) return [];
    return data || [];
  }

  async deleteUser(profileId: string, authUserId: string): Promise<{ error?: string }> {
    if (!this.supabaseAdmin) {
      return { error: 'Service key not configured. Add SUPABASE_SERVICE_ROLE to your environment variables.' };
    }
    // Delete auth user (cascades to profile via auth_user_id)
    const { error: authError } = await this.supabaseAdmin.auth.admin.deleteUser(authUserId);
    if (authError) return { error: authError.message };
    // Also delete profile explicitly in case cascade isn't set up
    await (this.supabase.from('profiles').delete().eq('id', profileId) as any);
    return {};
  }

  async getAllBookings(): Promise<Booking[]> {
    const { data, error } = await (this.supabase
      .from('bookings')
      .select('*')
      .order('booking_date', { ascending: true })
      .order('start_time', { ascending: true }) as any);
    if (error) return [];
    return data || [];
  }

  /** Bookings near a date for overlap checks (±1 day). */
  async getBookingsNearDate(bookingDate: string): Promise<Booking[]> {
    return this.getBookingsInDateRange(this.addDays(bookingDate, -1), this.addDays(bookingDate, 1));
  }

  /** Wider window for finding the previous driver's trip before handoff (±7 days). */
  async getBookingsForHandoffCheck(bookingDate: string): Promise<Booking[]> {
    return this.getBookingsInDateRange(this.addDays(bookingDate, -7), this.addDays(bookingDate, 1));
  }

  private async getBookingsInDateRange(fromDate: string, toDate: string): Promise<Booking[]> {
    const { data, error } = await (this.supabase
      .from('bookings')
      .select('*')
      .gte('booking_date', fromDate)
      .lte('booking_date', toDate)
      .neq('status', 'rejected')
      .order('booking_date', { ascending: true })
      .order('start_time', { ascending: true }) as any);
    if (error) return [];
    return data || [];
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  get hasAdminApi(): boolean {
    return !!this.supabaseAdmin;
  }

  async requestPasswordReset(email: string) {
    try {
      const result = await (this.supabase.from('password_reset_requests').insert({ email }) as any);
      return result;
    } catch {
      return { error: { message: 'Password reset table not set up yet. Run the SQL setup script in Supabase.' } };
    }
  }

  async getPendingPasswordResets(): Promise<PasswordResetRequest[]> {
    const { data, error } = await (this.supabase
      .from('password_reset_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }) as any);
    if (error) return [];
    return data || [];
  }

  async approvePasswordReset(id: string, email: string): Promise<{ error?: string }> {
    if (!this.supabaseAdmin) {
      return { error: 'Service key not configured. Add SUPABASE_SERVICE_ROLE to your environment.' };
    }
    const { data: profile, error: profileError } = await (this.supabase
      .from('profiles')
      .select('auth_user_id')
      .eq('email', email)
      .single() as any);
    if (profileError || !profile?.auth_user_id) {
      return { error: 'User profile not found for that email.' };
    }
    const tempPassword =
      Math.random().toString(36).slice(2, 8) +
      Math.random().toString(36).slice(2, 6).toUpperCase() +
      Math.floor(Math.random() * 90 + 10);
    const { error: authError } = await this.supabaseAdmin.auth.admin.updateUserById(
      profile.auth_user_id,
      { password: tempPassword }
    );
    if (authError) return { error: authError.message };
    const { error: dbError } = await (this.supabase
      .from('password_reset_requests')
      .update({ status: 'approved', temp_password: tempPassword })
      .eq('id', id) as any);
    if (dbError) return { error: dbError.message };
    return {};
  }

  async checkApprovedReset(email: string): Promise<{ id: string; temp_password: string } | null> {
    const { data, error } = await (this.supabase
      .from('password_reset_requests')
      .select('id, temp_password')
      .eq('email', email)
      .eq('status', 'approved')
      .limit(1)
      .single() as any);
    if (error || !data) return null;
    return data;
  }

  async clearPasswordReset(email: string) {
    return this.supabase.from('password_reset_requests').delete().eq('email', email) as any;
  }

  async updateUserPassword(newPassword: string) {
    return this.supabase.auth.updateUser({ password: newPassword });
  }

  async signOut() {
    await this.supabase.auth.signOut();
    this.authUser$.next(null);
  }

  async getAccessToken(): Promise<string | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  /** Current user's bookings only (My Trips page). */
  async getMyBookings(): Promise<Booking[]> {
    const user = this.authUser$.getValue();
    if (!user) {
      return [];
    }
    const { data, error } = await (this.supabase
      .from('bookings')
      .select('*')
      .eq('user_profile_id', user.id)
      .order('booking_date', { ascending: true })
      .order('start_time', { ascending: true }) as any);
    if (error) {
      console.error('Error loading my bookings', error.message);
      return [];
    }
    return data || [];
  }

  /** All users' bookings — admin only (All Bookings page). */
  async getAllBookingsForAdmin(): Promise<Booking[]> {
    const user = this.authUser$.getValue();
    if (!user?.is_admin) {
      return [];
    }
    const { data, error } = await (this.supabase
      .from('bookings')
      .select('*')
      .order('booking_date', { ascending: true })
      .order('start_time', { ascending: true }) as any);
    if (error) {
      console.error('Error loading all bookings', error.message);
      return [];
    }
    return data || [];
  }

  /** Shared calendar: all users' bookings (pending/approved/completed; not rejected). */
  async getBookings(): Promise<Booking[]> {
    const user = this.authUser$.getValue();
    if (!user) {
      return [];
    }
    const { data, error } = await (this.supabase
      .from('bookings')
      .select('*')
      .order('booking_date', { ascending: true })
      .order('start_time', { ascending: true }) as any);
    if (error) {
      console.error('Error loading bookings', error.message);
      return [];
    }
    return data || [];
  }

  async createBooking(booking: Partial<Booking>) {
    return this.supabase.from('bookings').insert(booking).select('*') as any;
  }

  async updateBooking(id: string, updates: Partial<Booking>) {
    return this.supabase.from('bookings').update(updates).eq('id', id).select('*') as any;
  }

  async approveBooking(id: string, status: 'approved' | 'rejected') {
    const user = this.authUser$.getValue();
    if (!user?.is_admin) {
      return { data: null, error: { message: 'Only admins can approve or reject bookings.' } };
    }
    return this.supabase.from('bookings').update({ status }).eq('id', id).select('*') as any;
  }

  /** Admin cancels an approved booking (frees the slot; shows as rejected for the user). */
  async cancelBooking(id: string) {
    const user = this.authUser$.getValue();
    if (!user?.is_admin) {
      return { data: null, error: { message: 'Only admins can cancel bookings.' } };
    }
    return this.supabase
      .from('bookings')
      .update({ status: 'rejected' })
      .eq('id', id)
      .eq('status', 'approved')
      .select('*') as any;
  }

  async pullReport(fromDate: string, toDate: string) {
    const user = this.authUser$.getValue();
    if (!user?.is_admin) {
      return { data: null, error: { message: 'Only admins can pull reports.' } };
    }
    return this.supabase
      .from('bookings')
      .select('*')
      .gte('booking_date', fromDate)
      .lte('booking_date', toDate)
      .order('booking_date', { ascending: true }) as any;
  }

  async getLastCompletedTrip(userProfileId: string, beforeBookingId?: string): Promise<Booking | null> {
    let query = this.supabase
      .from('bookings')
      .select('*')
      .eq('user_profile_id', userProfileId)
      .eq('status', 'completed')
      .not('actual_end_km', 'is', null)
      .order('booking_date', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1) as any;

    if (beforeBookingId) {
      query = query.neq('id', beforeBookingId);
    }

    const { data, error } = await query;
    if (error || !data?.length) return null;
    return data[0];
  }

  async getMyPendingSettlement(): Promise<SettlementRequest | null> {
    const user = this.authUser$.getValue();
    if (!user) return null;
    const { data, error } = await (this.supabase
      .from('settlement_requests')
      .select('*')
      .eq('user_profile_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as any);
    if (error || !data) return null;
    return data;
  }

  async getMySettlements(): Promise<SettlementRequest[]> {
    const user = this.authUser$.getValue();
    if (!user) return [];
    const { data, error } = await (this.supabase
      .from('settlement_requests')
      .select('*')
      .eq('user_profile_id', user.id)
      .order('created_at', { ascending: false }) as any);
    if (error) return [];
    return data || [];
  }

  async getPendingSettlementsForAdmin(): Promise<SettlementRequest[]> {
    const user = this.authUser$.getValue();
    if (!user?.is_admin) return [];
    const { data, error } = await (this.supabase
      .from('settlement_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }) as any);
    if (error) return [];
    return data || [];
  }

  async getOdometerMismatchBookings(): Promise<Booking[]> {
    const user = this.authUser$.getValue();
    if (!user?.is_admin) return [];
    const { data, error } = await (this.supabase
      .from('bookings')
      .select('*')
      .eq('odometer_mismatch', true)
      .order('booking_date', { ascending: false }) as any);
    if (error) return [];
    return data || [];
  }

  async requestSettlement(
    amount: number,
    items: { booking_id: string; km: number; rate: number; amount: number }[]
  ): Promise<{ error?: string; data?: SettlementRequest }> {
    const user = this.authUser$.getValue();
    if (!user) return { error: 'You must be logged in.' };
    if (amount <= 0 || !items.length) return { error: 'No balance to settle.' };

    const pending = await this.getMyPendingSettlement();
    if (pending) return { error: 'You already have a pending settlement request.' };

    const { data: created, error } = await (this.supabase
      .from('settlement_requests')
      .insert({
        user_profile_id: user.id,
        user_email: user.email,
        amount,
        status: 'pending'
      })
      .select('*')
      .single() as any);

    if (error || !created) {
      return { error: error?.message || 'Could not create settlement request.' };
    }

    const rows = items.map(item => ({
      settlement_id: created.id,
      booking_id: item.booking_id,
      km: item.km,
      rate: item.rate,
      amount: item.amount
    }));

    const { error: itemsError } = await (this.supabase.from('settlement_items').insert(rows) as any);
    if (itemsError) {
      await (this.supabase.from('settlement_requests').delete().eq('id', created.id) as any);
      return { error: itemsError.message };
    }

    return { data: created };
  }

  async reviewSettlement(id: string, status: 'approved' | 'rejected'): Promise<{ error?: string }> {
    const user = this.authUser$.getValue();
    if (!user?.is_admin) return { error: 'Only admins can review settlements.' };

    const { data: settlement, error: loadError } = await (this.supabase
      .from('settlement_requests')
      .select('*')
      .eq('id', id)
      .eq('status', 'pending')
      .single() as any);

    if (loadError || !settlement) {
      return { error: 'Settlement request not found or already reviewed.' };
    }

    const { error: updateError } = await (this.supabase
      .from('settlement_requests')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id
      })
      .eq('id', id) as any);

    if (updateError) return { error: updateError.message };

    if (status === 'approved') {
      const { data: items, error: itemsError } = await (this.supabase
        .from('settlement_items')
        .select('booking_id')
        .eq('settlement_id', id) as any);

      if (itemsError) return { error: itemsError.message };

      for (const item of items || []) {
        await (this.supabase
          .from('bookings')
          .update({ settled_in_settlement_id: id })
          .eq('id', item.booking_id) as any);
      }
    }

    return {};
  }
}
