import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { SupabaseService } from '../supabase.service';

export const authGuard: CanActivateFn = () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  return supabase.authUser$.pipe(
    take(1),
    map(user => {
      if (user) return true;
      return router.createUrlTree(['/login']);
    })
  );
};
