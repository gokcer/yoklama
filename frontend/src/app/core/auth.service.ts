import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import type { AuthUser } from './api.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly user = signal<AuthUser | null>(null);
  readonly loading = signal(true);
  private initPromise: Promise<void> | null = null;

  /** Runs once per page load: makes sure the XSRF cookie exists (06 §2) and loads the current user. */
  ensureInit(): Promise<void> {
    this.initPromise ??= this.init();
    return this.initPromise;
  }

  private async init(): Promise<void> {
    try {
      await this.api.csrf();
    } catch { /* ignore: login retries it */ }
    try {
      this.user.set(await this.api.me());
    } catch {
      this.user.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async login(username: string, password: string): Promise<void> {
    await this.api.csrf();
    const u = await this.api.login(username, password);
    this.user.set(u);
    this.loading.set(false);
    this.initPromise = Promise.resolve();
  }

  async logout(): Promise<void> {
    try { await this.api.logout(); } catch { /* ignore */ }
    this.user.set(null);
    this.router.navigateByUrl('/t/login');
  }

  get isAdmin(): boolean { return this.user()?.role === 'ADMIN'; }
}
