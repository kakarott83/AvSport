/**
 * Reine Hilfsfunktionen für supabase/functions/admin-api (Jest-testbar).
 */

/** Standard, wenn das Secret ADMIN_ALLOWED_ORIGINS nicht gesetzt ist. */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://milan-muc.de',
  'https://www.milan-muc.de',
  'https://admin.milan-muc.de',
];

/** Liest die kommagetrennte Origin-Liste (ohne abschließenden Slash). */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  const list = (raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ALLOWED_ORIGINS;
}

/**
 * Darf ein Request mit diesem Origin-Header durch? Requests ganz ohne Origin
 * (curl, Server-zu-Server) sind erlaubt — die eigentliche Absicherung ist das
 * Admin-JWT; der Origin-Check verhindert nur, dass fremde Websites das
 * Admin-Panel im Browser eines eingeloggten Admins missbrauchen.
 */
export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return true;
  return allowed.includes(origin.replace(/\/+$/, ''));
}

/** Liest den `aal`-Claim (aal1 = nur Passwort, aal2 = mit 2FA) aus einem bereits geprüften JWT. */
export function readAal(authHeader: string | null): string | null {
  const token = (authHeader ?? '').replace(/^Bearer\s+/i, '');
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded));
    return typeof claims.aal === 'string' ? claims.aal : null;
  } catch {
    return null;
  }
}

/**
 * Optionales Limit aus dem Admin-Formular: leer/null → null (= Tarif-Standard),
 * sonst eine Zahl ≥ 0. Ganzzahlig für Anfragen, mit Nachkommastellen für $.
 */
export function parseOptionalLimit(
  value: unknown,
  opts: { integer: boolean },
): { ok: true; value: number | null } | { ok: false } {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { ok: false };
  if (opts.integer && !Number.isInteger(n)) return { ok: false };
  return { ok: true, value: n };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
