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

  async signUp(email: string, password: string) {
    return this.supabase.auth.signUp({ email, password });
  }

  async resetPassword(email: string) {
    return this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
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
