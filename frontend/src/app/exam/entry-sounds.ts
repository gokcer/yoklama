import { Injectable, signal } from '@angular/core';
import type { EntryFeedback } from './exam-entry.logic';

const STORAGE_KEY = 'yoklama.examEntry.sound';

function readEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

/** Plays the answer-entry feedback sounds (public/sounds): a short tone or the correct letter in English. */
@Injectable({ providedIn: 'root' })
export class EntrySounds {
  readonly enabled = signal(readEnabled());
  private readonly cache = new Map<string, HTMLAudioElement>();
  private current: HTMLAudioElement | null = null;

  toggle() {
    const on = !this.enabled();
    this.enabled.set(on);
    try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
    if (!on) this.stop();
  }

  /** Loads the files ahead of time so the first answer plays without delay. */
  preload() {
    if (typeof Audio === 'undefined') return;
    for (const name of ['ok', 'a', 'b', 'c', 'd', 'e', 'f']) this.audio(name);
  }

  play(feedback: EntryFeedback) {
    if (!this.enabled() || typeof Audio === 'undefined') return;
    this.stop();
    const a = this.audio(feedback.toLowerCase());
    a.currentTime = 0;
    this.current = a;
    a.play().catch(() => { /* autoplay blocked or file missing: entry keeps working silently */ });
  }

  private stop() {
    if (!this.current) return;
    this.current.pause();
    this.current = null;
  }

  private audio(name: string): HTMLAudioElement {
    let a = this.cache.get(name);
    if (!a) {
      a = new Audio(`/sounds/${name}.wav`);
      a.preload = 'auto';
      this.cache.set(name, a);
    }
    return a;
  }
}
