/**
 * Optimize Nearby Route feature for Jowla Map
 * Adds a map control that selects nearest unvisited stops,
 * optimizes order via Google Directions (optimize:true),
 * estimates total time, and shows results in a side panel.
 */

const AVG_VISIT_MINS = 3;
const MAX_ROUTE_MINS = 60;
const MAX_STOPS = 12;
const DENSE_THRESHOLD_KM = 0.5;

let currentDirectionsRenderer = null;
let selectedStartMarker = null;

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
  controlUI.title = 'Optimize nearby unvisited stops';
  controlDiv.appendChild(controlUI);

  const controlText = document.createElement('div');
  controlText.style.color = 'rgb(25,25,25)';
  controlText.style.fontFamily = 'Roboto,Arial,sans-serif';
  controlText.style.fontSize = '16px';
  controlText.style.lineHeight = '38px';
  controlText.style.paddingLeft = '8px';
  controlText.style.paddingRight = '8px';
  controlText.innerHTML = 'Optimize Nearby';
  controlUI.appendChild(controlText);

  controlUI.addEventListener('click', () => optimizeNearbyRoute(map));
  controlDiv.index = 2;
  map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(controlDiv);
}

function optimizeNearbyRoute(map) {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by this browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const start = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      runOptimization(map, start);
    },
    () => {
      // Fallback to map center if geolocation denied
      const center = map.getCenter();
      runOptimization(map, { lat: center.lat(), lng: center.lng() });
    }
  );
}

function runOptimization(map, start) {
  const candidates = getNearestUnvisited(start, window.locations || locations, MAX_STOPS);

  if (candidates.length < 2) {
    alert('Not enough nearby unvisited stops found.');
    return;
  }

  const travelMode = isDenseCluster(candidates)
    ? google.maps.TravelMode.WALKING
    : google.maps.TravelMode.DRIVING;

  const directionsService = new google.maps.DirectionsService();
  directionsService.route(
    {
      origin: start,
      destination: candidates[candidates.length - 1],
      waypoints: candidates.slice(0, -1).map((c) => ({
        location: { lat: c.latitude, lng: c.longtitude },
        stopover: true,
      })),
      optimizeWaypoints: true,
      travelMode: travelMode,
    },
    (result, status) => {
      if (status === 'OK') {
        const ordered = applyWaypointOrder(candidates, result.routes[0].waypoint_order);
        const totalMins = estimateTotalTime(result, ordered.length);
        showRoutePanel(ordered, totalMins, travelMode, start, result, map);
        drawRouteOnMap(map, result);
      } else {
        alert('Directions request failed: ' + status);
      }
    }
  );
}

function getNearestUnvisited(start, allLocations, maxCount) {
  if (!allLocations || !allLocations.length) return [];

  const now = new Date();
  return allLocations
    .filter((loc) => {
      if (!loc.latitude || !loc.longtitude) return false;
      // Skip recently visited (within last 30 days) if visitdate present
      if (loc.visitdate) {
        const visit = new Date(loc.visitdate);
        if (!isNaN(visit.getTime())) {
          const daysAgo = (now - visit) / (1000 * 60 * 60 * 24);
          if (daysAgo < 30) return false;
        }
      }
      return true;
    })
    .map((loc) => ({
      ...loc,
      dist: haversine(start, { lat: loc.latitude, lng: loc.longtitude }),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, maxCount);
}

function isDenseCluster(points) {
  if (!points.length) return false;
  const close = points.filter((p) => p.dist < DENSE_THRESHOLD_KM).length;
  return close / points.length > 0.6;
}

function haversine(a, b) {
  const R = 6371; // km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function applyWaypointOrder(candidates, order) {
  return order.map((i) => candidates[i]);
}

function estimateTotalTime(directionsResult, stopCount) {
  const travelSecs = directionsResult.routes[0].legs.reduce(
    (sum, leg) => sum + leg.duration.value,
    0
  );
  return Math.round(travelSecs / 60) + stopCount * AVG_VISIT_MINS;
}

function drawRouteOnMap(map, result) {
  if (currentDirectionsRenderer) {
    currentDirectionsRenderer.setMap(null);
  }
  currentDirectionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    directions: result,
    suppressMarkers: true, // keep original markers
    polylineOptions: { strokeColor: '#1a73e8', strokeWeight: 5 },
  });
}

function showRoutePanel(orderedStops, totalMins, travelMode, start, result, map) {
  let panel = document.getElementById('route-panel');
  if (!panel) {
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
      <div id="route-panel-body"></div>
    `;
    document.body.appendChild(panel);
  }

  // Wire up minimize / close (only once, when panel is first created)
  const minBtn = document.getElementById('route-minimize-btn');
  const closeBtn = document.getElementById('route-close-btn');
  if (minBtn && !minBtn.dataset.wired) {
    minBtn.dataset.wired = '1';
    minBtn.addEventListener('click', () => {
      panel.classList.toggle('minimized');
      minBtn.textContent = panel.classList.contains('minimized') ? '+' : '–';
      minBtn.title = panel.classList.contains('minimized') ? 'Expand' : 'Minimize';
    });
  }
  if (closeBtn && !closeBtn.dataset.wired) {
    closeBtn.dataset.wired = '1';
    closeBtn.addEventListener('click', () => {
      panel.classList.remove('visible');
      panel.classList.remove('minimized');
    });
  }

  const modeText = travelMode === google.maps.TravelMode.WALKING ? 'walking' : 'driving';
  const body = document.getElementById('route-panel-body');

  let html = `<div class="meta">~${totalMins} min total &middot; ${modeText}</div><ol>`;
  orderedStops.forEach((s) => {
    html += `<li>${s.name || s.address || 'Stop'}</li>`;
  });
  html += `</ol>`;

  const waypoints = orderedStops
    .map((s) => `${s.latitude},${s.longtitude}`)
    .join('|');
  const dest = orderedStops[orderedStops.length - 1];
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${dest.latitude},${dest.longtitude}&waypoints=${waypoints}&travelmode=${modeText}`;

  html += `<a class="nav-btn" href="${mapsUrl}" target="_blank">Open in Google Maps</a>`;
  body.innerHTML = html;
  panel.classList.remove('minimized');
  panel.classList.add('visible');

  // Reset minimize button label
  const minBtnReset = document.getElementById('route-minimize-btn');
  if (minBtnReset) {
    minBtnReset.textContent = '–';
    minBtnReset.title = 'Minimize';
  }
}

// Expose for use after map init
window.addOptimizeControl = addOptimizeControl;
