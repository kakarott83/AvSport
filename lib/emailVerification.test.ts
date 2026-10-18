jest.mock('@/services/supabaseClient', () => ({
  supabase: { auth: { verifyOtp: jest.fn(), resend: jest.fn() } },
}));

import { supabase } from '@/services/supabaseClient';
import { isEmailNotConfirmedError, resendSignupCode, verifySignupCode } from './emailVerification';

const auth = supabase.auth as unknown as Record<string, jest.Mock>;

beforeEach(() => jest.resetAllMocks());

describe('isEmailNotConfirmedError', () => {
  it('erkennt den Fehlercode und die Meldung', () => {
    expect(isEmailNotConfirmedError({ code: 'email_not_confirmed' })).toBe(true);
    expect(isEmailNotConfirmedError({ message: 'Email not confirmed' })).toBe(true);
    expect(isEmailNotConfirmedError({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(false);
    expect(isEmailNotConfirmedError(null)).toBe(false);
  });
});

describe('verifySignupCode', () => {
  it('prüft den bereinigten Code als E-Mail-OTP', async () => {
    auth.verifyOtp.mockResolvedValue({ error: null });
    await expect(verifySignupCode(' a@b.de ', '123 456')).resolves.toEqual({ ok: true });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.de', token: '123456', type: 'email' });
  });

  it('meldet ungültige Codes', async () => {
    auth.verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    await expect(verifySignupCode('a@b.de', '000000')).resolves.toEqual({ ok: false });
  });
});

describe('resendSignupCode', () => {
  it('fordert eine neue Bestätigungs-Mail an', async () => {
    auth.resend.mockResolvedValue({ error: null });
    await expect(resendSignupCode('a@b.de')).resolves.toEqual({ ok: true });
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.de' });
  });

  it('gibt Fehler (z. B. Rate-Limit) weiter', async () => {
    auth.resend.mockResolvedValue({ error: { message: 'email rate limit exceeded' } });
    await expect(resendSignupCode('a@b.de')).resolves.toEqual({ ok: false, message: 'email rate limit exceeded' });
  });
});
