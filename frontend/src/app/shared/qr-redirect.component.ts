import { Component, inject, input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { parseToken } from '../core/token-codec';

/**
 * Handles `/q/:token` URLs embedded in the rotating QR code.
 * Extracts the session CODE from the token and redirects to `/c/:code`.
 */
@Component({
  selector: 'app-qr-redirect',
  template: `<p style="text-align:center;padding:2rem">Yönlendiriliyor…</p>`,
})
export class QrRedirectComponent implements OnInit {
  private readonly router = inject(Router);
  readonly token = input.required<string>();

  ngOnInit() {
    const parsed = parseToken(this.token());
    if (parsed) {
      void this.router.navigate(['/c', parsed.code]);
    } else {
      void this.router.navigate(['/']);
    }
  }
}
