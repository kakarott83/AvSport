/// <reference types="jest" />

import { resolvePremiumState } from './resolvePremium';

const NOW = Date.UTC(2026, 8, 1); // 2026-09-01
const FUTURE = NOW + 30 * 24 * 3600 * 1000;
const PAST = NOW - 24 * 3600 * 1000;

describe('resolvePremiumState', () => {
  it('gewährt Premium bei INITIAL_PURCHASE mit künftigem Ablauf', () => {
    expect(
      resolvePremiumState(
        { type: 'INITIAL_PURCHASE', app_user_id: 'u1', product_id: 'avora_yearly', expiration_at_ms: FUTURE },
        NOW,
      ),
    ).toEqual({
      userId: 'u1',
      isPremium: true,
      premiumUntil: new Date(FUTURE).toISOString(),
      premiumProduct: 'avora_yearly',
    });
  });

  it('gewährt Premium bei RENEWAL', () => {
    expect(resolvePremiumState({ type: 'RENEWAL', app_user_id: 'u1', expiration_at_ms: FUTURE }, NOW)?.isPremium).toBe(true);
  });

  it('entzieht Premium bei EXPIRATION', () => {
    expect(resolvePremiumState({ type: 'EXPIRATION', app_user_id: 'u1', expiration_at_ms: PAST }, NOW)?.isPremium).toBe(false);
  });

  it('behält Premium bei CANCELLATION bis zum Periodenende', () => {
    expect(resolvePremiumState({ type: 'CANCELLATION', app_user_id: 'u1', expiration_at_ms: FUTURE }, NOW)?.isPremium).toBe(true);
  });

  it('entzieht Premium bei RENEWAL mit abgelaufenem Datum', () => {
    expect(resolvePremiumState({ type: 'RENEWAL', app_user_id: 'u1', expiration_at_ms: PAST }, NOW)?.isPremium).toBe(false);
  });

  it('gewährt Premium bei NON_RENEWING_PURCHASE ohne Ablaufdatum', () => {
    const s = resolvePremiumState({ type: 'NON_RENEWING_PURCHASE', app_user_id: 'u1', product_id: 'avora_lifetime' }, NOW);
    expect(s?.isPremium).toBe(true);
    expect(s?.premiumUntil).toBeNull();
  });

  it('nutzt original_app_user_id als Fallback', () => {
    expect(resolvePremiumState({ type: 'RENEWAL', original_app_user_id: 'orig', expiration_at_ms: FUTURE }, NOW)?.userId).toBe('orig');
  });

  it('gibt null zurück ohne User-ID', () => {
    expect(resolvePremiumState({ type: 'RENEWAL', expiration_at_ms: FUTURE }, NOW)).toBeNull();
  });

  it('gibt null zurück bei irrelevantem Event-Typ', () => {
    expect(resolvePremiumState({ type: 'TRANSFER', app_user_id: 'u1' }, NOW)).toBeNull();
    expect(resolvePremiumState({ type: 'BILLING_ISSUE', app_user_id: 'u1' }, NOW)).toBeNull();
  });

  it('gibt null zurück für leeres Event', () => {
    expect(resolvePremiumState(null)).toBeNull();
    expect(resolvePremiumState(undefined)).toBeNull();
  });
});
