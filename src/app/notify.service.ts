import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type NotifyType = 'new_booking' | 'odometer_mismatch' | 'settlement_request' | 'missing_prior_end_km';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  constructor(private supabase: SupabaseService) {}

  /** Fire-and-forget admin email via Vercel /api/notify (requires server env vars). */
  async notifyAdmins(type: NotifyType, payload: Record<string, unknown>): Promise<void> {
    try {
      const token = await this.supabase.getAccessToken();
      if (!token) return;

      await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ type, payload })
      });
    } catch (err) {
      console.warn('Admin notification failed (email may not be configured):', err);
    }
  }
}
