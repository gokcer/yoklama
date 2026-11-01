import { describe, it, expect } from 'vitest';
import { base32, base36, tokenPrefix, parseToken, signToken, importHmacKey } from './token-codec';

describe('base32', () => {
  it('vector 02 §1.2', () => {
    const input = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77]);
    expect(base32(input)).toBe('AAISEM2EKVTHO');
  });

  it('empty', () => {
    expect(base32(new Uint8Array([]))).toBe('');
  });
});

describe('base36', () => {
  it('0 -> "0"', () => expect(base36(0)).toBe('0'));
  it('7 -> "7"', () => expect(base36(7)).toBe('7'));
  it('1295 -> "ZZ"', () => expect(base36(1295)).toBe('ZZ'));
  it('1760000000000 -> "MGJ6K3CW"', () => expect(base36(1760000000000)).toBe('MGJ6K3CW'));
});

describe('parseToken', () => {
  it('T-1', () => {
    const t = parseToken('Y1.ABC234.7.MGJ6K3CW.77B7SI2E54AA2');
    expect(t).not.toBeNull();
    expect(t!.code).toBe('ABC234');
    expect(t!.seq).toBe(7);
    expect(t!.ts).toBe(1760000000000);
  });

  it('T-2', () => {
    const t = parseToken('Y1.K7Q2ZP.ZZ.MGJ6K4IK.NNSGYSRVIIHIU');
    expect(t).not.toBeNull();
    expect(t!.code).toBe('K7Q2ZP');
    expect(t!.seq).toBe(1295);
    expect(t!.ts).toBe(1760000001500);
  });

  it('T-3', () => {
    const t = parseToken('Y1.ABC234.0.MGJ6K3CW.SGERQ6UXA4VUK');
    expect(t).not.toBeNull();
    expect(t!.seq).toBe(0);
  });

  it('lowercase rejected', () => {
    expect(parseToken('y1.abc234.7.mgj6k3cw.77b7si2e54aa2')).toBeNull();
  });

  it('invalid code alphabet', () => {
    expect(parseToken('Y1.ABC1O3.7.MGJ6K3CW.77B7SI2E54AA2')).toBeNull();
  });

  it('null/garbage', () => {
    expect(parseToken('NOT_A_TOKEN')).toBeNull();
  });
});

describe('signToken', () => {
  const sessionKeyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) sessionKeyBytes[i] = i;

  it('T-1', async () => {
    const key = await importHmacKey(sessionKeyBytes);
    const token = await signToken(key, 'ABC234', 7, 1760000000000);
    expect(token).toBe('Y1.ABC234.7.MGJ6K3CW.77B7SI2E54AA2');
  });

  it('T-2', async () => {
    const key = await importHmacKey(sessionKeyBytes);
    const token = await signToken(key, 'K7Q2ZP', 1295, 1760000001500);
    expect(token).toBe('Y1.K7Q2ZP.ZZ.MGJ6K4IK.NNSGYSRVIIHIU');
  });

  it('T-3', async () => {
    const key = await importHmacKey(sessionKeyBytes);
    const token = await signToken(key, 'ABC234', 0, 1760000000000);
    expect(token).toBe('Y1.ABC234.0.MGJ6K3CW.SGERQ6UXA4VUK');
  });
});

describe('tokenPrefix', () => {
  it('T-1 prefix', () => {
    expect(tokenPrefix('ABC234', 7, 1760000000000)).toBe('Y1.ABC234.7.MGJ6K3CW');
  });

  it('T-2 prefix', () => {
    expect(tokenPrefix('K7Q2ZP', 1295, 1760000001500)).toBe('Y1.K7Q2ZP.ZZ.MGJ6K4IK');
  });
});
