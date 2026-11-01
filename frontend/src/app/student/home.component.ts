import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MSG } from '../shared/messages';

/** Session code alphabet (02 §1.3): no 0/O/1/I. */
const CODE_CHARS = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;
const CODE_LENGTH = 6;

@Component({
  selector: 'app-home',
  imports: [RouterLink, FormsModule],
  template: `
    <main class="home">
      <div class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
          <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10-2h2v2h-2v-2zm-2 2h2v2h-2v-2zm4 0h2v2h-2v-2zm2-2h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v4h-4v-2h2v-2zm-6 2h2v2h-2v-2z"/>
        </svg>
      </div>
      <h1>{{ msg.appTitle }}</h1>
      <p class="subtitle">Dönen QR ile sınıf yoklama sistemi</p>
      <form (ngSubmit)="go()" class="card code-form">
        <label for="code" class="code-label">{{ msg.student.enterCode }}</label>
        <input #codeEl id="code" class="form-input code-input" [value]="code()" (input)="onInput(codeEl)" name="code"
          [placeholder]="msg.student.codePlaceholder" [attr.maxlength]="codeLength"
          autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go"
          aria-describedby="code-hint" />
        <div id="code-hint" class="text-sm text-secondary">{{ msg.student.codeHint }}</div>
        <button class="btn btn-primary btn-block" [disabled]="code().length !== codeLength">{{ msg.student.continue }}</button>
      </form>
      <a routerLink="/t/login" class="link">Öğretim üyesi girişi</a>
    </main>
  `,
  styles: [`
    .home { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; min-height: 100dvh; text-align: center; padding: 16px; }
    .logo { width: 64px; height: 64px; border-radius: 16px; background: var(--c-primary); color: #fff; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; box-shadow: var(--shadow-md); }
    h1 { font-size: 2rem; margin: 0 0 4px; }
    .subtitle { color: var(--c-text-secondary); margin: 0 0 24px; }
    .code-form { width: 100%; max-width: 360px; margin-bottom: 24px; display: flex; flex-direction: column; gap: 12px; text-align: left; }
    .code-label { font-weight: 600; }
    .code-input { text-transform: uppercase; letter-spacing: 6px; text-align: center; font-size: 1.75rem; font-family: var(--font-mono); min-height: 56px; }
    .code-input::placeholder { letter-spacing: 1px; font-size: 1rem; font-family: var(--font); text-transform: none; }
    .btn-block { width: 100%; min-height: 48px; }
    .link { color: var(--c-primary); }
  `],
})
export class HomeComponent {
  private readonly router = inject(Router);
  readonly msg = MSG;
  readonly codeLength = CODE_LENGTH;
  readonly code = signal('');

  /** Keeps only valid code characters, so a typo like "O" for "0" is caught while typing. */
  onInput(el: HTMLInputElement) {
    const clean = el.value.toLocaleUpperCase('en-US').replace(CODE_CHARS, '').slice(0, CODE_LENGTH);
    // Write back directly: when the cleaned value equals the previous one the binding would not refresh.
    if (el.value !== clean) el.value = clean;
    this.code.set(clean);
  }

  go() {
    const c = this.code();
    if (c.length === CODE_LENGTH) this.router.navigate(['/c', c]);
  }
}
