import { Injectable, inject, signal } from '@angular/core';
import { NavigationError, NavigationStart, Router } from '@angular/router';

const CHECK_INTERVAL_MS = 60_000;
const MAIN_BUNDLE_RE = /main-[A-Za-z0-9_-]+\.js/;

/** Extracts the hashed main bundle name (`main-XXXX.js`) from index.html text; null in dev builds. */
export function mainBundleOf(html: string): string | null {
  return MAIN_BUNDLE_RE.exec(html)?.[0] ?? null;
}

/**
 * Detects a new deployment by polling index.html for a different main bundle hash.
 * Once one is out, the next in-app navigation becomes a full page load, so long-open tabs
 * pick up the new code without interrupting whatever is on screen right now.
 */
@Injectable({ providedIn: 'root' })
export class VersionService {
  private readonly router = inject(Router);
  private readonly current = this.loadedBundle();
  readonly updateAvailable = signal(false);

  start(): void {
    if (!this.current) return;   // dev server: no hashed bundles
    setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.check();
    });
    this.router.events.subscribe(e => {
      if (e instanceof NavigationStart && this.updateAvailable()) {
        location.assign(e.url);
      } else if (e instanceof NavigationError && /dynamically imported module|Loading chunk/i.test(String(e.error))) {
        // An old tab asked for a lazy chunk that the new deployment no longer has.
        location.assign(e.url);
      }
    });
  }

  async check(): Promise<boolean> {
    if (this.updateAvailable()) return true;
    try {
      const res = await fetch('/', { cache: 'no-store' });
      if (!res.ok) return false;
      const latest = mainBundleOf(await res.text());
      if (latest && latest !== this.current) this.updateAvailable.set(true);
    } catch { /* offline: try again later */ }
    return this.updateAvailable();
  }

  private loadedBundle(): string | null {
    for (const s of Array.from(document.scripts)) {
      const name = mainBundleOf(s.src);
      if (name) return name;
    }
    return null;
  }
}
