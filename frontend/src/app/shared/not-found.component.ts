import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <div class="nf">
      <h1>Sayfa bulunamadı</h1>
      <a routerLink="/">Ana sayfaya dön</a>
    </div>
  `,
  styles: [`.nf { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; text-align: center; }`],
})
export class NotFoundComponent {}
