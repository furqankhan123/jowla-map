/**
 * Quick-log write-back: one tap on the next stop records a visit code and date
 * in the Google Sheet through the Apps Script web app (apps-script/Code.gs).
 * Complements, not replaces, the Visit Details form.
 *
 * Settings (kept in this browser only, never committed):
 *   jowla-sync-url, jowla-sync-token
 * Failed or offline writes are queued in jowla-write-queue and retried.
 */
const SYNC_URL_KEY = 'jowla-sync-url';
const SYNC_TOKEN_KEY = 'jowla-sync-token';
const QUEUE_KEY = 'jowla-write-queue';
const QUICK_CODES = ['No Response', 'Left Message', 'Gave Targheeb'];

function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

function syncConfigured() { return !!(lsGet(SYNC_URL_KEY) && lsGet(SYNC_TOKEN_KEY)); }

function readQueue() {
  try { return JSON.parse(lsGet(QUEUE_KEY) || '[]'); } catch (e) { return []; }
}
function writeQueue(q) { lsSet(QUEUE_KEY, JSON.stringify(q)); }

/** "October 25, 2026", the format the sheet already uses. */
function sheetDate(d) {
  return (d || new Date()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

let flushing = false;
async function flushQueue() {
  if (flushing || !syncConfigured() || !navigator.onLine) return;
  flushing = true;
  try {
    let q = readQueue();
    while (q.length) {
      const item = q[0];
      let ok = false, fatal = false;
      try {
        const res = await fetch(lsGet(SYNC_URL_KEY), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            token: lsGet(SYNC_TOKEN_KEY), rowid: item.rowid,
            visitcode: item.visitcode, visitdate: item.visitdate
          })
        });
        const data = await res.json();
        ok = !!data.ok;
        // Rejections that retrying can't fix (bad token, bad data) are dropped with a warning.
        if (!ok && data.error && data.error !== 'unauthorized') fatal = true;
        if (!ok && data.error === 'unauthorized' && window.showToast) showToast('Sync token rejected', { type: 'error' });
      } catch (e) { /* network error: keep queued */ }
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
function quickLog(stop, code) {
  if (!stop || stop.rowid == null) return;
  const date = sheetDate();
  // Reflect immediately so the recent-visit filter skips it on the next Optimize.
  const loc = (window.locations || []).find((l) => String(l.rowid) === String(stop.rowid) && String(l.db) === String(stop.db));
  if (loc) { loc.visitcode = code; loc.visitdate = date; }
  const q = readQueue();
  q.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), rowid: stop.rowid, visitcode: code, visitdate: date });
  writeQueue(q);
  if (window.markRouteStopDone) markRouteStopDone(stop);
  if (window.showToast) showToast(navigator.onLine ? 'Saving: ' + code : 'Offline: will save when back online');
  flushQueue().then(() => {
    if (!readQueue().length && window.showToast && navigator.onLine) showToast('Saved to sheet');
  });
}

/** Called by updateDoneUi to append quick-log chips under the primary buttons. */
function renderQuickLog(container, stop) {
  if (!syncConfigured() || !stop || stop.rowid == null) return;
  const row = document.createElement('div');
  row.className = 'quick-row';
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
  return `<details class="sync-box"><summary class="settings-btn"><span class="ic">⟳</span>Sheet sync<span class="chev">▾</span></summary>
    <label>Sync URL <input id="sync-url" type="url" placeholder="https://script.google.com/…/exec" value="${escapeHtml(lsGet(SYNC_URL_KEY))}"></label>
    <label>Sync token <input id="sync-token" type="password" autocomplete="off" value="${escapeHtml(lsGet(SYNC_TOKEN_KEY))}"></label>
    <div class="start-row" id="sync-status"></div>
  </details>`;
}

function refreshSyncStatus() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const n = readQueue().length;
  el.textContent = !syncConfigured() ? 'Not configured: quick-log buttons are hidden.'
    : (n ? n + ' pending' : 'Ready');
}

function bindSyncSettings() {
  const url = document.getElementById('sync-url');
  const tok = document.getElementById('sync-token');
  if (!url || !tok) return;
  const save = () => {
    lsSet(SYNC_URL_KEY, url.value.trim());
    lsSet(SYNC_TOKEN_KEY, tok.value.trim());
    refreshSyncStatus();
    if (window.updateDoneUi) updateDoneUi();
    flushQueue();
  };
  url.addEventListener('change', save);
  tok.addEventListener('change', save);
  refreshSyncStatus();
}

window.addEventListener('online', flushQueue);
window.addEventListener('load', () => setTimeout(flushQueue, 1500));

window.quickLog = quickLog;
window.renderQuickLog = renderQuickLog;
window.syncSettingsHtml = syncSettingsHtml;
window.bindSyncSettings = bindSyncSettings;
window.refreshSyncStatus = refreshSyncStatus;
