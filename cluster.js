/**
 * Cluster suggestions: find dense groups of eligible (unvisited) stops in the
 * current view and let the user optimize one. Pure client-side, no API cost.
 * Depends on optimize-route.js globals: getStopsInBounds, dedupeByLatLng,
 * haversine, optimizeCurrentView, showToast.
 */
const CLUSTER_RADIUS_KM = 0.4;
const CLUSTER_MIN_STOPS = 4;
const CLUSTER_MAX_POINTS = 2000;
const CLUSTER_TOP_N = 5;

/** stops: [{latitude, longtitude, ...}] -> [{stops, centroid, count, spreadKm}] best first */
function findClusters(stops, radiusKm, minStops) {
  radiusKm = radiusKm || CLUSTER_RADIUS_KM;
  minStops = minStops || CLUSTER_MIN_STOPS;
  const pts = stops.slice(0, CLUSTER_MAX_POINTS);
  if (pts.length < minStops) return [];

  // Grid buckets (cell ~ radius) so neighbor lookups stay cheap.
  const cellLat = radiusKm / 111;
  const cellLng = radiusKm / (111 * Math.cos((pts[0].latitude * Math.PI) / 180));
  const key = (la, ln) => Math.floor(la / cellLat) + ',' + Math.floor(ln / cellLng);
  const grid = new Map();
  pts.forEach((p, i) => {
    const k = key(p.latitude, p.longtitude);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const near = (p) => {
    const out = [];
    const cx = Math.floor(p.latitude / cellLat), cy = Math.floor(p.longtitude / cellLng);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        (grid.get((cx + dx) + ',' + (cy + dy)) || []).forEach((j) => {
          const q = pts[j];
          if (haversine({ lat: p.latitude, lng: p.longtitude }, { lat: q.latitude, lng: q.longtitude }) <= radiusKm) out.push(j);
        });
      }
    }
    return out;
  };

  const neighbors = pts.map(near);
  const order = pts.map((_, i) => i).sort((a, b) => neighbors[b].length - neighbors[a].length);
  const taken = new Array(pts.length).fill(false);
  const clusters = [];

  order.forEach((seed) => {
    if (taken[seed]) return;
    const members = neighbors[seed].filter((j) => !taken[j]);
    if (members.length < minStops) return;
    members.forEach((j) => { taken[j] = true; });
    const group = members.map((j) => pts[j]);
    const centroid = {
      lat: group.reduce((s, p) => s + p.latitude, 0) / group.length,
      lng: group.reduce((s, p) => s + p.longtitude, 0) / group.length
    };
    const spreadKm = 2 * Math.max(...group.map((p) => haversine(centroid, { lat: p.latitude, lng: p.longtitude })));
    clusters.push({ stops: group, centroid, count: group.length, spreadKm, score: group.length - spreadKm });
  });

  return clusters.sort((a, b) => b.score - a.score).slice(0, CLUSTER_TOP_N);
}

let clusterCircle = null;

function clusterBounds(c) {
  const b = new google.maps.LatLngBounds();
  c.stops.forEach((s) => b.extend({ lat: s.latitude, lng: s.longtitude }));
  return b;
}

function highlightCluster(map, c) {
  if (clusterCircle) clusterCircle.setMap(null);
  clusterCircle = new google.maps.Circle({
    map, center: c.centroid, radius: Math.max(c.spreadKm / 2, 0.1) * 1000 * 1.15,
    strokeColor: '#1a73e8', strokeOpacity: 0.9, strokeWeight: 2,
    fillColor: '#1a73e8', fillOpacity: 0.12, clickable: false
  });
  map.fitBounds(clusterBounds(c), 60);
}

function clearClusterHighlight() {
  if (clusterCircle) { clusterCircle.setMap(null); clusterCircle = null; }
}

function suggestClusters() {
  const map = window.map || (typeof mapRef !== 'undefined' ? mapRef : null);
  const bounds = map && map.getBounds();
  if (!bounds) { showToast('Map not ready yet', { type: 'error' }); return; }
  const source = window.visibleLocations || [];
  const eligible = dedupeByLatLng(getStopsInBounds(bounds, source));
  const clusters = findClusters(eligible);
  renderClusterSheet(map, clusters, eligible.length);
}

function ensureClusterSheet() {
  let el = document.getElementById('cluster-sheet');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'cluster-sheet';
  el.innerHTML =
    '<div class="fs-head"><strong>Suggested clusters</strong><button type="button" id="cs-close" aria-label="Close">&times;</button></div>' +
    '<div id="cs-list"></div>';
  document.body.appendChild(el);
  document.getElementById('cs-close').addEventListener('click', closeClusterSheet);
  return el;
}

function closeClusterSheet() {
  const el = document.getElementById('cluster-sheet');
  if (el) el.classList.remove('open');
  clearClusterHighlight();
}

function renderClusterSheet(map, clusters, eligibleCount) {
  const el = ensureClusterSheet();
  const list = document.getElementById('cs-list');
  if (!clusters.length) {
    list.innerHTML = '<div class="cs-empty">No dense groups found among ' + eligibleCount +
      ' eligible stops in view. Zoom out or relax the filters.</div>';
  } else {
    list.innerHTML = clusters.map((c, i) =>
      '<div class="cs-row" data-i="' + i + '">' +
        '<button type="button" class="cs-pick">' +
          '<strong>' + c.count + ' stops</strong> · ' + c.spreadKm.toFixed(1) + ' km across' +
          '<span class="cs-sub">' + escapeHtml(c.stops[0].name || c.stops[0].address || '') + '</span>' +
        '</button>' +
        '<button type="button" class="cs-go">Optimize</button>' +
      '</div>').join('');
    list.querySelectorAll('.cs-row').forEach((row) => {
      const c = clusters[+row.dataset.i];
      row.querySelector('.cs-pick').addEventListener('click', () => highlightCluster(map, c));
      row.querySelector('.cs-go').addEventListener('click', () => {
        el.classList.remove('open');
        clearClusterHighlight();
        map.fitBounds(clusterBounds(c), 60);
        optimizeCurrentView(map, { source: c.stops, bounds: clusterBounds(c) });
      });
    });
  }
  el.classList.add('open');
}

window.suggestClusters = suggestClusters;
window.findClusters = findClusters;
