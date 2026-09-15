/**
 * app.js — AvoraSport Admin-Panel.
 *
 * Kein Build-Schritt, keine Abhängigkeiten außer dem Supabase-JS-CDN-Bundle
 * (siehe index.html) — läuft als reine statische Website, z. B. auf Strato.
 *
 * Alle Daten kommen über supabase/functions/admin-api (siehe dort), niemals
 * direkt per REST aus der DB — die Function prüft bei jedem Aufruf, ob der
 * eingeloggte User in public.admins steht.
 */

const { supabaseUrl, supabaseAnonKey, adminApiUrl } = window.ADMIN_CONFIG;
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const userEmailEl = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function fmtDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('de-DE');
}

function fmtDateTime(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-DE');
}

/** Baut eine <table> aus Zeilen + Spaltenbeschreibung. `render(row)` liefert
 *  bewusst rohes HTML (z. B. Buttons); alles andere wird escaped. */
function table(rows, columns) {
  if (!rows || rows.length === 0) return '<p class="empty">Keine Daten.</p>';
  const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = rows
    .map((r) => {
      const cells = columns
        .map((c) => {
          if (c.render) return `<td>${c.render(r)}</td>`;
          const v = r[c.key];
          return `<td>${v == null || v === '' ? '–' : escapeHtml(String(v))}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function bar(value, max) {
  const pct = max > 0 ? Math.round((Number(value) / max) * 100) : 0;
  return `<div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>`;
}

/** Ruft eine Aktion der admin-api Edge Function auf. Wirft bei Fehler/403/401. */
async function callAdminApi(action, params = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Nicht angemeldet.');

  const res = await fetch(adminApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...params }),
  });

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Unerwartete Antwort (${res.status}).`);
  }
  if (!res.ok || body.error) throw new Error(body.error || `Fehler (${res.status})`);
  return body.data;
}

// ── Login / Logout ───────────────────────────────────────────────────────────

function showApp(session) {
  loginScreen.hidden = true;
  appScreen.hidden = false;
  userEmailEl.textContent = session?.user?.email ?? '';
  loadDashboard();
}

function showLogin() {
  appScreen.hidden = true;
  loginScreen.hidden = false;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = 'Anmelden…';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Login allein reicht nicht — die Edge Function prüft zusätzlich
    // public.admins. Ein Testaufruf zeigt sofort, ob dieser Account Zugriff hat.
    await callAdminApi('metrics');
    showApp(data.session);
  } catch (err) {
    loginError.textContent =
      err.message === 'Kein Admin-Zugriff.'
        ? 'Dieser Account hat keinen Admin-Zugriff.'
        : err.message || 'Login fehlgeschlagen.';
    loginError.hidden = false;
    await supabase.auth.signOut();
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Anmelden';
  }
});

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  showLogin();
});

// ── Tabs ──────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'feedback') loadFeedback();
    if (btn.dataset.tab === 'users') loadUsers();
  });
});

// ── Dashboard ─────────────────────────────────────────────────────────────

async function loadDashboard() {
  const el = document.getElementById('dashboard-content');
  el.innerHTML = 'Lade…';
  try {
    const m = await callAdminApi('metrics');
    const dau = [...m.daily_active_users].reverse();
    const maxDau = Math.max(1, ...dau.map((d) => Number(d.active_users)));

    el.innerHTML = `
      <div class="grid">
        <div class="card">
          <h2>Premium</h2>
          <p class="big">${m.premium_overview.premium_users} / ${m.premium_overview.total_users}</p>
          <p class="muted">${m.premium_overview.premium_conversion_pct}% Conversion</p>
        </div>
        <div class="card">
          <h2>Aktive User heute</h2>
          <p class="big">${dau[dau.length - 1]?.active_users ?? 0}</p>
        </div>
      </div>

      <div class="card">
        <h2>Aktive User pro Tag (30 Tage)</h2>
        ${dau
          .map(
            (d) => `
          <div class="bar-row">
            <span class="bar-label">${fmtDate(d.activity_date)}</span>
            ${bar(d.active_users, maxDau)}
            <span class="bar-value">${d.active_users}</span>
          </div>`,
          )
          .join('')}
      </div>

      <div class="card">
        <h2>Retention</h2>
        ${table(m.retention_buckets, [
          { key: 'recency_bucket', label: 'Zuletzt aktiv' },
          { key: 'users', label: 'User' },
        ])}
      </div>

      <div class="card">
        <h2>Feature-Nutzung</h2>
        ${table(m.feature_adoption, [
          { key: 'feature', label: 'Feature' },
          { key: 'users', label: 'User' },
          { label: '% aller User', render: (r) => `${r.pct_of_users ?? 0}%` },
        ])}
      </div>

      <div class="card">
        <h2>Plan-Erstellung pro Woche</h2>
        ${table(m.plan_creation_stats, [
          { label: 'Woche', render: (r) => fmtDate(r.week) },
          { key: 'plans_created', label: 'Gesamt' },
          { key: 'ai_generated', label: 'KI' },
          { key: 'manual', label: 'Manuell' },
          { key: 'circuit_plans', label: 'Zirkel' },
        ])}
      </div>

      <div class="card">
        <h2>KI-Kosten diesen Monat pro User <span class="muted">(Premium-Deckel: 10€/Monat)</span></h2>
        ${table(m.ai_cost_by_user_this_month, [
          { key: 'user_id', label: 'User-ID' },
          { label: 'Premium', render: (r) => (r.is_premium ? 'Ja' : 'Nein') },
          { key: 'requests', label: 'Anfragen' },
          { label: 'Kosten', render: (r) => `$${r.cost_usd_this_month}` },
          { label: '% vom Limit', render: (r) => (r.is_premium ? `${r.pct_of_premium_cap}%` : '–') },
        ])}
      </div>

      <div class="card">
        <h2>KI-Anfragen pro Tag</h2>
        ${table(m.ai_daily_stats, [
          { label: 'Tag', render: (r) => fmtDate(r.day) },
          { key: 'model', label: 'Modell' },
          { key: 'requests', label: 'Anfragen' },
          { label: 'Fehlerquote', render: (r) => `${r.error_rate_pct ?? 0}%` },
          { label: 'Kosten', render: (r) => `$${r.cost_usd}` },
        ])}
      </div>

      <div class="card">
        <h2>Letzte KI-Fehler</h2>
        ${table(m.ai_errors_recent, [
          { label: 'Zeit', render: (r) => fmtDateTime(r.created_at) },
          { key: 'model', label: 'Modell' },
          { key: 'error_message', label: 'Fehler' },
        ])}
      </div>

      <div class="card">
        <h2>Externe API-Calls (Nährwert-Lookups)</h2>
        ${table(m.external_api_calls, [
          { label: 'Tag', render: (r) => fmtDate(r.day) },
          { key: 'call_type', label: 'Typ' },
          { key: 'calls', label: 'Aufrufe' },
        ])}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

// ── Feedback ──────────────────────────────────────────────────────────────

async function loadFeedback() {
  const el = document.getElementById('feedback-content');
  el.innerHTML = 'Lade…';
  const onlyUnhandled = document.getElementById('feedback-filter').checked;

  try {
    const rows = await callAdminApi('list_feedback', { onlyUnhandled });
    if (!rows.length) {
      el.innerHTML = '<p class="empty">Kein Feedback.</p>';
      return;
    }
    el.innerHTML = rows
      .map(
        (f) => `
      <div class="feedback-item ${f.handled ? 'handled' : ''}">
        <div class="feedback-head">
          <strong>${escapeHtml(f.subject)}</strong>
          <span class="muted">${escapeHtml(f.email || '–')} · ${fmtDateTime(f.created_at)}</span>
        </div>
        <p>${escapeHtml(f.message)}</p>
        <div class="feedback-meta muted">${escapeHtml(f.platform || '?')} · v${escapeHtml(f.app_version || '?')}</div>
        <button data-id="${f.id}" data-handled="${!f.handled}" class="toggle-handled-btn">
          ${f.handled ? 'Als offen markieren' : 'Als erledigt markieren'}
        </button>
      </div>`,
      )
      .join('');

    el.querySelectorAll('.toggle-handled-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await callAdminApi('set_feedback_handled', {
            id: btn.dataset.id,
            handled: btn.dataset.handled === 'true',
          });
          loadFeedback();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('feedback-filter').addEventListener('change', loadFeedback);

// ── User ──────────────────────────────────────────────────────────────────

async function loadUsers() {
  const el = document.getElementById('users-content');
  el.innerHTML = 'Lade…';
  try {
    const rows = await callAdminApi('list_users');
    el.innerHTML = table(rows, [
      { key: 'email', label: 'E-Mail' },
      { label: 'Premium', render: (r) => (r.is_premium ? 'Ja' : 'Nein') },
      { label: 'Angemeldet seit', render: (r) => fmtDate(r.signed_up_at) },
      { label: 'Zuletzt aktiv', render: (r) => (r.last_activity_at ? fmtDate(r.last_activity_at) : 'nie') },
      { key: 'active_days', label: 'Aktive Tage' },
      {
        label: 'Aktion',
        render: (r) =>
          `<button class="premium-toggle-btn" data-id="${r.user_id}" data-make="${!r.is_premium}">` +
          `${r.is_premium ? 'Premium entziehen' : 'Premium geben'}</button>`,
      },
    ]);

    el.querySelectorAll('.premium-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const makePremium = btn.dataset.make === 'true';
        if (!confirm(makePremium ? 'Premium für diesen User aktivieren?' : 'Premium für diesen User entziehen?')) return;
        btn.disabled = true;
        try {
          await callAdminApi('set_premium', { userId: btn.dataset.id, isPremium: makePremium });
          loadUsers();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

// ── Beim Laden: bestehende Session prüfen ────────────────────────────────────

(async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showLogin();
    return;
  }
  try {
    await callAdminApi('metrics'); // gleichzeitig Admin-Check
    showApp(session);
  } catch {
    await supabase.auth.signOut();
    showLogin();
  }
})();
