import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { MSG } from '../shared/messages';
import { errorMessage } from '../shared/errors';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="login-page">
      <div class="card login-card">
        <h1>{{ msg.login.title }}</h1>
        <form (ngSubmit)="doLogin()">
          <div class="form-group">
            <label>{{ msg.login.username }}</label>
            <input class="form-input" [(ngModel)]="username" name="username" autocomplete="username" autofocus />
          </div>
          <div class="form-group">
            <label>{{ msg.login.password }}</label>
            <input class="form-input" type="password" [(ngModel)]="password" name="password" autocomplete="current-password" />
          </div>
          @if (error()) { <p class="form-error">{{ error() }}</p> }
          <button class="btn btn-primary" style="width:100%" [disabled]="loading()">{{ msg.login.submit }}</button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-page { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; }
    .login-card { width: 100%; max-width: 380px; }
    h1 { margin: 0 0 var(--space-lg); font-size: 1.5rem; text-align: center; }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly msg = MSG;
  username = '';
  password = '';
  error = signal('');
  loading = signal(false);

  async doLogin() {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.login(this.username, this.password);
      this.router.navigateByUrl('/t');
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      this.error.set(code === 'UNAUTHORIZED' || code === 'VALIDATION_ERROR' ? this.msg.login.error : errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
