/**
 * Quick-log write-back: one tap on the next stop submits the same public Google
 * Form that Visit Details uses (no owner access needed). Optionally goes through
 * a standalone Apps Script relay (apps-script/Code.gs) for confirmed delivery.
 *
 * Settings (this browser only): jowla-sync-url, jowla-sync-token, jowla-quicklog
 * Failed or offline writes are queued in jowla-write-queue and retried.
 */
const SYNC_URL_KEY = 'jowla-sync-url';
const SYNC_TOKEN_KEY = 'jowla-sync-token';
const QUICKLOG_KEY = 'jowla-quicklog';
const QUEUE_KEY = 'jowla-write-queue';
// Keep in sync with FORM_URL / ENTRY in apps-script/Code.gs (and VisitDetails.html).
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSe_TQfBBhpLky9XyTz0SuSsJpcgfF61pS8onUX4RgQxEITOpA/formResponse';
const ENTRY = { db: 'entry.647159166', rowid: 'entry.589985326', name: 'entry.459245489',
  code: 'entry.607683347', status: 'entry.1275295467', lang: 'entry.2108730671', comments: 'entry.322317336' };
const QUICK_CODES = ['No Response', 'Left Message', 'Gave Targheeb'];

// Optional relay: owner sets these once in config.js; end users never see or type them.
const CFG = window.JOWLA_CONFIG || {};
function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

function quickLogEnabled() { return lsGet(QUICKLOG_KEY) !== '0'; }
function syncUrl() { return CFG.syncUrl || lsGet(SYNC_URL_KEY); }
function syncToken() { return CFG.syncToken || lsGet(SYNC_TOKEN_KEY); }
function syncConfigured() { return !!(syncUrl() && syncToken()); }
// Manual relay/toggle form is for the owner only: open the app with ?admin=1.
const SHOW_SYNC_SETTINGS = /[?&]admin=1/.test(location.search);

function readQueue() {
  try { return JSON.parse(lsGet(QUEUE_KEY) || '[]'); } catch (e) { return []; }
}
function writeQueue(q) { lsSet(QUEUE_KEY, JSON.stringify(q)); }

/** "October 25, 2026", the format the sheet already uses (local done-state only). */
function sheetDate(d) {
  return (d || new Date()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Query params identical to what Visit Details submits (its form is a GET). */
function buildFormBody(item) {
  const b = new URLSearchParams();
  b.append(ENTRY.db, item.db || '');
  b.append(ENTRY.rowid, String(item.rowid));
  b.append(ENTRY.name, item.name || '');
  b.append(ENTRY.code, item.visitcode);
  // Always resend current Status so the form pipeline doesn't wipe it.
  String(item.sts || '').split(',').map((x) => x.trim()).filter(Boolean)
    .forEach((x) => b.append(ENTRY.status, x));
  // Language/Comments are omitted when empty, like the real form (empty checkbox value = 400).
  return b;
}

/** Returns {ok, fatal}. Throws on network error (stays queued). */
async function sendItem(item) {
  if (syncConfigured()) {
    const res = await fetch(syncUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: syncToken(), db: item.db, rowid: item.rowid, name: item.name,
        visitcode: item.visitcode, sts: item.sts || ''
      })
    });
    const data = await res.json();
    const ok = !!data.ok;
    if (!ok && data.error === 'unauthorized' && window.showToast) showToast('Sync token rejected', { type: 'error' });
    return { ok, fatal: !ok && !!data.error && data.error !== 'unauthorized' };
  }
  // Direct: opaque no-cors response; a resolved fetch counts as delivered.
  await fetch(FORM_URL + '?' + buildFormBody(item).toString(), { mode: 'no-cors' });
  return { ok: true, fatal: false };
}

/** Old queue items lack db/name/sts: fill from loaded locations. */
function hydrateItem(item) {
  if (item.db) return true;
  const loc = (window.locations || []).find((l) => String(l.rowid) === String(item.rowid));
  if (!loc) return false;
  item.db = loc.db; item.name = loc.name; item.sts = loc.sts || '';
  return true;
}

let flushing = false;
async function flushQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    let q = readQueue();
    while (q.length) {
      const item = q[0];
      let ok = false, fatal = false;
      if (!hydrateItem(item)) {
        fatal = true;
      } else {
        try { ({ ok, fatal } = await sendItem(item)); } catch (e) { /* network error: keep queued */ }
      }
      if (ok || fatal) {
        q = readQueue().filter((x) => x.id !== item.id);
        writeQueue(q);
        if (fatal && window.showToast) showToast('Could not save one visit: dropped', { type: 'error' });
      } else {
        break;
      }
    }
  } finally {
    flushing = false;
    if (window.refreshSyncStatus) refreshSyncStatus();
  }
}

/** Record a visit for a route stop and mark it done. */
const recentLogs = {};
let cooldownUntil = 0;
const COOLDOWN_MS = 1500;
function quickLog(stop, code) {
  if (!stop || stop.rowid == null) return;
  const now = Date.now();
  if (now < cooldownUntil) return;
  const key = stop.db + ':' + stop.rowid;
  if (recentLogs[key] && now - recentLogs[key] < 10000) return;
  recentLogs[key] = now;
  cooldownUntil = now + COOLDOWN_MS;
  const date = sheetDate();
  // Reflect immediately so the recent-visit filter skips it on the next Optimize.
  const loc = (window.locations || []).find((l) => String(l.rowid) === String(stop.rowid) && String(l.db) === String(stop.db));
  if (loc) { if (loc._prevVisit === undefined) loc._prevVisit = loc.visitdate || ''; loc.visitcode = code; }
  const q = readQueue();
  q.push({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), rowid: stop.rowid,
    db: (loc && loc.db) || stop.db, name: (loc && loc.name) || stop.name,
    sts: (loc && loc.sts) || stop.sts || '', visitcode: code, visitdate: date
  });
  writeQueue(q);
  if (window.markRouteStopDone) markRouteStopDone(stop);
  if (window.showToast) showToast(navigator.onLine ? 'Saving: ' + code : 'Offline: will save when back online');
  flushQueue().then(() => {
    if (!readQueue().length && window.showToast && navigator.onLine) showToast('Submitted');
  });
}

/** Called by updateDoneUi to append quick-log chips under the primary buttons. */
function renderQuickLog(container, stop) {
  if (!quickLogEnabled() || !stop || stop.rowid == null || !stop.db) return;
  const row = document.createElement('div');
  row.className = 'quick-row';
  const remaining = cooldownUntil - Date.now();
  if (remaining > 0) {
    row.classList.add('cooldown');
    setTimeout(() => row.classList.remove('cooldown'), remaining);
  }
  QUICK_CODES.forEach((code) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quick-chip';
    b.textContent = code;
    b.addEventListener('click', () => quickLog(stop, code));
    row.appendChild(b);
  });
  container.appendChild(row);
}

function syncSettingsHtml() {
  if (!SHOW_SYNC_SETTINGS) return '';
  return `<details class="sync-box"><summary class="settings-btn"><span class="ic">⟳</span>Sheet sync<span class="chev">▾</span></summary>
    <label><input id="quicklog-on" type="checkbox" ${quickLogEnabled() ? 'checked' : ''}> Quick-log buttons</label>
    <label>Relay URL (optional: confirmed saves) <input id="sync-url" type="url" placeholder="https://script.google.com/…/exec" value="${escapeHtml(lsGet(SYNC_URL_KEY))}"></label>
    <label>Relay token <input id="sync-token" type="password" autocomplete="off" value="${escapeHtml(lsGet(SYNC_TOKEN_KEY))}"></label>
    <div class="start-row" id="sync-status"></div>
  </details>`;
}

function refreshSyncStatus() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const n = readQueue().length;
  el.textContent = (syncConfigured() ? 'Via relay' : 'Direct to form') + (n ? ' · ' + n + ' pending' : ' · ready');
}

function bindSyncSettings() {
  const url = document.getElementById('sync-url');
  const tok = document.getElementById('sync-token');
  const ql = document.getElementById('quicklog-on');
  if (!url || !tok) return;
  const save = () => {
    lsSet(SYNC_URL_KEY, url.value.trim());
    lsSet(SYNC_TOKEN_KEY, tok.value.trim());
    if (ql) lsSet(QUICKLOG_KEY, ql.checked ? '1' : '0');
    refreshSyncStatus();
    if (window.updateDoneUi) updateDoneUi();
    flushQueue();
  };
  url.addEventListener('change', save);
  tok.addEventListener('change', save);
  if (ql) ql.addEventListener('change', save);
  refreshSyncStatus();
}

window.addEventListener('online', flushQueue);
window.addEventListener('load', () => setTimeout(flushQueue, 1500));

window.buildFormBody = buildFormBody;
window.quickLog = quickLog;
window.renderQuickLog = renderQuickLog;
window.syncSettingsHtml = syncSettingsHtml;
window.bindSyncSettings = bindSyncSettings;
window.refreshSyncStatus = refreshSyncStatus;
