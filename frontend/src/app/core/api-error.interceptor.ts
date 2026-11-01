import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import type { ApiError } from './api.models';
import { MSG } from '../shared/messages';

export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // An expired teacher session inside /t sends the user to the login page. /api/auth/* is left to
      // the auth guard and the login form.
      if (err.status === 401 && req.url.startsWith('/api/') && !req.url.startsWith('/api/public/')
          && !req.url.startsWith('/api/auth/')) {
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/t')) {
          router.navigateByUrl('/t/login');
        }
      }
      const apiError: ApiError = err.error && typeof err.error === 'object' && err.error.code
        ? err.error
        : { code: err.status === 0 ? 'UNKNOWN' : `HTTP_${err.status}`,
            message: err.status === 0 ? MSG.errors.network : MSG.errors.generic };
      return throwError(() => apiError);
    }),
  );
};
