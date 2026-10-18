/**
 * config.js — Verbindungsdaten für das AvoraSport-Admin-Panel.
 *
 * supabaseAnonKey ist der ÖFFENTLICHE anon-Key (identisch mit dem in der App,
 * EXPO_PUBLIC_SUPABASE_ANON_KEY) — der darf im Client stehen, das ist normal
 * und sicher. Er dient nur zum Einloggen; welche Daten ein eingeloggter User
 * sehen darf, entscheidet server-seitig supabase/functions/admin-api.
 *
 * NICHT hier eintragen: der service_role-Key. Der gehört ausschließlich in
 * die Supabase-Function-Secrets, niemals in eine Website.
 */
window.ADMIN_CONFIG = {
  supabaseUrl: 'https://assmvtdzjegddyqqaacx.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzc212dGR6amVnZGR5cXFhYWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Njk2MTYsImV4cCI6MjA5MTE0NTYxNn0.EL1jtbdVhye-ONBUuRQ7VI8Uxo85trQEAuYFqEfrgHY',
  adminApiUrl: 'https://assmvtdzjegddyqqaacx.supabase.co/functions/v1/admin-api',
};
