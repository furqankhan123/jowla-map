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

// Google Maps URL limit: max 9 intermediate waypoints
const MAX_GM_WAYPOINTS = 9;
// Apple Maps practical limit ~15 total points
const MAX_APPLE_STOPS = 15;

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

const APP_VERSION = '0.9.0';

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
    btn.textContent = b ? 'Optimizing…' : 'Optimize';
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

function optimizeCurrentView(map, override) {
  if (optimizing) return;
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
    encoded: result.encoded,
    savedAt: Date.now()
  };
  try { localStorage.setItem(ROUTE_KEY, JSON.stringify(route)); } catch (e) {}
  renderRoute(map, route);
}

async function requestRoute(start, candidates) {
  const travelMode = isDenseCluster(candidates) ? 'WALK' : 'DRIVE';
  const destination = candidates[candidates.length - 1];
  const intermediates = candidates.slice(0, -1);

  const body = {
    origin: { location: { latLng: { latitude: start.lat, longitude: start.lng } } },
    destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longtitude } } },
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
    ordered.push(destination);

    const durationSecs = parseInt(route.duration || '0', 10);
    const legSecs = (route.legs || []).map(l => parseInt(l.duration || '0', 10));
    return {
      ordered,
      legSecs,
      travelMode,
      encoded: route.polyline && route.polyline.encodedPolyline,
      totalMins: Math.round(durationSecs / 60) + ordered.length * AVG_VISIT_MINS
    };
  } catch (e) {
    showToast('Request failed: ' + e.message, { type: 'error' });
    return null;
  }
}

let currentRoute = null;
function persistRoute() {
  try { localStorage.setItem(ROUTE_KEY, JSON.stringify(currentRoute)); } catch (e) {}
}
function nextStopUrl(s) {
  return isIOS
    ? `https://maps.apple.com/?daddr=${s.latitude},${s.longtitude}`
    : `https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longtitude}`;
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
  persistRoute();
  updateDoneUi();
  const stops = currentRoute.stops;
  const next = stops.find((x) => !x.done);
  const msg = `Stop ${stops.indexOf(s) + 1} logged · ` + (next ? `Next: ${stopLabel(stops.indexOf(next))}` : 'All done 🎉');
  showToast(msg, { action: { label: 'Undo', onClick: () => { s.done = false; persistRoute(); updateDoneUi(); } } });
}
window.markRouteStopDone = function (loc) {
  if (!currentRoute || !loc) return;
  const s = currentRoute.stops.find((x) => sameStop(x, loc));
  if (s) markStopDone(s);
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentRoute && document.getElementById('route-panel')) setSheet('peek');
});
/** Refresh done-state visuals: rows, markers and the primary nav button. */
function updateDoneUi() {
  if (!currentRoute) return;
  const stops = currentRoute.stops;
  document.querySelectorAll('#route-results .stop-row').forEach((row) => {
    const done = !!stops[+row.dataset.i].done;
    row.classList.toggle('done', done);
    const b = row.querySelector('.done-btn');
    if (b) b.textContent = done ? '✓' : '○';
  });
  routeMarkers.forEach((m, i) => m.setOpacity(stops[i] && stops[i].done ? 0.35 : 1));
  const next = stops.find((s) => !s.done);
  const el = document.getElementById('route-primary');
  if (!el) return;
  if (!next) { el.innerHTML = '<div class="meta">All stops done 🎉</div>'; return; }
  const n = stops.indexOf(next) + 1;
  const vUrl = window.visitDetailsUrl ? visitDetailsUrl(next) : '';
  el.innerHTML = `<a class="nav-btn${isIOS ? ' apple' : ''}" href="${escapeHtml(nextStopUrl(next))}" target="_blank" rel="noopener">Go: ${n}. ${escapeHtml(next.name || next.address || 'Stop')}</a>` +
    (vUrl ? `<a class="nav-btn log" id="log-visit" href="${escapeHtml(vUrl)}" target="_blank" rel="noopener">Log visit ✓</a>` : '');
  const log = document.getElementById('log-visit');
  if (log) log.addEventListener('click', () => markStopDone(next));
}

function renderRoute(map, route) {
  currentRoute = route;
  showRoutePanel(route.stops, route.totalMins, route.travelMode, route.start, route.legSecs);
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

/**
 * Build Google Maps direction segments.
 * Each segment has at most MAX_GM_WAYPOINTS intermediate points.
 * Segments overlap at the end point so the driver can continue.
 */
function buildGoogleMapsSegments(orderedStops, start, modeText) {
  const segments = [];
  if (!orderedStops.length) return segments;

  let origin = start;
  let remaining = orderedStops.slice();

  while (remaining.length > 0) {
    // Take up to MAX_GM_WAYPOINTS intermediates + 1 destination
    const chunkSize = Math.min(remaining.length, MAX_GM_WAYPOINTS + 1);
    const chunk = remaining.slice(0, chunkSize);
    const dest = chunk[chunk.length - 1];
    const intermediates = chunk.slice(0, -1);

    const waypoints = intermediates.map(s => `${s.latitude},${s.longtitude}`).join('|');
    const originStr = `${origin.lat},${origin.lng}`;
    const destStr = `${dest.latitude},${dest.longtitude}`;

    let url = `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&travelmode=${modeText}`;
    if (waypoints) {
      url += `&waypoints=${waypoints}`;
    }

    const startIdx = orderedStops.indexOf(chunk[0]);
    const endIdx = orderedStops.indexOf(dest);
    segments.push({
      url,
      label: `Stops ${startIdx + 1}–${endIdx + 1}`,
      stopCount: chunk.length
    });

    // Next segment starts at the end of this one
    origin = { lat: dest.latitude, lng: dest.longtitude };
    remaining = remaining.slice(chunkSize - 1); // overlap by 1 so continuity is clear
    if (remaining.length <= 1) break; // avoid tiny trailing segments
  }

  return segments;
}

/**
 * Build a single Apple Maps multi-stop URL (unified scheme).
 * Falls back gracefully if too many stops.
 */
function buildAppleMapsUrl(orderedStops, start, modeText) {
  if (!orderedStops.length) return null;
  if (orderedStops.length > MAX_APPLE_STOPS) return null;

  const mode = modeText === 'walking' ? 'walking' : 'driving';
  const dest = orderedStops[orderedStops.length - 1];
  const intermediates = orderedStops.slice(0, -1);

  let url = `https://maps.apple.com/directions?source=${start.lat},${start.lng}&destination=${dest.latitude},${dest.longtitude}&mode=${mode}`;
  intermediates.forEach(s => {
    url += `&waypoint=${s.latitude},${s.longtitude}`;
  });
  return url;
}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const SHEET_STATES = ['peek', 'half', 'full'];

function setSheet(state) {
  const panel = document.getElementById('route-panel');
  if (!panel) return;
  panel.classList.remove('peek', 'half', 'full');
  panel.classList.add(state);
  panel.style.height = '';
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
      <details class="route-settings-box"><summary>Route settings</summary><div id="route-settings"></div></details>
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
  document.getElementById('route-close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.remove('visible', 'minimized');
    document.body.classList.add('no-sheet');
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
      <div class="start-row">Start: ${opts.customStart
        ? `<b>${escapeHtml(opts.customStart.name)}</b> <a href="#" id="opt-clear-start">clear</a>`
        : 'GPS (or tap a pin → “Set as start”)'}</div>
      <button id="opt-rerun" type="button" class="nav-btn primary">Optimize</button>
      <div class="version">v${APP_VERSION}</div>
    </div>`;

  document.getElementById('opt-target').addEventListener('change', (e) => { opts.targetMins = parseInt(e.target.value, 10); saveOpts(); });
  document.getElementById('opt-days').addEventListener('change', (e) => { opts.recentDays = parseInt(e.target.value, 10); saveOpts(); });
  document.getElementById('opt-recent').addEventListener('change', (e) => { opts.includeRecent = e.target.checked; saveOpts(); });
  const rerun = document.getElementById('opt-rerun');
  rerun.disabled = optimizing;
  rerun.addEventListener('click', () => optimizeCurrentView(mapRef));
  const clr = document.getElementById('opt-clear-start');
  if (clr) clr.addEventListener('click', (e) => { e.preventDefault(); clearRouteStart(); });
}

function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function showRoutePanel(orderedStops, totalMins, travelMode, start, legSecs) {
  const panel = ensurePanel();
  const modeText = travelMode === 'WALK' ? 'walking' : 'driving';
  const body = document.getElementById('route-results');
  const e = escapeHtml;

  document.getElementById('route-summary').textContent =
    `${orderedStops.length} stops · ~${totalMins} min · ${modeText}`;

  const appleUrl = buildAppleMapsUrl(orderedStops, start, modeText);
  const segments = buildGoogleMapsSegments(orderedStops, start, modeText);
  const googleBtn = (seg, label) => `<a class="nav-btn" href="${e(seg.url)}" target="_blank" rel="noopener">${e(label)}</a>`;
  const appleBtn = (label) => `<a class="nav-btn apple" href="${e(appleUrl)}" target="_blank" rel="noopener">${label}</a>`;
  const seg1Label = segments.length > 1 ? `(${segments[0] && segments[0].label})` : '';

  // One primary navigation button, always visible in peek.
  let primary = '';
  if (isIOS && appleUrl) primary = appleBtn('Start in Apple Maps');
  else if (segments.length) primary = googleBtn(segments[0], ('Start in Google Maps ' + seg1Label).trim());
  document.getElementById('route-primary').innerHTML = primary;

  const startsAt = opts.customStart ? 'custom start' : 'GPS';
  let html = `<div class="meta">From filtered map view &middot; starts at ${startsAt}</div><ol>`;
  let t = Date.now();
  orderedStops.forEach((s, i) => {
    t += ((legSecs && legSecs[i]) || 0) * 1000; // travel to this stop
    const eta = legSecs && legSecs.length ? `<span class="eta">${fmtTime(new Date(t))}</span>` : '';
    const goUrl = isIOS
      ? `https://maps.apple.com/?daddr=${s.latitude},${s.longtitude}`
      : `https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longtitude}`;
    const detailsUrl = visitDetailsUrl(s);
    html += `<li class="stop-row" data-i="${i}"><button type="button" class="done-btn" aria-label="Mark done">○</button><span class="num">${i + 1}</span>` +
      `<span class="nm">${eta}${e(s.name || s.address || 'Stop')}</span>` +
      (detailsUrl ? `<a class="go visit" href="${e(detailsUrl)}" target="_blank" rel="noopener">Visit</a>` : '') +
      `<a class="go" href="${e(goUrl)}" target="_blank" rel="noopener">Go</a></li>`;
    t += AVG_VISIT_MINS * 60 * 1000; // time spent at this stop
  });
  html += `</ol>`;

  // Remaining navigation options (primary button covers the first one)
  if (appleUrl && !isIOS) html += appleBtn('Open full route in Apple Maps');
  if (isIOS && segments.length) html += googleBtn(segments[0], ('Google Maps ' + seg1Label).trim());
  segments.forEach((seg, idx) => {
    if (idx === 0) return;
    html += googleBtn(seg, `Google Maps – Segment ${idx + 1} (${seg.label})`);
  });

  body.innerHTML = html;
  body.querySelectorAll('.stop-row').forEach((row) => {
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

  panel.classList.remove('minimized');
  panel.classList.add('visible');
  document.body.classList.remove('no-sheet');
  setSheet('peek');
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
  document.body.classList.remove('sheet-expanded');
};
window.addOptimizeControl = addOptimizeControl;
window.setRouteStart = setRouteStart;
