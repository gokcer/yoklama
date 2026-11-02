import { describe, it, expect } from 'vitest';
import { mainBundleOf } from './version.service';

describe('mainBundleOf', () => {
  it('finds the hashed main bundle in index.html', () => {
    const html = '<script src="polyfills-AB12CD34.js" type="module"></script><script src="main-DIKREGYR.js" type="module"></script>';
    expect(mainBundleOf(html)).toBe('main-DIKREGYR.js');
  });

  it('finds it in an absolute script URL', () => {
    expect(mainBundleOf('https://yoklama.armikom.com/main-X_y-9AbC.js')).toBe('main-X_y-9AbC.js');
  });

  it('returns null for dev builds without hashes', () => {
    expect(mainBundleOf('<script src="main.js"></script>')).toBeNull();
  });
});
