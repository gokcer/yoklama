import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { MSG } from '../shared/messages';

@Component({
  selector: 'app-teacher-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="nav-shell">
      <header class="nav-header">
        <a routerLink="/t" class="nav-title">{{ msg.appTitle }}</a>
        <nav class="nav-links" aria-label="Ana menü">
          <a routerLink="/t" routerLinkActive="active" [routerLinkActiveOptions]="coursesActive" ariaCurrentWhenActive="page">{{ msg.nav.courses }}</a>
          <a routerLink="/t/classrooms" routerLinkActive="active" ariaCurrentWhenActive="page">{{ msg.nav.classrooms }}</a>
          @if (auth.isAdmin) {
            <a routerLink="/t/admin/teachers" routerLinkActive="active" ariaCurrentWhenActive="page">{{ msg.nav.admin }}</a>
          }
          @if (auth.user(); as u) { <span class="nav-user" [title]="u.username">{{ u.displayName || u.username }}</span> }
          <a href="#" (click)="doLogout($event)">{{ msg.nav.logout }}</a>
        </nav>
      </header>
      <main class="nav-content">
        <router-outlet />
      </main>
    </div>
  `,
})
export class TeacherShellComponent {
  readonly auth = inject(AuthService);
  readonly msg = MSG;
  /** "/t" prefixes every teacher route, so the course list link is only active on an exact match. */
  readonly coursesActive = { paths: 'exact', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' } as const;

  doLogout(e: Event) {
    e.preventDefault();
    this.auth.logout();
  }
}
