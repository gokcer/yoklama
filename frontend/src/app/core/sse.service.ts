import { Injectable } from '@angular/core';

export interface SseSubscription { close(): void; }

/**
 * Per-session EventSource with manual back-off (2 → 4 → 8 → 15 s). The optional `reconnect` handler
 * runs after every successful re-connection so the caller can refresh its list via REST (06 §5.7).
 */
@Injectable({ providedIn: 'root' })
export class SseService {
  connect(sessionId: number | string, handlers: Record<string, (data: unknown) => void>): SseSubscription {
    let retryDelay = 2000;
    let es: EventSource | null = null;
    let closed = false;
    let opened = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const open = () => {
      if (closed) return;
      es = new EventSource(`/api/sessions/${sessionId}/events`);
      es.onopen = () => {
        retryDelay = 2000;
        if (opened) handlers['reconnect']?.(null);
        opened = true;
      };
      es.onerror = () => {
        es?.close();
        if (closed) return;
        timer = setTimeout(open, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      };
      for (const [event, handler] of Object.entries(handlers)) {
        if (event === 'reconnect') continue;
        es.addEventListener(event, (e: MessageEvent) => {
          let data: unknown;
          try { data = JSON.parse(e.data); } catch { return; }
          handler(data);
        });
      }
    };

    open();

    return {
      close() {
        closed = true;
        if (timer) clearTimeout(timer);
        es?.close();
      },
    };
  }
}
