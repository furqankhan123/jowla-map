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
