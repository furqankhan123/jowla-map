/**
 * Optimize Nearby Route feature for Jowla Map
 * Uses Google Routes API (computeRoutes) with optimizeWaypointOrder.
 */

const AVG_VISIT_MINS = 3;
const MAX_STOPS = 12;
const DENSE_THRESHOLD_KM = 0.5;
const API_KEY = 'AIzaSyBWKjSZa8wcaEEqUrjk-opBhmEVxd6GbPQ';

let currentPolyline = null;

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
      const center = map.getCenter();
      runOptimization(map, { lat: center.lat(), lng: center.lng() });
    }
  );
}

async function runOptimization(map, start) {
  const candidates = getNearestUnvisited(start, window.locations || locations, MAX_STOPS);

  if (candidates.length < 2) {
    alert('Not enough nearby unvisited stops found.');
    return;
  }

  const travelMode = isDenseCluster(candidates) ? 'WALK' : 'DRIVE';

  // Last candidate is temporary destination; optimizer reorders intermediates
  const destination = candidates[candidates.length - 1];
  const intermediates = candidates.slice(0, -1);

  const body = {
    origin: {
      location: { latLng: { latitude: start.lat, longitude: start.lng } }
    },
    destination: {
      location: { latLng: { latitude: destination.latitude, longitude: destination.longtitude } }
    },
    intermediates: intermediates.map(c => ({
      location: { latLng: { latitude: c.latitude, longitude: c.longtitude } }
    })),
    travelMode: travelMode,
    optimizeWaypointOrder: true
  };

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      alert('Routes API error: ' + res.status + '\n' + errText.slice(0, 300));
      return;
    }

    const data = await res.json();
    const route = data.routes && data.routes[0];
    if (!route) {
      alert('No route returned');
      return;
    }

    const order = route.optimizedIntermediateWaypointIndex || [];
    const ordered = order.map(i => intermediates[i]);
    ordered.push(destination); // destination stays last in this simple setup

    const durationSecs = parseInt(route.duration || '0', 10);
    const totalMins = Math.round(durationSecs / 60) + ordered.length * AVG_VISIT_MINS;

    showRoutePanel(ordered, totalMins, travelMode, start);
    drawPolyline(map, route.polyline && route.polyline.encodedPolyline);
  } catch (e) {
    alert('Request failed: ' + e.message);
  }
}

function getNearestUnvisited(start, allLocations, maxCount) {
  if (!allLocations || !allLocations.length) return [];

  const now = new Date();
  return allLocations
    .filter((loc) => {
      if (!loc.latitude || !loc.longtitude) return false;
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
  if (currentPolyline) {
    currentPolyline.setMap(null);
  }
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

function showRoutePanel(orderedStops, totalMins, travelMode, start) {
  let panel = document.getElementById('route-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'route-panel';
    panel.innerHTML = `
      <div id="route-panel-header">
        <span>Optimized Route</span>
        <button onclick="document.getElementById('route-panel').classList.remove('visible')">&times;</button>
      </div>
      <div id="route-panel-body"></div>
    `;
    document.body.appendChild(panel);
  }

  const modeText = travelMode === 'WALK' ? 'walking' : 'driving';
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
  panel.classList.add('visible');
}

window.addOptimizeControl = addOptimizeControl;
