import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { LoginComponent } from './pages/login/login.component';
import { BookingComponent } from './pages/booking/booking.component';
import { MyBookingsComponent } from './pages/my-bookings/my-bookings.component';
import { OverviewComponent } from './pages/overview/overview.component';
import { AllBookingsComponent } from './pages/all-bookings/all-bookings.component';
import { TimePickerComponent } from './components/time-picker/time-picker.component';
import { RouterModule } from '@angular/router';
import { appRoutes } from './app-routing.module';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    BookingComponent,
    MyBookingsComponent,
    OverviewComponent,
    AllBookingsComponent,
    TimePickerComponent
  ],
  imports: [BrowserModule, FormsModule, RouterModule.forRoot(appRoutes)],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}
