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
  reason: string;
  expected_start_km: number;
  actual_start_km?: number;
  actual_end_km?: number;
  return_time?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  created_at?: string;
  updated_at?: string;
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
    this.supabase = createClient(url, key);
    const serviceKey = environment.supabaseServiceKey;
    if (serviceKey && serviceKey.length > 20) {
      this.supabaseAdmin = createClient(url, serviceKey);
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
    const { data, error } = await (this.supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .limit(1)
      .single() as any);

    if (error && error.code !== 'PGRST116') {
      console.error('Unable to load profile:', error.message);
    }

    if (data) {
      this.authUser$.next(data);
    } else {
      const insertResult = await (this.supabase
        .from('profiles')
        .insert({ email, auth_user_id: user.id, is_admin: false })
        .select('*')
        .single() as any);

      if (insertResult.data) {
        this.authUser$.next(insertResult.data);
      }
    }
  }

  async signIn(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({ email, password });
  }

  async createUser(email: string, password: string, fullName: string, isAdmin: boolean): Promise<{ error?: string }> {
    if (!this.supabaseAdmin) {
      return { error: 'Service key not configured. Add SUPABASE_SERVICE_ROLE to your environment variables.' };
    }
    const { data, error } = await this.supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (error) return { error: error.message };
    const { error: profileError } = await (this.supabaseAdmin
      .from('profiles')
      .insert({ email, auth_user_id: data.user.id, full_name: fullName || null, is_admin: isAdmin }) as any);
    if (profileError) return { error: profileError.message };
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

  async getBookings() {
    const user = this.authUser$.getValue();
    if (!user) {
      return [] as Booking[];
    }
    const query = this.supabase.from('bookings').select('*').order('booking_date', { ascending: true }).order('start_time', { ascending: true }) as any;
    if (!user.is_admin) {
      query.eq('user_profile_id', user.id);
    }
    const { data, error } = await query;
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
    return this.updateBooking(id, { status });
  }

  async pullReport(fromDate: string, toDate: string) {
    return this.supabase
      .from('bookings')
      .select('*')
      .gte('booking_date', fromDate)
      .lte('booking_date', toDate)
      .order('booking_date', { ascending: true }) as any;
  }
}
