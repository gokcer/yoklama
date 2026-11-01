import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureInit();
  if (auth.user()) return true;
  return router.parseUrl('/t/login');
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureInit();
  if (auth.user()?.role === 'ADMIN') return true;
  return router.parseUrl('/t');
};
