jest.mock('@/services/supabaseClient', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: jest.fn(),
      verifyOtp: jest.fn(),
      updateUser: jest.fn(),
    },
  },
}));

import { supabase } from '@/services/supabaseClient';
import {
  completePasswordReset,
  normalizeCode,
  requestPasswordReset,
  validateNewPassword,
} from './passwordReset';

const auth = supabase.auth as unknown as Record<string, jest.Mock>;

beforeEach(() => jest.resetAllMocks());

describe('validateNewPassword', () => {
  it('verlangt mindestens 6 Zeichen und zwei gleiche Eingaben', () => {
    expect(validateNewPassword('12345', '12345')).toBe('tooShort');
    expect(validateNewPassword('123456', '123457')).toBe('mismatch');
    expect(validateNewPassword('123456', '123456')).toBeNull();
  });
});

describe('normalizeCode', () => {
  it('entfernt Leerzeichen und Bindestriche aus kopierten Codes', () => {
    expect(normalizeCode(' 123-456 ')).toBe('123456');
  });
});

describe('requestPasswordReset', () => {
  it('schickt die getrimmte Adresse an Supabase', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await expect(requestPasswordReset('  a@b.de ')).resolves.toEqual({ ok: true });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.de');
  });

  it('meldet Fehler (z. B. Rate-Limit) zurück', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'email rate limit exceeded' } });
    await expect(requestPasswordReset('a@b.de')).resolves.toEqual({ ok: false, message: 'email rate limit exceeded' });
  });
});

describe('completePasswordReset', () => {
  const input = { email: 'a@b.de', code: '123 456', password: 'neuesPW1', alreadyVerified: false };

  it('prüft den Code als recovery-OTP und setzt dann das Passwort', async () => {
    auth.verifyOtp.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });

    await expect(completePasswordReset(input)).resolves.toEqual({ ok: true });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.de', token: '123456', type: 'recovery' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'neuesPW1' });
  });

  it('setzt kein Passwort, wenn der Code ungültig ist', async () => {
    auth.verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });

    await expect(completePasswordReset(input)).resolves.toEqual({ ok: false, reason: 'invalidCode' });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('prüft einen bereits bestätigten Code nicht erneut', async () => {
    auth.updateUser.mockResolvedValue({ error: null });

    await completePasswordReset({ ...input, alreadyVerified: true });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('gibt Fehler beim Passwort-Update weiter', async () => {
    auth.verifyOtp.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: { message: 'New password should be different from the old password.' } });

    await expect(completePasswordReset(input)).resolves.toEqual({
      ok: false,
      reason: 'update',
      message: 'New password should be different from the old password.',
    });
  });
});
