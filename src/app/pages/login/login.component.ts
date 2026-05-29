import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../supabase.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  loginView: 'signin' | 'set-password' = 'signin';
  email = '';
  password = '';
  newPassword = '';
  message = '';
  error = '';
  private approvedReset: { id: string; temp_password: string } | null = null;

  constructor(private supabase: SupabaseService, private router: Router) {}

  ngOnInit(): void {
    this.supabase.authUser$.subscribe(user => {
      if (user) {
        this.router.navigate(['/overview']);
      }
    });
  }

  async submit() {
    this.error = '';
    this.message = '';
    if (!this.email || !this.password) {
      this.error = 'Email and password are required.';
      return;
    }
    const reset = await this.supabase.checkApprovedReset(this.email);
    if (reset) {
      this.approvedReset = reset;
      this.loginView = 'set-password';
      this.password = '';
      return;
    }
    const { error } = await this.supabase.signIn(this.email, this.password);
    if (error) {
      this.error = error.message;
    }
  }

  async setNewPassword() {
    this.error = '';
    if (!this.newPassword || this.newPassword.length < 6) {
      this.error = 'Password must be at least 6 characters.';
      return;
    }
    if (!this.approvedReset?.temp_password) {
      this.error = 'Reset data missing. Please try again.';
      return;
    }
    const { error: signInError } = await this.supabase.signIn(this.email, this.approvedReset.temp_password);
    if (signInError) {
      this.error = 'Could not verify reset. Please contact the admin.';
      return;
    }
    const { error: updateError } = await this.supabase.updateUserPassword(this.newPassword);
    if (updateError) {
      this.error = updateError.message;
      return;
    }
    await this.supabase.clearPasswordReset(this.email);
  }

  async requestReset() {
    this.error = '';
    this.message = '';
    if (!this.email) {
      this.error = 'Enter your email address above first.';
      return;
    }
    const { error } = await this.supabase.requestPasswordReset(this.email);
    if (error) {
      this.error = error.message;
    } else {
      this.message = 'Reset request sent. The admin will approve it and let you know.';
    }
  }
}

