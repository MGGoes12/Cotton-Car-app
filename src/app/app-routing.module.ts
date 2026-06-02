import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { BookingComponent } from './pages/booking/booking.component';
import { MyBookingsComponent } from './pages/my-bookings/my-bookings.component';
import { OverviewComponent } from './pages/overview/overview.component';
import { AllBookingsComponent } from './pages/all-bookings/all-bookings.component';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { guestGuard } from './guards/guest.guard';

export const appRoutes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'booking', component: BookingComponent, canActivate: [authGuard] },
  { path: 'my-bookings', component: MyBookingsComponent, canActivate: [authGuard] },
  { path: 'all-bookings', component: AllBookingsComponent, canActivate: [authGuard, adminGuard] },
  { path: 'overview', component: OverviewComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'overview', pathMatch: 'full' },
  { path: '**', redirectTo: 'overview' }
];
