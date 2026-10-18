/// <reference types="jest" />

import { estimateCostUsd, quotaRejection, sanitizeFeature, validateParts } from './request';

describe('validateParts', () => {
  it('akzeptiert Text und JPEG-Bilder', () => {
    const result = validateParts([{ text: 'hi' }, { inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } }]);
    expect(result).toEqual({
      parts: [{ text: 'hi' }, { inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } }],
    });
  });

  it('lehnt leere, zu viele oder fremde parts ab', () => {
    expect(validateParts([])).toHaveProperty('error');
    expect(validateParts('hi')).toHaveProperty('error');
    expect(validateParts(Array(7).fill({ text: 'x' }))).toHaveProperty('error');
    expect(validateParts([{ inline_data: { mime_type: 'application/pdf', data: 'AAAA' } }])).toHaveProperty('error');
    expect(validateParts([{ file_data: { uri: 'gs://x' } }])).toHaveProperty('error');
  });
});

describe('sanitizeFeature', () => {
  it('lässt gültige Tags durch und ersetzt alles andere durch unknown', () => {
    expect(sanitizeFeature('food_photo')).toBe('food_photo');
    expect(sanitizeFeature('DROP TABLE')).toBe('unknown');
    expect(sanitizeFeature(undefined)).toBe('unknown');
  });
});

describe('quotaRejection', () => {
  it('erlaubt, wenn kein Grund vorliegt', () => {
    expect(quotaRejection(null)).toBeNull();
  });

  it('übersetzt Gründe in HTTP-Status', () => {
    expect(quotaRejection('blocked')).toEqual({ status: 403, code: 'blocked' });
    expect(quotaRejection('daily_limit')).toEqual({ status: 429, code: 'daily_limit' });
    expect(quotaRejection('monthly_cost_cap')).toEqual({ status: 429, code: 'monthly_cost_cap' });
  });
});

describe('estimateCostUsd', () => {
  it('rechnet mit den gemini-2.5-flash-Preisen', () => {
    expect(estimateCostUsd({ promptTokenCount: 1_000_000, candidatesTokenCount: 1_000_000 })).toBeCloseTo(2.8);
    expect(estimateCostUsd(null)).toBe(0);
  });
});
