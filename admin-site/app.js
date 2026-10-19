/**
 * app.js — AvoraSport Admin-Panel.
 *
 * Kein Build-Schritt; einzige Abhängigkeit ist das lokal mitgelieferte
 * Supabase-JS-Bundle (vendor/, siehe index.html) — läuft als reine statische
 * Website, z. B. auf Strato unter milan-muc.de.
 *
 * Alle Daten kommen über supabase/functions/admin-api (siehe dort), niemals
 * direkt per REST aus der DB — die Function prüft bei jedem Aufruf Origin,
 * Login, Zwei-Faktor-Anmeldung und ob der User in public.admins steht.
 */

const { supabaseUrl, supabaseAnonKey, adminApiUrl, idleLogoutMinutes = 30 } = window.ADMIN_CONFIG;

// Session nur im aktuellen Tab halten (sessionStorage): Tab/Browser zu = abgemeldet.
const sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true },
});

const $ = (id) => document.getElementById(id);

const screens = { login: $('login-screen'), mfa: $('mfa-screen'), app: $('app-screen') };
function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

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
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtUsd(value, digits = 2) {
  const n = Number(value ?? 0);
  return '$' + n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtNum(value) {
  return Number(value ?? 0).toLocaleString('de-DE');
}

function relTime(iso) {
  if (!iso) return 'nie';
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d < 60 ? `vor ${d} Tagen` : fmtDate(iso);
}

let toastTimer;
function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('toast-error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
}

/** Baut eine <table> aus Zeilen + Spaltenbeschreibung. `render(row)` liefert
 *  bewusst rohes HTML (z. B. Buttons); alles andere wird escaped. */
function table(rows, columns, opts = {}) {
  if (!rows || rows.length === 0) return '<p class="empty">Keine Daten.</p>';
  const head = columns.map((c) => `<th class="${c.num ? 'num' : ''}">${escapeHtml(c.label)}</th>`).join('');
  const body = rows
    .map((r, i) => {
      const cells = columns
        .map((c) => {
          const cls = c.num ? ' class="num"' : '';
          if (c.render) return `<td${cls}>${c.render(r)}</td>`;
          const v = r[c.key];
          return `<td${cls}>${v == null || v === '' ? '–' : escapeHtml(String(v))}</td>`;
        })
        .join('');
      const rowAttr = opts.rowAttr ? opts.rowAttr(r, i) : '';
      return `<tr ${rowAttr}>${cells}</tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function bar(value, max) {
  const pct = max > 0 ? Math.round((Number(value) / max) * 100) : 0;
  return `<div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>`;
}

/** Verbrauch gegen Limit: "7 / 10" + Fortschrittsbalken (warn ab 80 %, voll = Limit). */
function usageCell(used, limit, { money = false, unlimited = false } = {}) {
  const usedTxt = money ? fmtUsd(used) : fmtNum(used);
  if (unlimited) return `<span>${usedTxt}</span> <span class="muted">/ ∞</span>`;
  if (limit == null) return `<span>${usedTxt}</span> <span class="muted">/ –</span>`;
  const limitTxt = money ? fmtUsd(limit) : fmtNum(limit);
  const ratio = Number(limit) > 0 ? Number(used) / Number(limit) : 1;
  const level = ratio >= 1 ? 'full' : ratio >= 0.8 ? 'warn' : 'ok';
  const pct = Math.min(100, Math.round(ratio * 100));
  return `<div class="usage"><span>${usedTxt} <span class="muted">/ ${limitTxt}</span></span>
    <div class="meter meter-${level}" title="${pct}% des Limits"><div style="width:${pct}%"></div></div></div>`;
}

const REASON_LABELS = {
  blocked: 'KI gesperrt',
  daily_limit: 'Tageslimit erreicht',
  monthly_limit: 'Monatslimit erreicht',
  monthly_cost_cap: 'Kostenlimit erreicht',
};

const FEATURE_LABELS = {
  food_photo: 'Kalorien-Scanner (Foto)',
  food_text: 'Mahlzeit per Text',
  nutrition_fallback: 'Nährwert-Schätzung',
  training_plan: 'KI-Trainingsplan',
  exercise_detail: 'Übungs-Details',
  unknown: 'Unbekannt',
  unbekannt: 'Vor Tracking (alt)',
};

const AUDIT_LABELS = {
  set_limits: 'Limits geändert',
  block_ai: 'KI gesperrt',
  unblock_ai: 'KI entsperrt',
  reset_usage: 'Zähler zurückgesetzt',
  ban_account: 'Account gesperrt',
  unban_account: 'Account entsperrt',
  set_premium: 'Premium geändert',
  set_defaults: 'Standard-Limits geändert',
};

function isBanned(u) {
  return !!u.banned_until && new Date(u.banned_until).getTime() > Date.now();
}

function badges(u) {
  const q = u.quota ?? {};
  const out = [];
  if (u.is_premium) out.push('<span class="badge badge-accent">Premium</span>');
  if (q.unlimited) out.push('<span class="badge">Unbegrenzt</span>');
  if (isBanned(u)) out.push('<span class="badge badge-danger">Account gesperrt</span>');
  if (q.blocked) out.push('<span class="badge badge-danger">KI gesperrt</span>');
  else if (q.reason) out.push(`<span class="badge badge-warn">${escapeHtml(REASON_LABELS[q.reason] ?? q.reason)}</span>`);
  if (q.has_override && !q.unlimited && !q.blocked) out.push('<span class="badge badge-muted">Eigene Limits</span>');
  return out.join(' ');
}

/** Ruft eine Aktion der admin-api Edge Function auf. Wirft bei Fehler (err.code = Server-Code). */
async function callAdminApi(action, params = {}) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw Object.assign(new Error('Nicht angemeldet.'), { code: 'unauthenticated' });

  const res = await fetch(adminApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ action, ...params }),
  });

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Unerwartete Antwort (${res.status}).`);
  }
  if (!res.ok || body.error) {
    const err = new Error(body.error || `Fehler (${res.status})`);
    err.code = body.code;
    if (err.code === 'unauthenticated' || err.code === 'mfa_required') handleSessionLost(err);
    throw err;
  }
  return body.data;
}

// ── Login, Zwei-Faktor, Logout ───────────────────────────────────────────────

let mfaState = null; // { factorId, enrolling }

/** Nach Passwort-Login / beim Laden: Admin-Rechte + 2FA-Status klären. */
async function proceedAfterLogin() {
  try {
    const me = await callAdminApi('whoami');
    enterApp(me.email);
  } catch (err) {
    if (err.code === 'mfa_required') {
      await startMfa();
      return;
    }
    await sb.auth.signOut();
    showLoginError(err.code === 'not_admin' ? 'Dieser Account hat keinen Admin-Zugriff.' : err.message);
  }
}

async function startMfa() {
  $('mfa-error').hidden = true;
  $('mfa-code').value = '';
  const { data: factors, error } = await sb.auth.mfa.listFactors();
  if (error) return showLoginError(error.message);

  const verified = (factors.totp ?? []).find((f) => f.status === 'verified');
  if (verified) {
    mfaState = { factorId: verified.id, enrolling: false };
    $('mfa-enroll').hidden = true;
    $('mfa-verify-hint').hidden = false;
  } else {
    // Halbfertige Einrichtungen aufräumen, sonst lehnt Supabase eine neue ab.
    for (const f of factors.all ?? []) {
      if (f.factor_type === 'totp' && f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: enrollErr } = await sb.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'AvoraSport Admin',
    });
    if (enrollErr) return showLoginError('2FA-Einrichtung fehlgeschlagen: ' + enrollErr.message);
    mfaState = { factorId: data.id, enrolling: true };
    $('mfa-qr').src = data.totp.qr_code;
    $('mfa-secret').textContent = data.totp.secret;
    $('mfa-enroll').hidden = false;
    $('mfa-verify-hint').hidden = true;
  }
  showScreen('mfa');
  $('mfa-code').focus();
}

$('mfa-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!mfaState) return;
  const btn = $('mfa-btn');
  btn.disabled = true;
  $('mfa-error').hidden = true;
  try {
    const { error } = await sb.auth.mfa.challengeAndVerify({
      factorId: mfaState.factorId,
      code: $('mfa-code').value.trim(),
    });
    if (error) throw error;
    mfaState = null;
    await proceedAfterLogin();
  } catch (err) {
    $('mfa-error').textContent = err.message?.includes('Invalid') ? 'Code ungültig, bitte erneut versuchen.' : err.message;
    $('mfa-error').hidden = false;
  } finally {
    btn.disabled = false;
  }
});

$('mfa-cancel').addEventListener('click', logout);

function showLoginError(message) {
  showScreen('login');
  $('login-error').textContent = message || 'Login fehlgeschlagen.';
  $('login-error').hidden = false;
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('login-btn');
  $('login-error').hidden = true;
  btn.disabled = true;
  btn.textContent = 'Anmelden…';
  try {
    const { error } = await sb.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value,
    });
    if (error) throw error;
    $('password').value = '';
    await proceedAfterLogin();
  } catch (err) {
    showLoginError(err.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch.' : err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Anmelden';
  }
});

async function logout() {
  await sb.auth.signOut();
  $('user-dialog').open && $('user-dialog').close();
  showScreen('login');
}
$('logout-btn').addEventListener('click', logout);

function handleSessionLost(err) {
  if (!screens.app.hidden) {
    logout().then(() => showLoginError(err.code === 'mfa_required' ? 'Bitte erneut mit Zwei-Faktor anmelden.' : 'Sitzung abgelaufen.'));
  }
}

// Automatisch abmelden nach Inaktivität.
let idleTimer;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (screens.app.hidden) return;
    await logout();
    showLoginError(`Nach ${idleLogoutMinutes} Minuten Inaktivität abgemeldet.`);
  }, idleLogoutMinutes * 60 * 1000);
}
['click', 'keydown', 'mousemove', 'touchstart'].forEach((ev) =>
  document.addEventListener(ev, resetIdle, { passive: true }),
);

function enterApp(email) {
  $('user-email').textContent = email ?? '';
  showScreen('app');
  resetIdle();
  activateTab('dashboard');
}

// ── Tabs ──────────────────────────────────────────────────────────────────

const loaders = {
  usage: loadUsage,
  dashboard: loadDashboard,
  defaults: loadDefaults,
  feedback: loadFeedback,
  audit: loadAudit,
};

function activateTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  loaders[name]?.();
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

// ── Nutzer & Limits ─────────────────────────────────────────────────────────

let usageRows = [];
let limitDefaults = { free: {}, premium: {} };

async function loadUsage() {
  const el = $('usage-content');
  el.innerHTML = 'Lade…';
  el.className = 'loading';
  try {
    const [rows, defaults] = await Promise.all([callAdminApi('list_usage'), callAdminApi('get_defaults')]);
    usageRows = rows ?? [];
    limitDefaults = Object.fromEntries((defaults ?? []).map((d) => [d.tier, d]));
    el.className = '';
    renderUsageKpis();
    renderUsageTable();
  } catch (err) {
    el.className = '';
    el.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

function renderUsageKpis() {
  const sum = (fn) => usageRows.reduce((s, u) => s + Number(fn(u) ?? 0), 0);
  const today = sum((u) => u.quota?.used_today);
  const activeToday = usageRows.filter((u) => Number(u.quota?.used_today) > 0).length;
  const cost = sum((u) => u.quota?.cost_month_usd);
  const atLimit = usageRows.filter((u) => u.quota?.reason && u.quota.reason !== 'blocked').length;
  const blocked = usageRows.filter((u) => u.quota?.blocked || isBanned(u)).length;
  const premium = usageRows.filter((u) => u.is_premium).length;

  $('usage-kpis').innerHTML = `
    <div class="card kpi"><h2>Nutzer</h2><p class="big">${fmtNum(usageRows.length)}</p>
      <p class="muted">${fmtNum(premium)} Premium</p></div>
    <div class="card kpi"><h2>KI-Anfragen heute</h2><p class="big">${fmtNum(today)}</p>
      <p class="muted">von ${fmtNum(activeToday)} Nutzern</p></div>
    <div class="card kpi"><h2>KI-Kosten diesen Monat</h2><p class="big">${fmtUsd(cost)}</p>
      <p class="muted">geschätzt aus Tokens</p></div>
    <div class="card kpi"><h2>Am Limit / gesperrt</h2><p class="big">${fmtNum(atLimit)} / ${fmtNum(blocked)}</p>
      <p class="muted">aktuell blockierte Nutzer</p></div>`;
}

function renderUsageTable() {
  const term = $('usage-search').value.trim().toLowerCase();
  const filter = $('usage-filter').value;
  const sort = $('usage-sort').value;

  const filters = {
    all: () => true,
    free: (u) => !u.is_premium,
    premium: (u) => u.is_premium,
    at_limit: (u) => !!u.quota?.reason && u.quota.reason !== 'blocked',
    blocked: (u) => u.quota?.blocked || isBanned(u),
    override: (u) => u.quota?.has_override,
    active_today: (u) => Number(u.quota?.used_today) > 0,
  };
  const sorters = {
    used_today: (u) => Number(u.quota?.used_today ?? 0),
    used_month: (u) => Number(u.quota?.used_month ?? 0),
    cost_month: (u) => Number(u.quota?.cost_month_usd ?? 0),
    last_request: (u) => (u.last_request_at ? new Date(u.last_request_at).getTime() : 0),
    signed_up: (u) => new Date(u.signed_up_at).getTime(),
  };

  const rows = usageRows
    .filter(filters[filter])
    .filter((u) => !term || (u.email ?? '').toLowerCase().includes(term) || u.user_id.includes(term))
    .sort((a, b) => sorters[sort](b) - sorters[sort](a));

  $('usage-content').innerHTML =
    `<p class="muted count">${fmtNum(rows.length)} Nutzer · Klick auf eine Zeile öffnet Details und Steuerung</p>` +
    table(
      rows,
      [
        {
          label: 'Nutzer',
          render: (u) =>
            `<div class="user-cell"><span class="email">${escapeHtml(u.email ?? u.user_id)}</span>${badges(u)}</div>`,
        },
        { label: 'Heute', render: (u) => usageCell(u.quota?.used_today, u.quota?.daily_limit, { unlimited: u.quota?.unlimited }) },
        { label: 'Monat', render: (u) => usageCell(u.quota?.used_month, u.quota?.monthly_limit, { unlimited: u.quota?.unlimited }) },
        {
          label: 'Kosten Monat',
          render: (u) =>
            usageCell(u.quota?.cost_month_usd, u.quota?.monthly_cost_cap_usd, { money: true, unlimited: u.quota?.unlimited }),
        },
        { label: '7 Tage', num: true, render: (u) => fmtNum(u.requests_7d) + (u.errors_7d > 0 ? ` <span class="muted">(${u.errors_7d} Fehler)</span>` : '') },
        { label: 'Zuletzt KI', render: (u) => `<span title="${fmtDateTime(u.last_request_at)}">${relTime(u.last_request_at)}</span>` },
        { label: 'Registriert', render: (u) => fmtDate(u.signed_up_at) },
      ],
      { rowAttr: (u) => `class="clickable" data-user="${escapeHtml(u.user_id)}" tabindex="0"` },
    );

  $('usage-content').querySelectorAll('tr[data-user]').forEach((tr) => {
    const open = () => openUserDetail(tr.dataset.user);
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => e.key === 'Enter' && open());
  });
}

$('usage-search').addEventListener('input', renderUsageTable);
$('usage-filter').addEventListener('change', renderUsageTable);
$('usage-sort').addEventListener('change', renderUsageTable);
$('usage-refresh').addEventListener('click', loadUsage);

// ── User-Detail & Steuerung ─────────────────────────────────────────────────

const dialog = $('user-dialog');
$('detail-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  if (dialog.dataset.dirty === '1') {
    dialog.dataset.dirty = '';
    loadUsage();
  }
});

function inputValue(v) {
  return v == null ? '' : String(v);
}

function dailyChart(daily) {
  // Lückenlose 30 Tage, damit Tage ohne Nutzung als Lücke sichtbar sind.
  const byDay = Object.fromEntries((daily ?? []).map((d) => [d.day, d]));
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    days.push({ key, label: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }), ...(byDay[key] ?? {}) });
  }
  const max = Math.max(1, ...days.map((d) => Number(d.requests ?? 0)));
  return `<div class="col-chart" role="img" aria-label="KI-Anfragen pro Tag, letzte 30 Tage">
    ${days
      .map((d) => {
        const n = Number(d.requests ?? 0);
        const h = n > 0 ? Math.max(4, Math.round((n / max) * 100)) : 0;
        const tip = `${d.label}: ${n} Anfragen${d.errors ? `, ${d.errors} Fehler` : ''}${d.cost_usd ? `, ${fmtUsd(d.cost_usd, 4)}` : ''}`;
        return `<div class="col" title="${escapeHtml(tip)}"><div class="col-fill" style="height:${h}%"></div></div>`;
      })
      .join('')}
  </div>
  <div class="col-axis"><span>${days[0].label}</span><span>max. ${max}/Tag</span><span>heute</span></div>`;
}

async function openUserDetail(userId) {
  const content = $('detail-content');
  content.innerHTML = 'Lade…';
  content.className = 'loading';
  if (!dialog.open) dialog.showModal();

  let d;
  try {
    d = await callAdminApi('user_detail', { userId });
  } catch (err) {
    content.className = '';
    content.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    return;
  }
  content.className = '';

  const u = d.user ?? {};
  const q = d.quota ?? {};
  const o = d.overrides ?? {};
  const def = limitDefaults[q.tier] ?? {};
  const banned = isBanned(u);
  const placeholder = (v, money) => (v == null ? 'Standard: kein Limit' : `Standard: ${money ? fmtUsd(v) : v}`);

  $('detail-title').textContent = u.email ?? userId;
  $('detail-sub').textContent =
    `${u.is_premium ? 'Premium' + (u.premium_product ? ` (${u.premium_product})` : '') : 'Free'} · ` +
    `registriert ${fmtDate(u.signed_up_at)} · letzter Login ${fmtDateTime(u.last_sign_in_at)} · ID ${userId}`;

  content.innerHTML = `
    <div class="detail-badges">${badges({ ...u, quota: q })}</div>

    <div class="grid grid-3">
      <div class="card kpi"><h2>Heute</h2>${usageCell(q.used_today, q.daily_limit, { unlimited: q.unlimited })}
        <p class="muted">Reset ${fmtDateTime(q.daily_resets_at)}</p></div>
      <div class="card kpi"><h2>Dieser Monat</h2>${usageCell(q.used_month, q.monthly_limit, { unlimited: q.unlimited })}
        <p class="muted">Reset ${fmtDate(q.monthly_resets_at)}</p></div>
      <div class="card kpi"><h2>Kosten Monat</h2>${usageCell(q.cost_month_usd, q.monthly_cost_cap_usd, { money: true, unlimited: q.unlimited })}
        <p class="muted">${q.usage_reset_at ? 'Zähler zurückgesetzt ' + fmtDateTime(q.usage_reset_at) : 'geschätzt aus Tokens'}</p></div>
    </div>

    <div class="card">
      <h2>KI-Anfragen pro Tag (30 Tage)</h2>
      ${dailyChart(d.daily)}
    </div>

    <div class="card">
      <h2>Limits für diesen Nutzer</h2>
      <p class="muted">Leere Felder = Standard für ${q.tier === 'premium' ? 'Premium' : 'Free'} (änderbar unter „Standard-Limits“).</p>
      <form id="limits-form" class="form-grid">
        <label>Anfragen pro Tag
          <input name="daily" type="number" min="0" step="1" value="${inputValue(o.daily_request_limit)}" placeholder="${placeholder(def.daily_request_limit)}" /></label>
        <label>Anfragen pro Monat
          <input name="monthly" type="number" min="0" step="1" value="${inputValue(o.monthly_request_limit)}" placeholder="${placeholder(def.monthly_request_limit)}" /></label>
        <label>Kostenlimit pro Monat ($)
          <input name="cost" type="number" min="0" step="0.01" value="${inputValue(o.monthly_cost_cap_usd)}" placeholder="${placeholder(def.monthly_cost_cap_usd, true)}" /></label>
        <label class="checkbox"><input name="unlimited" type="checkbox" ${o.unlimited ? 'checked' : ''} /> Unbegrenzt (alle Limits ignorieren)</label>
        <label class="wide">Interne Notiz
          <input name="note" type="text" maxlength="500" value="${escapeHtml(o.note ?? '')}" placeholder="z. B. Tester, Influencer, Support-Fall…" /></label>
        <div class="form-actions wide">
          <button type="submit" class="btn-primary">Limits speichern</button>
          <button type="button" id="limits-clear" class="btn-secondary">Auf Standard zurücksetzen</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>Steuerung</h2>
      <div class="actions">
        <div class="action">
          <div><strong>Zähler zurücksetzen</strong><p class="muted">Tages-, Monats- und Kostenzähler starten ab jetzt neu. Der Verlauf bleibt erhalten.</p></div>
          <button id="act-reset" class="btn-secondary">Zurücksetzen</button>
        </div>
        <div class="action">
          <div><strong>KI-Funktionen ${q.blocked ? 'gesperrt' : 'sperren'}</strong>
            <p class="muted">${q.blocked ? 'Grund: ' + escapeHtml(q.blocked_reason ?? '–') : 'Nutzer kann die App weiter nutzen, aber keine KI-Anfragen mehr stellen.'}</p>
            ${q.blocked ? '' : '<input id="block-reason" type="text" maxlength="500" placeholder="Grund (optional, nur intern)" />'}</div>
          <button id="act-block" class="${q.blocked ? 'btn-secondary' : 'btn-danger'}">${q.blocked ? 'KI entsperren' : 'KI sperren'}</button>
        </div>
        <div class="action">
          <div><strong>Account ${banned ? 'gesperrt' : 'sperren'}</strong>
            <p class="muted">${banned ? 'Login ist blockiert.' : 'Blockiert Login und Token-Erneuerung komplett. Laufende Sitzungen enden spätestens nach einer Stunde.'}</p></div>
          <button id="act-ban" class="${banned ? 'btn-secondary' : 'btn-danger'}">${banned ? 'Account entsperren' : 'Account sperren'}</button>
        </div>
        <div class="action">
          <div><strong>Premium ${u.is_premium ? 'aktiv' : 'inaktiv'}</strong>
            <p class="muted">Manuelle Vergabe. Ein späteres Store-Event von RevenueCat kann das überschreiben.</p></div>
          <button id="act-premium" class="btn-secondary">${u.is_premium ? 'Premium entziehen' : 'Premium geben'}</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Nutzung nach Funktion (dieser Monat)</h2>
      ${table(d.by_feature, [
        { label: 'Funktion', render: (r) => escapeHtml(FEATURE_LABELS[r.feature] ?? r.feature) },
        { key: 'requests', label: 'Anfragen', num: true },
        { label: 'Kosten', num: true, render: (r) => fmtUsd(r.cost_usd, 4) },
      ])}
    </div>

    <div class="card">
      <h2>Letzte Anfragen</h2>
      ${table(d.recent, [
        { label: 'Zeit', render: (r) => fmtDateTime(r.created_at) },
        { label: 'Funktion', render: (r) => escapeHtml(FEATURE_LABELS[r.feature ?? 'unbekannt'] ?? r.feature) },
        { label: 'Status', render: (r) => (r.status === 'error' ? '<span class="badge badge-danger">Fehler</span>' : 'OK') },
        { key: 'total_tokens', label: 'Tokens', num: true },
        { label: 'Kosten', num: true, render: (r) => fmtUsd(r.cost_usd, 4) },
        { label: 'Fehler', render: (r) => `<span class="clip">${escapeHtml(r.error_message ?? '')}</span>` },
      ])}
    </div>`;

  const run = async (btn, action, params, okMsg) => {
    btn.disabled = true;
    try {
      await callAdminApi(action, { userId, ...params });
      dialog.dataset.dirty = '1';
      toast(okMsg);
      await openUserDetail(userId);
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
    }
  };

  const form = $('limits-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    run(form.querySelector('button[type=submit]'), 'set_limits', {
      dailyRequestLimit: f.get('daily'),
      monthlyRequestLimit: f.get('monthly'),
      monthlyCostCapUsd: f.get('cost'),
      unlimited: f.get('unlimited') === 'on',
      note: f.get('note'),
    }, 'Limits gespeichert.');
  });
  $('limits-clear').addEventListener('click', (e) => {
    if (!confirm('Alle eigenen Limits dieses Nutzers entfernen und Standard verwenden?')) return;
    run(e.currentTarget, 'set_limits', { dailyRequestLimit: null, monthlyRequestLimit: null, monthlyCostCapUsd: null, unlimited: false, note: form.note.value }, 'Standard-Limits aktiv.');
  });
  $('act-reset').addEventListener('click', (e) => {
    if (!confirm('Zähler für diesen Nutzer zurücksetzen?')) return;
    run(e.currentTarget, 'reset_usage', {}, 'Zähler zurückgesetzt.');
  });
  $('act-block').addEventListener('click', (e) => {
    if (!q.blocked && !confirm('KI-Funktionen für diesen Nutzer sperren?')) return;
    run(e.currentTarget, 'set_ai_blocked', { blocked: !q.blocked, reason: $('block-reason')?.value ?? null }, q.blocked ? 'KI entsperrt.' : 'KI gesperrt.');
  });
  $('act-ban').addEventListener('click', (e) => {
    if (!confirm(banned ? 'Account entsperren?' : 'Account komplett sperren? Der Nutzer kann sich dann nicht mehr anmelden.')) return;
    run(e.currentTarget, 'set_account_banned', { banned: !banned }, banned ? 'Account entsperrt.' : 'Account gesperrt.');
  });
  $('act-premium').addEventListener('click', (e) => {
    if (!confirm(u.is_premium ? 'Premium für diesen Nutzer entziehen?' : 'Premium für diesen Nutzer aktivieren?')) return;
    run(e.currentTarget, 'set_premium', { isPremium: !u.is_premium }, 'Premium-Status geändert.');
  });
}

// ── Standard-Limits ─────────────────────────────────────────────────────────

async function loadDefaults() {
  const el = $('defaults-content');
  el.innerHTML = 'Lade…';
  try {
    const rows = await callAdminApi('get_defaults');
    limitDefaults = Object.fromEntries((rows ?? []).map((d) => [d.tier, d]));
    el.innerHTML =
      `<p class="muted intro">Gelten für alle Nutzer ohne eigene Limits. Leeres Feld = kein Limit dieser Art.
       Gezählt werden erfolgreiche KI-Anfragen; Tage und Monate nach deutscher Zeit.</p>` +
      ['free', 'premium']
        .map((tier) => {
          const d = limitDefaults[tier] ?? {};
          return `<div class="card">
            <h2>${tier === 'premium' ? 'Premium' : 'Free'}</h2>
            <form class="form-grid defaults-form" data-tier="${tier}">
              <label>Anfragen pro Tag<input name="daily" type="number" min="0" step="1" value="${inputValue(d.daily_request_limit)}" placeholder="kein Limit" /></label>
              <label>Anfragen pro Monat<input name="monthly" type="number" min="0" step="1" value="${inputValue(d.monthly_request_limit)}" placeholder="kein Limit" /></label>
              <label>Kostenlimit pro Monat ($)<input name="cost" type="number" min="0" step="0.01" value="${inputValue(d.monthly_cost_cap_usd)}" placeholder="kein Limit" /></label>
              <div class="form-actions wide"><button type="submit" class="btn-primary">Speichern</button>
                <span class="muted">Zuletzt geändert ${fmtDateTime(d.updated_at)}</span></div>
            </form>
          </div>`;
        })
        .join('');

    el.querySelectorAll('.defaults-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        const f = new FormData(form);
        btn.disabled = true;
        try {
          await callAdminApi('set_defaults', {
            tier: form.dataset.tier,
            dailyRequestLimit: f.get('daily'),
            monthlyRequestLimit: f.get('monthly'),
            monthlyCostCapUsd: f.get('cost'),
          });
          toast('Standard-Limits gespeichert.');
          loadDefaults();
        } catch (err) {
          toast(err.message, true);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

// ── Protokoll ─────────────────────────────────────────────────────────────

function auditDetails(r) {
  const d = r.details ?? {};
  const parts = [];
  if ('tier' in d) parts.push(d.tier === 'premium' ? 'Premium' : 'Free');
  if ('dailyRequestLimit' in d) parts.push(`Tag: ${d.dailyRequestLimit ?? 'Standard'}`);
  if ('monthlyRequestLimit' in d) parts.push(`Monat: ${d.monthlyRequestLimit ?? 'Standard'}`);
  if ('monthlyCostCapUsd' in d) parts.push(`Kosten: ${d.monthlyCostCapUsd != null ? fmtUsd(d.monthlyCostCapUsd) : 'Standard'}`);
  if (d.unlimited) parts.push('unbegrenzt');
  if (d.reason) parts.push(`Grund: ${d.reason}`);
  if ('isPremium' in d) parts.push(d.isPremium ? 'Premium an' : 'Premium aus');
  if (d.note) parts.push(`Notiz: ${d.note}`);
  return escapeHtml(parts.join(' · '));
}

async function loadAudit() {
  const el = $('audit-content');
  el.innerHTML = 'Lade…';
  try {
    const rows = await callAdminApi('list_audit');
    el.innerHTML = `<div class="card">${table(rows, [
      { label: 'Zeit', render: (r) => fmtDateTime(r.created_at) },
      { key: 'admin_email', label: 'Admin' },
      { label: 'Aktion', render: (r) => escapeHtml(AUDIT_LABELS[r.action] ?? r.action) },
      { label: 'Nutzer', render: (r) => escapeHtml(r.target_email ?? (r.target_user_id ? r.target_user_id : '–')) },
      { label: 'Details', render: auditDetails },
    ])}</div>`;
  } catch (err) {
    el.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────

/** Anteil in Prozent mit einer Nachkommastelle, deutsch formatiert. */
function pct(part, whole) {
  const p = Number(whole) > 0 ? Math.round((Number(part) / Number(whole)) * 1000) / 10 : 0;
  return p.toLocaleString('de-DE') + ' %';
}

function kpiTile(title, big, sub, extraClass = '') {
  return `<div class="card kpi ${extraClass}"><h2>${title}</h2><p class="big">${big}</p><p class="muted">${sub}</p></div>`;
}

/** Vier KPI-Bereiche aus admin_get_kpi_groups() (via admin-api "metrics"). */
function renderKpiGroups(g) {
  if (!g) return '';
  const n = (v) => Number(v ?? 0);
  const gr = g.growth ?? {};
  const f = g.features ?? {};
  const mo = g.money ?? {};
  const q = g.quality ?? {};
  const users = n(f.users_total);
  const usersOf = (v) => `${fmtNum(n(v))} Nutzer`;

  // Monatsumsatz nur mit hinterlegten Preisen (config.js → prices)
  const prices = window.ADMIN_CONFIG.prices ?? {};
  const hasPrices = prices.monthlyEur != null && prices.yearlyEur != null;
  const mrr = hasPrices ? n(mo.premium_monthly) * prices.monthlyEur + (n(mo.premium_yearly) * prices.yearlyEur) / 12 : 0;
  const lookupTotal = n(q.lookup_usda_30d) + n(q.lookup_llm_30d) + n(q.lookup_cache_30d);
  const aiTotal = n(q.ai_success_7d) + n(q.ai_errors_7d);

  return `
    <h3 class="section-title">Wachstum &amp; Bindung</h3>
    <div class="grid kpi-grid">
      ${kpiTile('Onboarding abgeschlossen', pct(gr.onboarded, gr.users_total), `${fmtNum(n(gr.onboarded))} von ${fmtNum(n(gr.users_total))} Nutzern`)}
      ${kpiTile('Aktiv (30 Tage)', fmtNum(n(gr.mau)), `Ø ${n(gr.avg_dau_30d).toLocaleString('de-DE')} pro Tag`)}
      ${kpiTile('Stickiness', `${n(gr.stickiness_pct).toLocaleString('de-DE')} %`, 'Ø tägliche ÷ monatlich aktive Nutzer')}
      ${kpiTile('7-Tage-Retention', pct(gr.retention_active, gr.retention_cohort),
        `${fmtNum(n(gr.retention_active))} von ${fmtNum(n(gr.retention_cohort))} Nutzern (8–60 Tage dabei) in den letzten 7 Tagen aktiv`)}
      ${kpiTile('Inaktiv > 30 Tage', fmtNum(n(gr.inactive_30d)), `${pct(gr.inactive_30d, gr.users_total)} aller Nutzer`,
        n(gr.inactive_30d) > n(gr.users_total) / 2 ? 'kpi-warn' : '')}
    </div>

    <h3 class="section-title">Nutzung der Funktionen <span class="muted">(letzte 30 Tage)</span></h3>
    <div class="grid kpi-grid">
      ${kpiTile('Ernährung', pct(f.nutrition_30d, users), usersOf(f.nutrition_30d))}
      ${kpiTile('Training', pct(f.training_30d, users), usersOf(f.training_30d))}
      ${kpiTile('Wasser', pct(f.water_30d, users), usersOf(f.water_30d))}
      ${kpiTile('Zyklus-Einträge', pct(f.cycle_30d, users), usersOf(f.cycle_30d))}
      ${kpiTile('Trainingspläne', fmtNum(n(f.plans_30d)), `davon ${fmtNum(n(f.ai_plans_30d))} per KI erstellt`)}
      ${kpiTile('Mahlzeit per KI', fmtNum(n(f.food_photo_30d) + n(f.food_text_30d)),
        `${fmtNum(n(f.food_photo_30d))} Foto · ${fmtNum(n(f.food_text_30d))} Text`)}
      ${kpiTile('Health-Sync aktiv', usersOf(f.health_sync_on),
        `eingeschaltet: Zyklus ${fmtNum(n(f.cycle_tracking_on))} · Mahlzeit-Erinnerung ${fmtNum(n(f.meal_reminder_on))} · Trink-Erinnerung ${fmtNum(n(f.water_reminder_on))}`)}
    </div>

    <h3 class="section-title">Monetarisierung &amp; Kosten</h3>
    <div class="grid kpi-grid">
      ${kpiTile('Premium-Abos', fmtNum(n(mo.premium_total)), `${fmtNum(n(mo.premium_monthly))} monatlich · ${fmtNum(n(mo.premium_yearly))} jährlich`)}
      ${kpiTile('Umsatz / Monat (MRR)', hasPrices ? mrr.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }) : '–',
        hasPrices ? 'geschätzt aus Abo-Preisen (brutto)' : 'Abo-Preise in config.js eintragen (prices)')}
      ${kpiTile('Kosten / Monat', fmtUsd(n(mo.cost_month_usd)), `KI + ${fmtNum(n(mo.pictograms_month))} Piktogramme`, 'kpi-accent')}
      ${kpiTile('Kosten pro aktivem Nutzer', fmtUsd(n(mo.cost_per_mau_usd), 3), 'diesen Monat, bezogen auf 30-Tage-Aktive')}
    </div>
    <div class="card">
      <h2>KI-Kosten nach Funktion (dieser Monat)</h2>
      ${table(mo.cost_by_feature_month ?? [], [
        { label: 'Funktion', render: (r) => escapeHtml(FEATURE_LABELS[r.feature] ?? r.feature) },
        { key: 'requests', label: 'Anfragen', num: true },
        { label: 'Kosten', num: true, render: (r) => fmtUsd(r.cost_usd, 4) },
      ])}
      <p class="muted">Piktogramme laufen nicht über das KI-Protokoll und sind oben in „Kosten / Monat“ enthalten (ca. $0,039 pro Bild).</p>
    </div>

    <h3 class="section-title">Qualität &amp; Betrieb</h3>
    <div class="grid kpi-grid">
      ${kpiTile('KI-Fehlerquote (7 Tage)', pct(q.ai_errors_7d, aiTotal), `${fmtNum(n(q.ai_errors_7d))} Fehler bei ${fmtNum(aiTotal)} Anfragen`,
        n(q.ai_errors_7d) > 0 ? 'kpi-warn' : '')}
      ${kpiTile('Nährwerte aus Datenbank', pct(q.lookup_usda_30d, lookupTotal),
        `USDA ${fmtNum(n(q.lookup_usda_30d))} · KI-Schätzung ${fmtNum(n(q.lookup_llm_30d))} · Cache ${fmtNum(n(q.lookup_cache_30d))} (30 Tage)`)}
      ${kpiTile('Feedback', `${fmtNum(n(q.feedback_open))} offen`,
        `${fmtNum(n(q.feedback_done))} erledigt · ${fmtNum(n(q.feedback_30d))} in 30 Tagen`, n(q.feedback_open) > 0 ? 'kpi-warn' : '')}
    </div>

    <h3 class="section-title">Details</h3>
  `;
}

async function loadDashboard() {
  const el = $('dashboard-content');
  el.innerHTML = 'Lade…';
  try {
    const m = await callAdminApi('metrics');
    const dau = [...m.daily_active_users].reverse();
    const maxDau = Math.max(1, ...dau.map((d) => Number(d.active_users)));
    const k = m.kpis ?? {};
    const n = (v) => Number(v ?? 0);
    const pictoCostMonth = n(k.pictograms_month) * n(k.pictogram_cost_per_image_usd);
    const pictoCostTotal = n(k.pictograms_total) * n(k.pictogram_cost_per_image_usd);
    const costMonth = n(k.ai_cost_month_usd) + pictoCostMonth;
    const conversion = n(k.users_total) > 0 ? Math.round((n(k.premium_users) / n(k.users_total)) * 1000) / 10 : 0;
    $('dashboard-updated').textContent = 'Stand: ' + fmtDateTime(new Date().toISOString());

    el.innerHTML = `
      <div class="grid kpi-grid">
        <div class="card kpi"><h2>Nutzer</h2><p class="big">${fmtNum(n(k.users_total))}</p>
          <p class="muted">+${fmtNum(n(k.users_new_7d))} in 7 Tagen · +${fmtNum(n(k.users_new_30d))} in 30 Tagen</p></div>
        <div class="card kpi"><h2>Aktive Nutzer</h2><p class="big">${fmtNum(n(k.active_7d))}</p>
          <p class="muted">in 7 Tagen · heute ${fmtNum(n(k.active_today))}</p></div>
        <div class="card kpi"><h2>Premium</h2><p class="big">${fmtNum(n(k.premium_users))}</p>
          <p class="muted">${String(conversion).replace('.', ',')} % Conversion</p></div>
        <div class="card kpi kpi-accent"><h2>Kosten diesen Monat</h2><p class="big">${fmtUsd(costMonth)}</p>
          <p class="muted">KI ${fmtUsd(n(k.ai_cost_month_usd))} · Piktogramme ${fmtUsd(pictoCostMonth)}</p></div>
        <div class="card kpi"><h2>Kosten heute / gesamt</h2><p class="big">${fmtUsd(n(k.ai_cost_today_usd))}</p>
          <p class="muted">gesamt ${fmtUsd(n(k.ai_cost_total_usd) + pictoCostTotal)}</p></div>
        <div class="card kpi"><h2>KI-Anfragen</h2><p class="big">${fmtNum(n(k.ai_requests_month))}</p>
          <p class="muted">diesen Monat · heute ${fmtNum(n(k.ai_requests_today))}</p></div>
        <div class="card kpi ${n(k.ai_errors_7d) > 0 ? 'kpi-warn' : ''}"><h2>KI-Fehler (7 Tage)</h2><p class="big">${fmtNum(n(k.ai_errors_7d))}</p>
          <p class="muted">Details unten</p></div>
        <div class="card kpi"><h2>Aktivität (7 Tage)</h2><p class="big">${fmtNum(n(k.meals_logged_7d))}</p>
          <p class="muted">Mahlzeiten · ${fmtNum(n(k.workouts_logged_7d))} Trainings</p></div>
        <div class="card kpi"><h2>Piktogramme</h2><p class="big">${fmtNum(n(k.pictograms_total))}</p>
          <p class="muted">erzeugt · ${fmtNum(n(k.pictograms_month))} diesen Monat</p></div>
        <div class="card kpi clickable ${n(k.feedback_open) > 0 ? 'kpi-warn' : ''}" id="kpi-feedback" tabindex="0">
          <h2>Offenes Feedback</h2><p class="big">${fmtNum(n(k.feedback_open))}</p>
          <p class="muted">Klicken zum Öffnen</p></div>
      </div>

      ${renderKpiGroups(m.kpi_groups)}

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
          { key: 'users', label: 'User', num: true },
        ])}
      </div>

      <div class="card">
        <h2>Feature-Nutzung</h2>
        ${table(m.feature_adoption, [
          { key: 'feature', label: 'Feature' },
          { key: 'users', label: 'User', num: true },
          { label: '% aller User', num: true, render: (r) => `${r.pct_of_users ?? 0}%` },
        ])}
      </div>

      <div class="card">
        <h2>Plan-Erstellung pro Woche</h2>
        ${table(m.plan_creation_stats, [
          { label: 'Woche', render: (r) => fmtDate(r.week) },
          { key: 'plans_created', label: 'Gesamt', num: true },
          { key: 'ai_generated', label: 'KI', num: true },
          { key: 'manual', label: 'Manuell', num: true },
          { key: 'circuit_plans', label: 'Zirkel', num: true },
        ])}
      </div>

      <div class="card">
        <h2>KI-Anfragen pro Tag</h2>
        ${table(m.ai_daily_stats, [
          { label: 'Tag', render: (r) => fmtDate(r.day) },
          { key: 'model', label: 'Modell' },
          { key: 'requests', label: 'Anfragen', num: true },
          { label: 'Fehlerquote', num: true, render: (r) => `${r.error_rate_pct ?? 0}%` },
          { label: 'Kosten', num: true, render: (r) => `$${r.cost_usd}` },
        ])}
      </div>

      <div class="card">
        <h2>Letzte KI-Fehler</h2>
        ${table(m.ai_errors_recent, [
          { label: 'Zeit', render: (r) => fmtDateTime(r.created_at) },
          { key: 'model', label: 'Modell' },
          { label: 'Fehler', render: (r) => `<span class="clip">${escapeHtml(r.error_message ?? '')}</span>` },
        ])}
      </div>

      <div class="card">
        <h2>Externe API-Calls (Nährwert-Lookups)</h2>
        ${table(m.external_api_calls, [
          { label: 'Tag', render: (r) => fmtDate(r.day) },
          { key: 'call_type', label: 'Typ' },
          { key: 'calls', label: 'Aufrufe', num: true },
        ])}
      </div>
    `;
    $('kpi-feedback')?.addEventListener('click', () => activateTab('feedback'));
  } catch (err) {
    el.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

$('dashboard-refresh').addEventListener('click', loadDashboard);

// ── Feedback ──────────────────────────────────────────────────────────────

async function loadFeedback() {
  const el = $('feedback-content');
  el.innerHTML = 'Lade…';
  const onlyUnhandled = $('feedback-filter').checked;

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
        <button data-id="${escapeHtml(f.id)}" data-handled="${!f.handled}" class="btn-secondary toggle-handled-btn">
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
          toast(err.message, true);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

$('feedback-filter').addEventListener('change', loadFeedback);

// ── Beim Laden: bestehende Session prüfen ────────────────────────────────────

/** Version aus version.js (von scripts/deploy-admin.sh erzeugt) in Kopf und Login anzeigen. */
function renderVersion() {
  const v = window.ADMIN_VERSION;
  if (!v) return;
  const parts = [v.version === 'dev' ? 'dev' : 'v' + v.version, v.commit];
  if (v.deployedAt) parts.push(new Date(v.deployedAt).toLocaleDateString('de-DE'));
  const text = parts.filter(Boolean).join(' · ');
  const title = v.deployedAt ? 'Ausgeliefert am ' + new Date(v.deployedAt).toLocaleString('de-DE') : 'Lokale Fassung';
  document.querySelectorAll('.app-version').forEach((el) => {
    el.textContent = text;
    el.title = title;
  });
}

(async function init() {
  renderVersion();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    showScreen('login');
    return;
  }
  await proceedAfterLogin();
})();
