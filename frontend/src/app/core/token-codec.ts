const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOKEN_RE = /^Y1\.([A-HJ-NP-Z2-9]{6})\.([0-9A-Z]{1,4})\.([0-9A-Z]{1,9})\.([A-Z2-7]{13})$/;

export function base32(bytes: Uint8Array): string {
  let out = '', buffer = 0, bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(buffer >>> (bits - 5)) & 31]; bits -= 5; }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(buffer << (5 - bits)) & 31];
  return out;
}

export const base36 = (n: number) => n.toString(36).toUpperCase();

export function tokenPrefix(code: string, seq: number, ts: number): string {
  return `Y1.${code}.${base36(seq)}.${base36(ts)}`;
}

export async function importHmacKey(raw: Uint8Array): Promise<CryptoKey> {
  const ab = new ArrayBuffer(raw.byteLength);
  new Uint8Array(ab).set(raw);
  return crypto.subtle.importKey('raw', ab, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function signToken(key: CryptoKey, code: string, seq: number, ts: number): Promise<string> {
  const p = tokenPrefix(code, seq, ts);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(p)));
  return `${p}.${base32(mac.slice(0, 8))}`;
}

export interface ParsedToken { code: string; seq: number; ts: number; raw: string; }

export function parseToken(raw: string): ParsedToken | null {
  const m = TOKEN_RE.exec(raw);
  return m ? { code: m[1], seq: parseInt(m[2], 36), ts: parseInt(m[3], 36), raw } : null;
}
