import { MSG } from './messages';

/** User-facing text for an error thrown by ApiService (server `message`, already Turkish). */
export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    const m = (e as { message: string; code?: string }).message;
    if ((e as { code?: string }).code === 'UNKNOWN') return MSG.errors.network;
    return m || MSG.errors.generic;
  }
  return MSG.errors.generic;
}
