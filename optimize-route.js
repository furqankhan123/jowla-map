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

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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

function addOptimizeControl(map) {
  const controlDiv = document.createElement('div');
  const controlUI = document.createElement('div');
  controlUI.style.backgroundColor = '#fff';
  controlUI.style.border = '2px solid #fff';
  controlUI.style.borderRadius = '3px';
  controlUI.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
  controlUI.style.cursor = 'pointer';
  controlUI.style.marginBottom = '22px';
  controlUI.style.textAlign = 'center';
  controlUI.title = 'Optimize the stops currently shown on the map';
  controlDiv.appendChild(controlUI);

  const controlText = document.createElement('div');
  controlText.style.color = 'rgb(25,25,25)';
  controlText.style.fontFamily = 'Roboto,Arial,sans-serif';
  controlText.style.fontSize = '16px';
  controlText.style.lineHeight = '38px';
  controlText.style.paddingLeft = '8px';
  controlText.style.paddingRight = '8px';
  controlText.innerHTML = 'Optimize View';
  controlUI.appendChild(controlText);

  controlUI.addEventListener('click', () => optimizeCurrentView(map));
  controlDiv.index = 2;
  map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(controlDiv);

  mapRef = map;
  drawStartMarker();
  restoreLastRoute(map);
}

function optimizeCurrentView(map) {
  const bounds = map.getBounds();
  if (!bounds) {
    alert('Map bounds not ready');
    return;
  }

  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const latSpan = (ne.lat() - sw.lat()) * BOUNDS_MARGIN;
  const lngSpan = (ne.lng() - sw.lng()) * BOUNDS_MARGIN;
  const expanded = new google.maps.LatLngBounds(
    new google.maps.LatLng(sw.lat() - latSpan, sw.lng() - lngSpan),
    new google.maps.LatLng(ne.lat() + latSpan, ne.lng() + lngSpan)
  );

  // Use only the filtered set that is currently displayed
  const source = window.visibleLocations || window.locations || [];

  if (opts.customStart) {
    runOptimization(map, { lat: opts.customStart.lat, lng: opts.customStart.lng }, expanded, source);
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const start = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        runOptimization(map, start, expanded, source);
      },
      () => {
        const center = map.getCenter();
        const start = { lat: center.lat(), lng: center.lng() };
        runOptimization(map, start, expanded, source);
      }
    );
  } else {
    const center = map.getCenter();
    const start = { lat: center.lat(), lng: center.lng() };
    runOptimization(map, start, expanded, source);
  }
}

function isDoNotVisit(loc) {
  const vc = (loc.visitcode || '').toString().toLowerCase();
  return vc.includes('do not visit');
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
    alert('Not enough eligible stops in the current filtered view.');
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
      name: s.name, address: s.address, latitude: s.latitude, longtitude: s.longtitude
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
      alert('Routes API error: ' + res.status + '\n' + errText.slice(0, 300));
      return null;
    }

    const data = await res.json();
    const route = data.routes && data.routes[0];
    if (!route) {
      alert('No route returned');
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
    alert('Request failed: ' + e.message);
    return null;
  }
}

function renderRoute(map, route) {
  showRoutePanel(route.stops, route.totalMins, route.travelMode, route.start, route.legSecs);
  drawPolyline(map, route.encoded);
  drawNumberedMarkers(map, route.stops);
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

function ensurePanel() {
  let panel = document.getElementById('route-panel');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'route-panel';
  panel.innerHTML = `
    <div id="route-panel-header">
      <span>Optimized Route</span>
      <div class="header-btns">
        <button id="route-minimize-btn" title="Minimize">–</button>
        <button id="route-close-btn" title="Close">&times;</button>
      </div>
    </div>
    <div id="route-panel-body">
      <div id="route-settings"></div>
      <div id="route-results"></div>
    </div>
  `;
  document.body.appendChild(panel);

  const minBtn = document.getElementById('route-minimize-btn');
  minBtn.addEventListener('click', () => {
    panel.classList.toggle('minimized');
    minBtn.textContent = panel.classList.contains('minimized') ? '+' : '–';
    minBtn.title = panel.classList.contains('minimized') ? 'Expand' : 'Minimize';
  });
  document.getElementById('route-close-btn').addEventListener('click', () => {
    panel.classList.remove('visible', 'minimized');
    minBtn.textContent = '–';
    minBtn.title = 'Minimize';
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
      <button id="opt-rerun" class="nav-btn" style="background:#1a73e8;border:none;cursor:pointer;">Optimize</button>
    </div>`;

  document.getElementById('opt-target').addEventListener('change', (e) => { opts.targetMins = parseInt(e.target.value, 10); saveOpts(); });
  document.getElementById('opt-days').addEventListener('change', (e) => { opts.recentDays = parseInt(e.target.value, 10); saveOpts(); });
  document.getElementById('opt-recent').addEventListener('change', (e) => { opts.includeRecent = e.target.checked; saveOpts(); });
  document.getElementById('opt-rerun').addEventListener('click', () => optimizeCurrentView(mapRef));
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

  const startsAt = opts.customStart ? 'custom start' : 'GPS';
  let html = `<div class="meta">~${totalMins} min total &middot; ${modeText} &middot; ${orderedStops.length} stops<br>From filtered map view &middot; starts at ${startsAt}</div><ol>`;
  let t = Date.now();
  orderedStops.forEach((s, i) => {
    t += ((legSecs && legSecs[i]) || 0) * 1000; // travel to this stop
    const eta = legSecs && legSecs.length ? `<span class="eta">${fmtTime(new Date(t))}</span> ` : '';
    html += `<li>${eta}${escapeHtml(s.name || s.address || 'Stop')}</li>`;
    t += AVG_VISIT_MINS * 60 * 1000; // time spent at this stop
  });
  html += `</ol>`;

  const appleUrl = buildAppleMapsUrl(orderedStops, start, modeText);
  if (appleUrl) {
    html += `<a class="nav-btn" href="${appleUrl}" target="_blank" style="background:#007aff;">Open full route in Apple Maps</a>`;
  }

  const segments = buildGoogleMapsSegments(orderedStops, start, modeText);
  if (segments.length === 1) {
    html += `<a class="nav-btn" href="${segments[0].url}" target="_blank">Open in Google Maps</a>`;
  } else if (segments.length > 1) {
    html += `<div class="meta" style="margin-top:10px;">Google Maps supports fewer stops. Open in segments:</div>`;
    segments.forEach((seg, idx) => {
      html += `<a class="nav-btn" href="${seg.url}" target="_blank" style="display:block;margin-top:6px;">Google Maps – Segment ${idx + 1} (${seg.label})</a>`;
    });
  }

  body.innerHTML = html;
  panel.classList.remove('minimized');
  panel.classList.add('visible');
  const minBtn = document.getElementById('route-minimize-btn');
  minBtn.textContent = '–';
  minBtn.title = 'Minimize';
}

window.addOptimizeControl = addOptimizeControl;
window.setRouteStart = setRouteStart;
