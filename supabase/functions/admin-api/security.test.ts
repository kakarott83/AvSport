/// <reference types="jest" />

import {
  DEFAULT_ALLOWED_ORIGINS,
  isOriginAllowed,
  isUuid,
  parseAllowedOrigins,
  parseOptionalLimit,
  readAal,
} from './security';

function jwtWith(claims: Record<string, unknown>): string {
  const b64url = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256' })}.${b64url(claims)}.sig`;
}

describe('Origins', () => {
  it('nutzt milan-muc.de als Standard', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(parseAllowedOrigins('  ')).toEqual(DEFAULT_ALLOWED_ORIGINS);
  });

  it('liest eine kommagetrennte Liste und ignoriert abschließende Slashes', () => {
    expect(parseAllowedOrigins('https://a.de/, http://localhost:8080')).toEqual([
      'https://a.de',
      'http://localhost:8080',
    ]);
  });

  it('lässt nur gelistete Origins zu, Requests ohne Origin aber durch', () => {
    expect(isOriginAllowed('https://milan-muc.de', DEFAULT_ALLOWED_ORIGINS)).toBe(true);
    expect(isOriginAllowed('https://evil.example', DEFAULT_ALLOWED_ORIGINS)).toBe(false);
    expect(isOriginAllowed('https://milan-muc.de.evil.example', DEFAULT_ALLOWED_ORIGINS)).toBe(false);
    expect(isOriginAllowed(null, DEFAULT_ALLOWED_ORIGINS)).toBe(true);
  });
});

describe('readAal', () => {
  it('liest aal2 aus dem JWT', () => {
    expect(readAal(`Bearer ${jwtWith({ aal: 'aal2', sub: 'x' })}`)).toBe('aal2');
  });

  it('liefert null bei kaputtem oder fehlendem Token', () => {
    expect(readAal('Bearer abc')).toBeNull();
    expect(readAal(null)).toBeNull();
    expect(readAal(`Bearer ${jwtWith({ sub: 'x' })}`)).toBeNull();
  });
});

describe('parseOptionalLimit', () => {
  it('leer = Standard (null)', () => {
    expect(parseOptionalLimit('', { integer: true })).toEqual({ ok: true, value: null });
    expect(parseOptionalLimit(null, { integer: true })).toEqual({ ok: true, value: null });
  });

  it('akzeptiert Zahlen und deutsche Dezimalkommas', () => {
    expect(parseOptionalLimit('25', { integer: true })).toEqual({ ok: true, value: 25 });
    expect(parseOptionalLimit('7,5', { integer: false })).toEqual({ ok: true, value: 7.5 });
  });

  it('lehnt negative, nicht-ganzzahlige und unsinnige Werte ab', () => {
    expect(parseOptionalLimit(-1, { integer: true }).ok).toBe(false);
    expect(parseOptionalLimit('2.5', { integer: true }).ok).toBe(false);
    expect(parseOptionalLimit('abc', { integer: false }).ok).toBe(false);
  });
});

describe('isUuid', () => {
  it('erkennt UUIDs', () => {
    expect(isUuid('00000000-0000-0000-0000-000000000001')).toBe(true);
    expect(isUuid("1'; drop table x;--")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
