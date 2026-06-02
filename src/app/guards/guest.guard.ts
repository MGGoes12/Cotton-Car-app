import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { SupabaseService } from '../supabase.service';

/** Redirect logged-in users away from login. */
export const guestGuard: CanActivateFn = () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  return supabase.authUser$.pipe(
    take(1),
    map(user => (user ? router.createUrlTree(['/overview']) : true))
  );
};
