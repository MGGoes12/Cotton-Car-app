import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { BookingComponent } from './pages/booking/booking.component';
import { MyBookingsComponent } from './pages/my-bookings/my-bookings.component';
import { OverviewComponent } from './pages/overview/overview.component';

export const appRoutes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'booking', component: BookingComponent },
  { path: 'my-bookings', component: MyBookingsComponent },
  { path: 'overview', component: OverviewComponent },
  { path: '', redirectTo: 'overview', pathMatch: 'full' },
  { path: '**', redirectTo: 'overview' }
];
