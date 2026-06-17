import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type NotifyType = 'new_booking' | 'odometer_mismatch' | 'settlement_request' | 'missing_prior_end_km';

export interface NotifyResult {
  ok: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class NotifyService {
  constructor(private supabase: SupabaseService) {}

  /** Send admin email via Vercel /api/notify (requires server env vars). */
  async notifyAdmins(type: NotifyType, payload: Record<string, unknown>): Promise<NotifyResult> {
    try {
      const token = await this.supabase.getAccessToken();
      if (!token) {
        return { ok: false, error: 'Not signed in — cannot send notification.' };
      }

      const url = `${window.location.origin}/api/notify`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ type, payload })
      });

      if (!response.ok) {
        const detail = await response.text();
        console.error(`Admin notification failed (${response.status}):`, detail);
        return { ok: false, error: detail || `HTTP ${response.status}` };
      }

      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Admin notification failed:', message);
      return { ok: false, error: message };
    }
  }
}
