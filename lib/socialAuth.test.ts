/// <reference types="jest" />

/**
 * Unit-Tests: Google-Login über den Supabase-OAuth-Browserflow
 * (lib/socialAuth.ts → signInWithGoogle).
 */

jest.mock('@/services/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
    },
  },
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `avorasport://${path}`,
  parse: (url: string) => {
    const q = url.split('?')[1] ?? '';
    const queryParams: Record<string, string> = {};
    for (const pair of q.split('&').filter(Boolean)) {
      const [k, v] = pair.split('=');
      queryParams[k] = v ?? '';
    }
    return { queryParams };
  },
}));

// Apple-Pfad wird hier nicht getestet – Module trotzdem stubben, damit der Import klappt.
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'nonce',
  digestStringAsync: jest.fn().mockResolvedValue('hash'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

import * as WebBrowser from 'expo-web-browser';

import { signInWithGoogle } from './socialAuth';
import { supabase } from '@/services/supabaseClient';

const mockOAuth = supabase.auth.signInWithOAuth as jest.Mock;
const mockExchange = supabase.auth.exchangeCodeForSession as jest.Mock;
const mockOpen = WebBrowser.openAuthSessionAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/auth?x=1' }, error: null });
  mockExchange.mockResolvedValue({ data: { session: {} }, error: null });
});

describe('signInWithGoogle', () => {
  it('tauscht den Code aus der Rücklauf-URL gegen eine Session', async () => {
    mockOpen.mockResolvedValue({ type: 'success', url: 'avorasport://auth-callback?code=abc123' });

    await expect(signInWithGoogle()).resolves.toEqual({ ok: true });

    expect(mockOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo: 'avorasport://auth-callback',
          skipBrowserRedirect: true,
        }),
      }),
    );
    expect(mockOpen).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/auth?x=1',
      'avorasport://auth-callback',
    );
    expect(mockExchange).toHaveBeenCalledWith('abc123');
  });

  it('meldet Abbruch, wenn der Browser geschlossen wird', async () => {
    mockOpen.mockResolvedValue({ type: 'cancel' });

    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, cancelled: true });
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('meldet Abbruch bei dismiss', async () => {
    mockOpen.mockResolvedValue({ type: 'dismiss' });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, cancelled: true });
  });

  it('gibt einen Fehler zurück, wenn signInWithOAuth scheitert', async () => {
    mockOAuth.mockResolvedValue({ data: null, error: { message: 'Unsupported provider' } });

    const res = await signInWithGoogle();
    expect(res).toMatchObject({ ok: false, cancelled: false });
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('gibt error_description zurück, wenn kein Code in der Rücklauf-URL steht', async () => {
    mockOpen.mockResolvedValue({
      type: 'success',
      url: 'avorasport://auth-callback?error=access_denied&error_description=Zugriff%20verweigert',
    });

    const res = await signInWithGoogle();
    expect(res).toEqual({ ok: false, cancelled: false, message: 'Zugriff verweigert' });
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('reicht einen Fehler von exchangeCodeForSession als Meldung durch', async () => {
    mockOpen.mockResolvedValue({ type: 'success', url: 'avorasport://auth-callback?code=abc' });
    mockExchange.mockResolvedValue({ data: null, error: { message: 'invalid request' } });

    const res = await signInWithGoogle();
    expect(res).toMatchObject({ ok: false, cancelled: false, message: expect.stringContaining('invalid request') });
  });
});
