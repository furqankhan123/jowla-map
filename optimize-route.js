/**
 * Optimize View: uses only the currently visible (filtered) markers,
 * limited to the map viewport, starting from GPS.
 */

const AVG_VISIT_MINS = 3;
const MAX_STOPS = 15;
const DENSE_THRESHOLD_KM = 0.5;
const BOUNDS_MARGIN = 0.15;
const STORAGE_KEY = 'jowla-optimize-settings';
const ROUTE_KEY = 'jowla-last-route';
const ROUTE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_FIT_ITERATIONS = 3;

// User-adjustable settings (persisted)
const opts = { recentDays: 180, includeRecent: false, targetMins: 60, customStart: null };
try {
  Object.assign(opts, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
} catch (e) {}
function saveOpts() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(opts)); } catch (e) {}
}
const API_KEY = 'AIzaSyBWKjSZa8wcaEEqUrjk-opBhmEVxd6GbPQ';


let currentPolyline = null;
let routeMarkers = [];
let startMarker = null;
let mapRef = null;

/** Called from the marker info window "Set as start" link. */
function setRouteStart(loc) {
  if (!loc || !mapRef) return;
  opts.customStart = { lat: loc.latitude, lng: loc.longtitude, name: loc.name || loc.address || 'Custom start' };
  saveOpts();
  drawStartMarker();
  refreshSettingsUi();
}
function clearRouteStart() {
  opts.customStart = null;
  saveOpts();
  drawStartMarker();
  refreshSettingsUi();
}
function drawStartMarker() {
  if (startMarker) { startMarker.setMap(null); startMarker = null; }
  if (!opts.customStart || !mapRef) return;
  startMarker = new google.maps.Marker({
    position: { lat: opts.customStart.lat, lng: opts.customStart.lng },
    map: mapRef,
    title: 'Route start: ' + opts.customStart.name,
    zIndex: 2000,
    icon: {
      path: google.maps.SymbolPath.CIRCLE, scale: 11,
      fillColor: '#34a853', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3
    },
    label: { text: 'S', color: '#fff', fontWeight: 'bold', fontSize: '12px' }
  });
}

function drawNumberedMarkers(map, ordered) {
  routeMarkers.forEach((m) => m.setMap(null));
  routeMarkers = ordered.map((s, i) => new google.maps.Marker({
    position: { lat: s.latitude, lng: s.longtitude },
    map: map,
    zIndex: 1000 + i,
    clickable: false,
    icon: {
      path: google.maps.SymbolPath.CIRCLE, scale: 12,
      fillColor: '#1a73e8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2
    },
    label: { text: String(i + 1), color: '#fff', fontWeight: 'bold', fontSize: '12px' }
  }));
}

function clearRouteOverlays() {
  routeMarkers.forEach((m) => m.setMap(null));
  routeMarkers = [];
  if (currentPolyline) { currentPolyline.setMap(null); currentPolyline = null; }
}

const APP_VERSION = '0.19.0';

let toastTimer = null;
function showToast(msg, o) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  const act = o && o.action;
  if (act) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = act.label;
    b.addEventListener('click', () => { el.className = ''; act.onClick(); });
    el.appendChild(b);
  }
  el.className = 'show' + (o && o.type === 'error' ? ' error' : '') + (act ? ' has-action' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, act ? 7000 : 4000);
}
window.showToast = showToast;

let optimizing = false;
function setBusy(b) {
  optimizing = b;
  [document.getElementById('optimize-fab'), document.getElementById('opt-rerun')].forEach((btn) => {
    if (!btn) return;
    btn.disabled = b;
    btn.classList.toggle('busy', b);
    if (btn.id === 'opt-rerun') btn.textContent = b ? 'Optimizing…' : 'Optimize';
  });
}

function addOptimizeControl(map) {
  mapRef = map;
  const fab = document.getElementById('optimize-fab');
  if (fab) fab.addEventListener('click', () => optimizeCurrentView(map));
  document.body.classList.add('no-sheet');
  drawStartMarker();
  restoreLastRoute(map);
}

let skipReplanPrompt = false;
function optimizeCurrentView(map, override) {
  if (optimizing) return;
  if (!skipReplanPrompt && currentRoute && currentRoute.stops.some((x) => !x.done)) {
    askReplan(map, override);
    return;
  }
  skipReplanPrompt = false;
  const bounds = override ? override.bounds : map.getBounds();
  if (!bounds) {
    showToast('Map not ready yet', { type: 'error' });
    return;
  }
  setBusy(true);

  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const margin = override ? 0.3 : BOUNDS_MARGIN;
  const latSpan = (ne.lat() - sw.lat()) * margin;
  const lngSpan = (ne.lng() - sw.lng()) * margin;
  const expanded = new google.maps.LatLngBounds(
    new google.maps.LatLng(sw.lat() - latSpan, sw.lng() - lngSpan),
    new google.maps.LatLng(ne.lat() + latSpan, ne.lng() + lngSpan)
  );

  // Use only the filtered set that is currently displayed
  const source = override ? override.source : (window.visibleLocations || window.locations || []);
  const run = (start) => runOptimization(map, start, expanded, source)
    .catch((e) => showToast('Optimize failed: ' + e.message, { type: 'error' }))
    .finally(() => setBusy(false));
  const fallback = () => {
    const center = map.getCenter();
    showToast('Using map center — location unavailable');
    run({ lat: center.lat(), lng: center.lng() });
  };

  if (opts.customStart) {
    run({ lat: opts.customStart.lat, lng: opts.customStart.lng });
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => run({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      fallback,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  } else {
    fallback();
  }
}

function dedupeByLatLng(arr) {
  const seen = new Set();
  return arr.filter(loc => {
    if (!loc.latitude || !loc.longtitude) return false;
    const key = Math.round(loc.latitude * 10000) + ',' + Math.round(loc.longtitude * 10000);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getStopsInBounds(bounds, allLocations) {
  if (!allLocations || !allLocations.length) return [];

  const now = new Date();
  return allLocations.filter((loc) => {
    if (!loc.latitude || !loc.longtitude) return false;
    if (isDoNotVisit(loc)) return false;
    const latLng = new google.maps.LatLng(loc.latitude, loc.longtitude);
    if (!bounds.contains(latLng)) return false;
    if (loc.visitdate && !opts.includeRecent) {
      const visit = new Date(loc.visitdate);
      if (!isNaN(visit.getTime())) {
        const daysAgo = (now - visit) / (1000 * 60 * 60 * 24);
        if (daysAgo < opts.recentDays) return false;
      }
    }
    return true;
  });
}

async function runOptimization(map, start, bounds, source) {
  let candidates = getStopsInBounds(bounds, source);
  candidates = candidates
    .map(loc => ({
      ...loc,
      dist: haversine(start, { lat: loc.latitude, lng: loc.longtitude })
    }))
    .sort((a, b) => a.dist - b.dist);
  candidates = dedupeByLatLng(candidates).slice(0, MAX_STOPS);

  if (candidates.length < 2) {
    showToast('Not enough eligible stops in the current filtered view.', { type: 'error' });
    return;
  }

  // Fit-to-duration: if projected time exceeds the target, drop the farthest
  // stops (proportionally) and re-optimize, up to MAX_FIT_ITERATIONS times.
  let result = null;
  for (let iter = 0; iter < MAX_FIT_ITERATIONS; iter++) {
    result = await requestRoute(start, candidates);
    if (!result) return;
    if (!opts.targetMins || result.totalMins <= opts.targetMins || candidates.length <= 2) break;
    const perStop = result.totalMins / candidates.length;
    let keep = Math.max(2, Math.min(candidates.length - 1, Math.floor(opts.targetMins / perStop)));
    candidates = candidates.slice(0, keep); // already sorted nearest-first
  }

  const route = {
    stops: result.ordered.map(s => ({
      name: s.name, address: s.address, latitude: s.latitude, longtitude: s.longtitude,
      db: s.db, rowid: s.rowid, sts: s.sts, done: false
    })),
    legSecs: result.legSecs,
    totalMins: result.totalMins,
    travelMode: result.travelMode,
    start: start,
    end: { lat: start.lat, lng: start.lng, name: opts.customStart ? opts.customStart.name : 'start', same: true },
    encoded: result.encoded,
    savedAt: Date.now()
  };
  try { localStorage.setItem(ROUTE_KEY, JSON.stringify(route)); } catch (e) {}
  renderRoute(map, route, true);
}

async function requestRoute(start, candidates, endPoint) {
  const travelMode = isDenseCluster(candidates) ? 'WALK' : 'DRIVE';
  // The end is always a location (custom end, else back to the start), never a stop.
  // The end is the start (round trip) unless a stop was chosen as the final stop.
  const endPt = endPoint ? { lat: endPoint.lat, lng: endPoint.lng } : { lat: start.lat, lng: start.lng };
  const intermediates = candidates;

  const body = {
    origin: { location: { latLng: { latitude: start.lat, longitude: start.lng } } },
    destination: { location: { latLng: { latitude: endPt.lat, longitude: endPt.lng } } },
    intermediates: intermediates.map(c => ({ location: { latLng: { latitude: c.latitude, longitude: c.longtitude } } })),
    travelMode: travelMode,
    optimizeWaypointOrder: true
  };

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex,routes.legs.duration'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      showToast('Routes API error ' + res.status + ': ' + errText.slice(0, 120), { type: 'error' });
      return null;
    }

    const data = await res.json();
    const route = data.routes && data.routes[0];
    if (!route) {
      showToast('No route returned', { type: 'error' });
      return null;
    }

    const order = route.optimizedIntermediateWaypointIndex || intermediates.map((_, i) => i);
    const ordered = order.map(i => intermediates[i]);

    const durationSecs = parseInt(route.duration || '0', 10);
    const legSecs = (route.legs || []).map(l => parseInt(l.duration || '0', 10));
    return {
      ordered,
      legSecs,
      travelMode,
      encoded: route.polyline && route.polyline.encodedPolyline,
      totalMins: Math.round(durationSecs / 60) + ordered.length * AVG_VISIT_MINS // all legs incl. the end leg
    };
  } catch (e) {
    showToast('Request failed: ' + e.message, { type: 'error' });
    return null;
  }
}

let currentRoute = null;
let freshRoute = false; // true only right after a new Optimize: open at peek
/** Mid-route Optimize: re-plan the remaining stops, start a new route, or cancel. */
function askReplan(map, override) {
  const old = document.getElementById('replan-choice');
  if (old) old.remove();
  const left = currentRoute.stops.filter((x) => !x.done).length;
  const box = document.createElement('div');
  box.id = 'replan-choice';
  box.innerHTML = `<div class="rc-card"><div class="meta">A route is in progress (${left} stop${left === 1 ? '' : 's'} left).</div>` +
    `<button type="button" class="nav-btn" data-a="replan">Re-plan remaining ${left} from here</button>` +
    `<button type="button" class="nav-btn alt" data-a="new">New route</button>` +
    `<button type="button" class="nav-btn alt" data-a="cancel">Cancel</button></div>`;
  document.body.appendChild(box);
  box.addEventListener('click', (ev) => {
    const a = ev.target.closest('button[data-a]');
    if (!a && ev.target !== box) return;
    box.remove();
    const act = a ? a.dataset.a : 'cancel';
    if (act === 'replan') replanRemaining();
    else if (act === 'new') { skipReplanPrompt = true; optimizeCurrentView(map, override); }
  });
}
/** Reroute only the undone stops from the current position; done stops stay as they are. */
function replanRemaining() {
  if (optimizing || !currentRoute) return;
  const old = currentRoute;
  const done = old.stops.filter((x) => x.done);
  const todo = old.stops.filter((x) => !x.done);
  if (!todo.length) return;
  setBusy(true);
  const go = async (pos) => {
    try {
      const cands = todo.map((x) => ({ ...x, dist: haversine(pos, { lat: x.latitude, lng: x.longtitude }) }));
      const end = old.end ? { lat: old.end.lat, lng: old.end.lng, name: old.end.name } : null;
      const r = await requestRoute(pos, cands, end);
      if (!r) return;
      const strip = (x) => ({
        name: x.name, address: x.address, latitude: x.latitude, longtitude: x.longtitude,
        db: x.db, rowid: x.rowid, sts: x.sts, done: false
      });
      const route = {
        stops: done.concat(r.ordered.map(strip)),
        legSecs: done.map(() => 0).concat(r.legSecs),
        totalMins: r.totalMins, travelMode: r.travelMode, start: pos,
        end: old.end, encoded: r.encoded, savedAt: Date.now()
      };
      persistRouteObj(route);
      renderRoute(mapRef, route);
      showToast('Re-planned ' + todo.length + ' remaining stops');
    } catch (e) {
      showToast('Re-plan failed: ' + e.message, { type: 'error' });
    } finally { setBusy(false); }
  };
  const fb = () => go(old.start);
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((p) => go({ lat: p.coords.latitude, lng: p.coords.longitude }), fb,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  } else fb();
}
/** Re-optimize the current stops so the route ends at `endPoint` {lat,lng,name} (null = back to start). */
async function rerouteWithEnd(endPoint) {
  if (optimizing || !currentRoute) return;
  const old = currentRoute;
  if (!old.stops.length) return;
  setBusy(true);
  try {
    const cands = old.stops.map((x) => ({ ...x, dist: haversine(old.start, { lat: x.latitude, lng: x.longtitude }) }));
    const r = await requestRoute(old.start, cands, endPoint);
    if (!r) return;
    const strip = (x) => ({
      name: x.name, address: x.address, latitude: x.latitude, longtitude: x.longtitude,
      db: x.db, rowid: x.rowid, sts: x.sts, done: !!(old.stops.find((o) => sameStop(o, x)) || {}).done
    });
    const route = {
      stops: r.ordered.map(strip), legSecs: r.legSecs, totalMins: r.totalMins, travelMode: r.travelMode,
      start: old.start, encoded: r.encoded, savedAt: Date.now(),
      end: endPoint
        ? { lat: endPoint.lat, lng: endPoint.lng, name: endPoint.name || 'end point' }
        : { lat: old.start.lat, lng: old.start.lng, name: opts.customStart ? opts.customStart.name : 'start', same: true }
    };
    persistRouteObj(route);
    renderRoute(mapRef, route);
    showToast(endPoint ? 'Route now ends at ' + route.end.name : 'Route returns to start');
  } finally { setBusy(false); }
}
function persistRouteObj(route) { try { localStorage.setItem(ROUTE_KEY, JSON.stringify(route)); } catch (e) {} }
function persistRoute() {
  try { localStorage.setItem(ROUTE_KEY, JSON.stringify(currentRoute)); } catch (e) {}
}
function nextStopUrl(s) {
  return navButtons(s.latitude, s.longtitude).primary.url;
}
function sameStop(a, b) {
  if (a.rowid != null && b.rowid != null) return String(a.rowid) === String(b.rowid) && String(a.db) === String(b.db);
  return a.latitude === b.latitude && a.longtitude === b.longtitude;
}
function stopLabel(i) {
  const s = currentRoute.stops[i];
  return `${i + 1}. ${s.name || s.address || 'Stop'}`;
}
/** Mark a stop done (from any Visit link) and toast with Undo. */
function markStopDone(s) {
  if (!currentRoute || !s || s.done) return;
  s.done = true;
  if (window.ledgerRecord) ledgerRecord(s, true);
  persistRoute();
  updateDoneUi();
  const stops = currentRoute.stops;
  const next = stops.find((x) => !x.done);
  const msg = `Stop ${stops.indexOf(s) + 1} logged · ` + (next ? `Next: ${stopLabel(stops.indexOf(next))}` : 'All done 🎉');
  showToast(msg, { action: { label: 'Undo', onClick: () => { s.done = false; if (window.ledgerRecord) ledgerRecord(s, false); if (window.quickLogUndo) quickLogUndo(s); persistRoute(); updateDoneUi(); } } });
}
window.markRouteStopDone = function (loc) {
  if (!currentRoute || !loc) return;
  const s = currentRoute.stops.find((x) => sameStop(x, loc));
  if (s) markStopDone(s);
};
/** Refresh done-state visuals: rows, markers and the primary nav button. */
function updateDoneUi() {
  if (!currentRoute) return;
  const stops = currentRoute.stops;
  document.querySelectorAll('#route-results .stop-row:not(.end-row)').forEach((row) => {
    const done = !!stops[+row.dataset.i].done;
    row.classList.toggle('done', done);
    const b = row.querySelector('.done-btn');
    if (b) b.textContent = done ? '✓' : '○';
  });
  routeMarkers.forEach((m, i) => m.setOpacity(stops[i] && stops[i].done ? 0.35 : 1));
  updateEtas();
  const next = stops.find((s) => !s.done);
  const el = document.getElementById('route-primary');
  if (!el) return;
  if (!next) {
    el.innerHTML = '<div class="meta">All stops done 🎉</div><button type="button" class="nav-btn" id="find-more">Find more stops</button>';
    const fm = document.getElementById('find-more');
    if (fm) fm.addEventListener('click', () => { skipReplanPrompt = true; optimizeCurrentView(mapRef); });
    return;
  }
  const n = stops.indexOf(next) + 1;
  const vUrl = window.visitDetailsUrl ? visitDetailsUrl(next) : '';
  el.innerHTML = `<a class="nav-btn${navButtons(next.latitude, next.longtitude).primary.app === 'apple' ? ' apple' : ''}" href="${escapeHtml(nextStopUrl(next))}" target="_blank" rel="noopener">Go: ${n}. ${escapeHtml(next.name || next.address || 'Stop')}</a>` +
    (vUrl ? `<a class="nav-btn log" id="log-visit" href="${escapeHtml(vUrl)}" target="_blank" rel="noopener">Log visit ✓</a>` : '');
  const log = document.getElementById('log-visit');
  if (log) log.addEventListener('click', () => markStopDone(next));
  if (window.renderQuickLog) renderQuickLog(el, next);
}

function renderRoute(map, route, fresh) {
  freshRoute = !!fresh;
  currentRoute = route;
  showRoutePanel(route.stops, route.totalMins, route.travelMode, route.start, route.legSecs, route.end);
  drawPolyline(map, route.encoded);
  drawNumberedMarkers(map, route.stops);
  updateDoneUi();
}

function restoreLastRoute(map) {
  try {
    const raw = localStorage.getItem(ROUTE_KEY);
    if (!raw) return;
    const route = JSON.parse(raw);
    if (!route || Date.now() - route.savedAt > ROUTE_MAX_AGE_MS) return;
    renderRoute(map, route);
  } catch (e) {}
}

function isDenseCluster(points) {
  if (!points.length) return false;
  const close = points.filter((p) => p.dist < DENSE_THRESHOLD_KM).length;
  return close / points.length > 0.6;
}

function haversine(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function drawPolyline(map, encoded) {
  if (currentPolyline) currentPolyline.setMap(null);
  if (!encoded || !google.maps.geometry) return;
  const path = google.maps.geometry.encoding.decodePath(encoded);
  currentPolyline = new google.maps.Polyline({
    path: path,
    geodesic: true,
    strokeColor: '#1a73e8',
    strokeWeight: 5,
    map: map
  });
}

const SHEET_STATES = ['peek', 'half', 'full'];

const SHEET_KEY = 'jowla-sheet-state';
function savedSheet() {
  try { const v = localStorage.getItem(SHEET_KEY); return SHEET_STATES.indexOf(v) >= 0 ? v : 'peek'; } catch (e) { return 'peek'; }
}
function setSheet(state) {
  const panel = document.getElementById('route-panel');
  if (!panel) return;
  panel.classList.remove('peek', 'half', 'full');
  panel.classList.add(state);
  panel.style.height = '';
  try { localStorage.setItem(SHEET_KEY, state); } catch (e) {}
  document.body.classList.toggle('sheet-expanded', state !== 'peek');
  syncSheetPeek();
}
/** Keep FABs exactly above the peek sheet, whatever height its content needs. */
function syncSheetPeek() {
  const panel = document.getElementById('route-panel');
  if (!panel || !panel.classList.contains('visible') || !panel.classList.contains('peek')) return;
  if (window.matchMedia('(min-width: 640px)').matches) return;
  document.documentElement.style.setProperty('--sheet-peek', panel.offsetHeight + 'px');
}
function currentSheet() {
  const panel = document.getElementById('route-panel');
  return SHEET_STATES.find((s) => panel.classList.contains(s)) || 'peek';
}

function ensurePanel() {
  let panel = document.getElementById('route-panel');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'route-panel';
  panel.classList.add('peek');
  panel.innerHTML = `
    <div id="route-handle"></div>
    <div id="route-panel-header">
      <span id="route-summary">Optimized Route</span>
      <div class="header-btns">
        <button id="route-minimize-btn" title="Minimize" type="button">–</button>
        <button id="route-close-btn" title="Close" type="button">&times;</button>
      </div>
    </div>
    <div id="route-primary"></div>
    <div id="route-panel-body">
      <div id="route-results"></div>
      <details class="route-settings-box"><summary class="settings-btn"><span class="ic">⚙</span>Route settings<span class="chev">▾</span></summary><div id="route-settings"></div></details>
    </div>
  `;
  document.body.appendChild(panel);
  if (window.ResizeObserver) new ResizeObserver(syncSheetPeek).observe(panel);

  const minBtn = document.getElementById('route-minimize-btn');
  const isDesktop = () => window.matchMedia('(min-width: 640px)').matches;
  const syncMin = () => {
    const m = panel.classList.contains('minimized');
    minBtn.textContent = m ? '+' : '–';
    minBtn.title = m ? 'Expand' : 'Minimize';
  };
  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isDesktop()) panel.classList.toggle('minimized');
    else setSheet(currentSheet() === 'peek' ? 'half' : 'peek');
    syncMin();
  });
  document.getElementById('route-fab').addEventListener('click', () => {
    panel.classList.add('visible');
    document.body.classList.remove('no-sheet', 'route-closed');
    setSheet(savedSheet());
  });
  document.getElementById('route-close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.remove('visible', 'minimized');
    document.body.classList.add('no-sheet');
    if (currentRoute) document.body.classList.add('route-closed');
    document.body.classList.remove('sheet-expanded'); // otherwise the floating buttons stay hidden
    syncMin();
  });

  // Tap header to cycle states; drag handle/header to snap to nearest state.
  const grab = [document.getElementById('route-handle'), document.getElementById('route-panel-header')];
  let startY = null, startH = 0, moved = false;
  grab.forEach((el) => {
    el.addEventListener('touchstart', (e) => {
      if (isDesktop()) return;
      startY = e.touches[0].clientY; startH = panel.offsetHeight; moved = false;
      panel.classList.add('dragging');
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (startY == null) return;
      const dy = startY - e.touches[0].clientY;
      if (Math.abs(dy) > 6) moved = true;
      if (moved) panel.style.height = Math.max(80, Math.min(window.innerHeight * 0.9, startH + dy)) + 'px';
    }, { passive: true });
    el.addEventListener('touchend', () => {
      if (startY == null) return;
      panel.classList.remove('dragging');
      if (moved) {
        const h = panel.offsetHeight, vh = window.innerHeight;
        const targets = { peek: 150, half: vh * 0.5, full: vh * 0.9 };
        const best = SHEET_STATES.reduce((a, b) => Math.abs(targets[b] - h) < Math.abs(targets[a] - h) ? b : a);
        setSheet(best);
      }
      startY = null;
      el._swallow = moved; // suppress the click that follows a drag
    });
    el.addEventListener('click', (e) => {
      if (el._swallow) { el._swallow = false; return; }
      if (isDesktop() || e.target.closest('button')) return;
      setSheet(SHEET_STATES[(SHEET_STATES.indexOf(currentSheet()) + 1) % 3]);
    });
  });

  refreshSettingsUi();
  return panel;
}

function refreshSettingsUi() {
  const el = document.getElementById('route-settings');
  if (!el) return;
  const sel = (id, val, items) =>
    `<select id="${id}">` +
    items.map(([v, label]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${label}</option>`).join('') +
    `</select>`;

  el.innerHTML = `
    <div class="settings">
      <label>Target time ${sel('opt-target', opts.targetMins, [[30, '30 min'], [45, '45 min'], [60, '60 min'], [0, 'No limit']])}</label>
      <label>Skip visited within ${sel('opt-days', opts.recentDays, [[30, '30 days'], [90, '90 days'], [180, '180 days']])}</label>
      <label class="chk"><input type="checkbox" id="opt-recent"${opts.includeRecent ? ' checked' : ''}> Include recently visited</label>
      <label>Preferred maps app ${sel('opt-nav', navPref(), [['google', 'Google Maps'], ['apple', 'Apple Maps']])}</label>
      <div class="start-row">Start: ${opts.customStart
        ? `<b>${escapeHtml(opts.customStart.name)}</b> <a href="#" id="opt-clear-start">clear</a>`
        : 'GPS (or tap a pin → “Set as start”)'}</div>
      <button id="opt-rerun" type="button" class="nav-btn primary">Optimize</button>
      ${window.syncSettingsHtml ? syncSettingsHtml() : ''}
      <button id="opt-tour" type="button" class="nav-btn set-end">Replay tour</button>
      <div class="version">v${APP_VERSION}</div>
    </div>`;

  document.getElementById('opt-target').addEventListener('change', (e) => { opts.targetMins = parseInt(e.target.value, 10); saveOpts(); });
  document.getElementById('opt-days').addEventListener('change', (e) => { opts.recentDays = parseInt(e.target.value, 10); saveOpts(); });
  document.getElementById('opt-recent').addEventListener('change', (e) => { opts.includeRecent = e.target.checked; saveOpts(); });
  document.getElementById('opt-nav').addEventListener('change', (e) => {
    setNavPref(e.target.value);
    if (currentRoute) { showRoutePanel(currentRoute.stops, currentRoute.totalMins, currentRoute.travelMode, currentRoute.start, currentRoute.legSecs, currentRoute.end); }
  });
  const tourBtn = document.getElementById('opt-tour');
  if (tourBtn) tourBtn.addEventListener('click', () => window.startTour && startTour());
  const rerun = document.getElementById('opt-rerun');
  rerun.disabled = optimizing;
  rerun.addEventListener('click', () => optimizeCurrentView(mapRef));
  const clr = document.getElementById('opt-clear-start');
  if (clr) clr.addEventListener('click', (e) => { e.preventDefault(); clearRouteStart(); });
  if (window.bindSyncSettings) bindSyncSettings();
}

/** Address entry for a different end point: Places (New) autocomplete suggestions, Geocoder fallback, or current location. */
function openEndPicker() {
  const pk = document.getElementById('end-picker');
  if (!pk) return;
  pk.innerHTML = '<div class="meta">Finish the route at:</div>' +
    '<input id="end-addr" type="text" placeholder="Type an address or place" autocomplete="off">' +
    '<div id="end-sugg"></div>' +
    '<div class="end-btns"><button type="button" id="end-go" class="nav-btn">Set end</button>' +
    '<button type="button" id="end-here" class="nav-btn set-end">Use my location</button></div>';
  pk.hidden = false;
  const input = document.getElementById('end-addr');
  const list = document.getElementById('end-sugg');
  let timer = null, placesLib = null, token = null;

  const geocode = (q) => new google.maps.Geocoder().geocode({ address: q }, (res, status) => {
    if (status !== 'OK' || !res[0]) { showToast('Address not found', { type: 'error' }); return; }
    const l = res[0].geometry.location;
    rerouteWithEnd({ lat: l.lat(), lng: l.lng(), name: q });
  });
  const loadPlaces = () => placesLib || (placesLib = google.maps.importLibrary('places'));

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { list.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      try {
        const lib = await loadPlaces();
        token = token || new lib.AutocompleteSessionToken();
        const req = { input: q, sessionToken: token };
        const b = mapRef && mapRef.getBounds();
        if (b) req.locationBias = b;
        const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        list.innerHTML = '';
        suggestions.slice(0, 5).forEach((sg) => {
          const pp = sg.placePrediction;
          const btn = document.createElement('button');
          btn.type = 'button'; btn.className = 'pick-end';
          btn.textContent = pp.text.toString();
          btn.addEventListener('click', async () => {
            const place = pp.toPlace();
            await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });
            token = null;
            rerouteWithEnd({ lat: place.location.lat(), lng: place.location.lng(), name: place.displayName || place.formattedAddress });
          });
          list.appendChild(btn);
        });
      } catch (e) {
        list.innerHTML = '';
        showToast('Suggestions unavailable: type the full address and tap Set end', { type: 'error' });
      }
    }, 300);
  });
  document.getElementById('end-go').addEventListener('click', () => {
    const q = input.value.trim();
    if (!q) { showToast('Type an address first', { type: 'error' }); return; }
    geocode(q);
  });
  document.getElementById('end-here').addEventListener('click', () => {
    if (!navigator.geolocation) { showToast('Location unavailable', { type: 'error' }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => rerouteWithEnd({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'My location' }),
      () => showToast('Location unavailable', { type: 'error' }),
      { enableHighAccuracy: true, timeout: 10000 });
  });
  input.focus();
  setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
}

function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** ETAs from now, starting at the first undone stop; done stops get null. */
function computeEtas(stops, legSecs, now) {
  const etas = []; let t = now; let endEta = null;
  const hasLegs = legSecs && legSecs.length;
  stops.forEach((s, i) => {
    if (s.done) { etas.push(null); return; }
    t += ((legSecs && legSecs[i]) || 0) * 1000;
    etas.push(hasLegs ? t : null);
    t += AVG_VISIT_MINS * 60 * 1000;
  });
  if (legSecs && legSecs.length > stops.length) endEta = t + (legSecs[stops.length] || 0) * 1000;
  return { etas, endEta };
}
function routeSummaryText(route) {
  const modeText = route.travelMode === 'WALK' ? 'walking' : 'driving';
  const left = route.stops.filter((x) => !x.done).length;
  const { endEta } = computeEtas(route.stops, route.legSecs, Date.now());
  const endName = route.end ? route.end.name : (route.start ? 'start' : '');
  const endTxt = endEta && endName ? ` · ends at ${endName} ${fmtTime(new Date(endEta))}` : '';
  const count = left < route.stops.length ? `${left} of ${route.stops.length}` : `${route.stops.length}`;
  return `${count} stops · ~${route.totalMins} min · ${modeText}${endTxt}`;
}
function updateEtas() {
  if (!currentRoute) return;
  const { etas, endEta } = computeEtas(currentRoute.stops, currentRoute.legSecs, Date.now());
  document.querySelectorAll('#route-results .stop-row').forEach((row) => {
    const el = row.querySelector('.eta');
    if (!el) return;
    if (row.classList.contains('end-row')) { if (endEta) el.textContent = fmtTime(new Date(endEta)); return; }
    const v = etas[+row.dataset.i];
    el.textContent = v ? fmtTime(new Date(v)) : '\u2713';
  });
  const sum = document.getElementById('route-summary');
  if (sum) sum.textContent = routeSummaryText(currentRoute);
}
setInterval(updateEtas, 60000);

function showRoutePanel(orderedStops, totalMins, travelMode, start, legSecs, end) {
  const panel = ensurePanel();
  const scroller = document.getElementById('route-panel-body');
  const keepScroll = scroller ? scroller.scrollTop : 0;
  const modeText = travelMode === 'WALK' ? 'walking' : 'driving';
  const body = document.getElementById('route-results');
  const e = escapeHtml;

  if (!end && start) end = { lat: start.lat, lng: start.lng, name: 'start', same: true };
  const endStop = end ? { latitude: end.lat, longtitude: end.lng, name: end.name } : null;
  let endEta = '';
  if (endStop && legSecs && legSecs.length > orderedStops.length) {
    const tEnd = Date.now() + (legSecs.reduce((a, b) => a + b, 0) + orderedStops.length * AVG_VISIT_MINS * 60) * 1000;
    endEta = ` · ends at ${endStop.name} ${fmtTime(new Date(tEnd))}`;
  }
  document.getElementById('route-summary').textContent =
    `${orderedStops.length} stops · ~${totalMins} min · ${modeText}${endEta}`;
  // Navigation links run to the end point as the final destination.
  const navStops = endStop ? orderedStops.concat([endStop]) : orderedStops;

  const googleSegs = buildGoogleMapsSegments(navStops, start, modeText);
  const appleSegs = buildAppleMapsSegments(navStops, start, modeText);
  const appName = (app) => (app === 'apple' ? 'Apple Maps' : 'Google Maps');
  const segsFor = (app) => (app === 'apple' ? appleSegs : googleSegs);
  const pref = navPref();
  const otherApp = pref === 'apple' ? 'google' : 'apple';
  const segRow = (app) => {
    const segs = segsFor(app);
    return `<div class="seg-row"><span class="seg-app">${appName(app)}</span>` +
      segs.map((seg, i) => `<a class="seg-btn${app === 'apple' ? ' apple' : ''}" href="${e(seg.url)}" target="_blank" rel="noopener" ` +
        `aria-label="${appName(app)} ${segs.length > 1 ? e(seg.label) : 'route'}" title="${e(seg.label)}">${segs.length > 1 ? i + 1 : 'Start'}</a>`).join('') + '</div>';
  };
  const prim = segsFor(pref);
  document.getElementById('route-primary').innerHTML = prim.length
    ? `<a class="nav-btn${pref === 'apple' ? ' apple' : ''}" href="${e(prim[0].url)}" target="_blank" rel="noopener">Start in ${appName(pref)}${prim.length > 1 ? ' (' + e(prim[0].label) + ')' : ''}</a>`
    : '';

  const startsAt = opts.customStart ? 'custom start' : 'GPS';
  let html = `<div class="meta">From filtered map view &middot; starts at ${startsAt}</div><ol>`;
  let t = Date.now();
  orderedStops.forEach((s, i) => {
    t += ((legSecs && legSecs[i]) || 0) * 1000; // travel to this stop
    const eta = legSecs && legSecs.length ? `<span class="eta">${fmtTime(new Date(t))}</span>` : '';
    const nb = navButtons(s.latitude, s.longtitude);
    const detailsUrl = visitDetailsUrl(s);
    html += `<li class="stop-row" data-i="${i}"><button type="button" class="done-btn" aria-label="Mark done">○</button><span class="num">${i + 1}</span>` +
      `<span class="nm">${eta}${e(s.name || s.address || 'Stop')}</span>` +
      (detailsUrl ? `<a class="go visit" href="${e(detailsUrl)}" target="_blank" rel="noopener">Log</a>` : '') +
      `<a class="go" href="${e(nb.primary.url)}" target="_blank" rel="noopener">Go</a></li>`;
    t += AVG_VISIT_MINS * 60 * 1000; // time spent at this stop
  });
  if (endStop) {
    t += ((legSecs && legSecs[orderedStops.length]) || 0) * 1000;
    const eEta = legSecs && legSecs.length > orderedStops.length ? `<span class="eta">${fmtTime(new Date(t))}</span>` : '';
    const nbE = navButtons(endStop.latitude, endStop.longtitude);
    html += `<li class="stop-row end-row" data-end="1"><span class="num end">E</span><span class="nm">${eEta}${e(end.same ? 'End: back at ' + end.name : 'End: ' + end.name)}</span>` +
      `<a class="go" href="${e(nbE.primary.url)}" target="_blank" rel="noopener">Go</a></li>`;
  }
  html += `</ol>`;
  if (end && !end.same) html += `<button type="button" class="nav-btn reset-end">Reset: return to start</button>`;
  else html += `<button type="button" class="nav-btn set-end">Set a different end point…</button>`;
  html += `<div id="end-picker" hidden></div>`;

  html += `<div class="seg-grid">${segRow(pref)}${segRow(otherApp)}</div>`;

  body.innerHTML = html;
  body.querySelectorAll('.stop-row:not(.end-row)').forEach((row) => {
    row.addEventListener('click', (ev) => {
      const s = orderedStops[+row.dataset.i];
      if (ev.target.closest('a.visit')) { markStopDone(s); return; }
      if (ev.target.closest('a')) return;
      if (ev.target.closest('.done-btn')) {
        s.done = !s.done;
        persistRoute();
        updateDoneUi();
        return;
      }
      if (mapRef && s) { mapRef.panTo({ lat: s.latitude, lng: s.longtitude }); mapRef.setZoom(18); }
    });
  });

  const setEnd = body.querySelector('.set-end');
  if (setEnd) setEnd.addEventListener('click', openEndPicker);
  const rst = body.querySelector('.reset-end');
  if (rst) rst.addEventListener('click', () => rerouteWithEnd(null));

  panel.classList.remove('minimized');
  panel.classList.add('visible');
  document.body.classList.remove('no-sheet', 'route-closed');
  setSheet(freshRoute ? 'peek' : savedSheet());
  freshRoute = false;
  if (scroller) scroller.scrollTop = keepScroll;
  document.getElementById('route-minimize-btn').textContent = '–';
  updateDoneUi();
}

window.clearRoute = function () {
  clearRouteOverlays();
  currentRoute = null;
  try { localStorage.removeItem(ROUTE_KEY); } catch (e) {}
  const panel = document.getElementById('route-panel');
  if (panel) panel.classList.remove('visible', 'minimized');
  document.body.classList.add('no-sheet');
  document.body.classList.remove('sheet-expanded', 'route-closed');
};
window.addOptimizeControl = addOptimizeControl;
window.setRouteStart = setRouteStart;
