var map;
var locations = [];
var visibleLocations = [];
var markers = [];
var frisco = {lat: 33.0597, lng: -96.7512};

function isDoNotVisit(loc) {
  var vc = (loc.visitcode || '').toString().toLowerCase();
  return vc.indexOf('do not visit') !== -1;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
window.escapeHtml = escapeHtml;

function visitDetailsUrl(loc) {
  if (!loc || loc.db == null || loc.rowid == null) return '';
  return 'https://dailyfikr.github.io/VisitDetails.html?DB=' + encodeURIComponent(loc.db) +
    '&ID=' + encodeURIComponent(loc.rowid) + '&Name=' + encodeURIComponent(loc.name) +
    '&Sts=' + encodeURIComponent(loc.sts);
}
window.visitDetailsUrl = visitDetailsUrl;

var userDot = null;
function locateUser() {
  if (!navigator.geolocation) {
    if (window.showToast) showToast('Location not supported', { type: 'error' });
    return;
  }
  navigator.geolocation.getCurrentPosition(function(position) {
    var pos = { lat: position.coords.latitude, lng: position.coords.longitude };
    map.setCenter(pos);
    map.setZoom(17);
    if (userDot) {
      userDot.setPosition(pos);
    } else {
      userDot = new google.maps.Marker({
        position: pos, map: map, clickable: false, zIndex: 500, title: 'You are here',
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285f4', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 }
      });
    }
  }, function() {
    if (window.showToast) showToast('Could not get your location', { type: 'error' });
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

/* Local visit ledger: visits logged on this device, so they are not offered again
   before the sheet catches up. { "<db>:<rowid>": "<ISO date>" }, pruned after 30 days. */
var LEDGER_KEY = 'jowla-local-visits';
function readLedger() {
  try { return JSON.parse(localStorage.getItem(LEDGER_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function saveLedger(l) { try { localStorage.setItem(LEDGER_KEY, JSON.stringify(l)); } catch (e) {} }
function ledgerKey(s) { return s.db + ':' + s.rowid; }
function mergeLedger(loc, ledger) {
  var k = ledgerKey(loc), iso = ledger[k];
  if (!iso) return;
  var ms = Date.parse(iso), sheetMs = Date.parse(loc.visitdate);
  if (isNaN(ms) || Date.now() - ms > 30 * 864e5 || (!isNaN(sheetMs) && sheetMs >= ms - 864e5)) { delete ledger[k]; return; }
  loc.visitdate = new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
window.ledgerRecord = function (stop, on) {
  if (!stop || stop.rowid == null) return;
  var l = readLedger(), k = ledgerKey(stop);
  var loc = (window.locations || []).find(function (x) { return ledgerKey(x) === k; });
  if (on) {
    l[k] = new Date().toISOString();
    if (loc && loc._prevVisit === undefined) loc._prevVisit = loc.visitdate || '';
    if (loc) loc.visitdate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } else {
    delete l[k];
    if (loc && loc._prevVisit !== undefined) { loc.visitdate = loc._prevVisit; loc._prevVisit = undefined; }
  }
  saveLedger(l);
};

function initialiseMap() {
  $.urlParam = function(name){
    var results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(window.location.href);
    if (results == null) return null;
    return results[1] || 0;
  };

  var VIEW_KEY = 'jowla-last-view';
  var view = null;
  try { view = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null'); } catch (e) {}
  var mapOptions = {
    zoom: (view && view.zoom) || 16, center: (view && view.center) || frisco,
    gestureHandling: 'greedy', clickableIcons: false,
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false, cameraControl: !window.matchMedia('(pointer: coarse)').matches,
    cameraControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM },
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER }
  };
  map = new google.maps.Map(document.getElementById('map'), mapOptions);
  map.addListener('idle', function() {
    var c = map.getCenter();
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ center: { lat: c.lat(), lng: c.lng() }, zoom: map.getZoom() })); } catch (e) {}
  });

  document.getElementById('locate-fab').addEventListener('click', locateUser);
  var cf = document.getElementById('cluster-fab');
  if (cf) cf.addEventListener('click', function() { if (window.suggestClusters) suggestClusters(); });
  var ff = document.getElementById('filter-fab');
  if (ff) ff.addEventListener('click', openFilterSheet);

  var SHEET_URL = "https://sheets.googleapis.com/v4/spreadsheets/1U7JJDnTvClhdpHCje29uLwTNCiBhdPfUPxzChbxoXNQ/values/DFWDB!A2:V?key=AIzaSyBWKjSZa8wcaEEqUrjk-opBhmEVxd6GbPQ";

  function onData(data) {
    var ledger = readLedger();
    locations = [];
    $(data.values).each(function() {
      var location = {};
      location.db = this[0];
      location.id = this[2];
      location.name = this[3];
      location.address = this[4];
      location.add = encodeURIComponent(this[4]);
      location.latitude = parseFloat(this[5]);
      location.longtitude = parseFloat(this[6]);
      location.city = this[7];
      location.zip = this[8];
      location.unit = this[11];
      location.marker = this[12];
      location.sts = this[13];
      location.visitcode = this[14];
      location.comments = this[15];
      location.visitdate = this[16];
      location.rowid = this[21];
      if (isDoNotVisit(location)) return;
      mergeLedger(location, ledger);
      locations.push(location);
    });
    saveLedger(ledger);
    console.log('locations size (after DNV filter) ' + locations.length);
    if (window.hideToast) hideToast();
    if (!navigator.onLine && window.showToast) showToast('Offline — showing saved data');

    applyUrlFilters();
    if (typeof addOptimizeControl === 'function') {
      addOptimizeControl(map);
    }
  }

  function loadData() {
    if (window.showToast) showToast('Loading stops…', { sticky: true });
    $.getJSON(SHEET_URL).done(onData).fail(function() {
      if (window.showToast) showToast('Could not load stops', { type: 'error', sticky: true, action: { label: 'Retry', onClick: loadData } });
    });
  }
  loadData();
}

function parseCityParam(raw) {
  if (!raw || raw === 'null') return null;
  try {
    var decoded = decodeURIComponent(raw);
    // Handles City===%27Princeton%27 or City=='Princeton' or City=Princeton
    decoded = decoded.replace(/^=+/, '').replace(/^'+|'+$/g, '').trim();
    return decoded || null;
  } catch (e) {
    return raw;
  }
}

function matchesFilters(loc, f) {
  var now = new Date();
  if (f.city && loc.city !== f.city) return false;
  if (f.status) {
    var s = (loc.sts || '').toLowerCase();
    if (f.status === 'S' && s.indexOf('student') === -1) return false;
    if (f.status === 'K' && s.indexOf('khususi') === -1) return false;
    if (f.status === 'F' && s.indexOf('follow') === -1) return false;
    if (f.status === 'W' && s.indexOf('week') === -1) return false;
  }
  if (f.name && !(loc.name || '').toLowerCase().includes(f.name.toLowerCase())) return false;
  if (f.visited) {
    // Never-visited (or unparseable date) counts as "not visited in the last N days".
    var visit = loc.visitdate ? new Date(loc.visitdate) : null;
    if (visit && !isNaN(visit.getTime())) {
      var days = (now - visit) / (1000 * 60 * 60 * 24);
      if (f.visited === '0') return false;
      if (f.visited === '1' && days < 30) return false;
      if (f.visited === '3' && days < 90) return false;
      if (f.visited === '6' && days < 180) return false;
    }
  }
  return true;
}

var currentFilters = { city: '', status: '', name: '', visited: '' };

function applyUrlFilters() {
  var city = parseCityParam($.urlParam('City'));
  var stts = $.urlParam('S');
  var searchname = $.urlParam('F');
  var visited = $.urlParam('P');
  if (searchname) {
    try { searchname = decodeURIComponent(searchname); } catch(e) {}
  }
  var clean = function(v) { return (!v || v === 'null' || v === 'All' || v === 'Search') ? '' : v; };
  applyFilters({ city: clean(city), status: clean(stts), name: clean(searchname), visited: clean(visited) });
}

/** f = {city, status, name, visited}; empty string means "no filter". */
function applyFilters(f) {
  currentFilters = f;
  visibleLocations = locations.filter(function(loc) { return matchesFilters(loc, f); });

  window.visibleLocations = visibleLocations;
  clearMarkers();
  setLocations(map, visibleLocations);
}

/* ---- In-map filter sheet ---- */
function filtersToQuery(f) {
  var params = [];
  if (f.city) params.push('City===' + encodeURIComponent("'" + f.city + "'"));
  if (f.status) params.push('S=' + f.status);
  params.push('F=' + encodeURIComponent(f.name || 'Search'));
  if (f.visited) params.push('P=' + f.visited);
  return '?' + params.join('&');
}

function countMatches(f) {
  return locations.filter(function(loc) { return matchesFilters(loc, f); }).length;
}

function ensureFilterSheet() {
  var el = document.getElementById('filter-sheet');
  if (el) return el;
  var cities = {};
  locations.forEach(function(l) { if (l.city) cities[l.city] = true; });
  var cityOpts = '<option value="">All</option>' + Object.keys(cities).sort().map(function(c) {
    return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
  }).join('');
  el = document.createElement('div');
  el.id = 'filter-sheet';
  el.innerHTML =
    '<div class="fs-head"><strong>Filters</strong><button type="button" id="fs-close" aria-label="Close">&times;</button></div>' +
    '<label>City<select id="fs-city">' + cityOpts + '</select></label>' +
    '<label>Status<select id="fs-status"><option value="">All</option><option value="S">Students</option><option value="K">Khususi</option><option value="F">Follow Ups</option><option value="W">3D</option></select></label>' +
    '<label>Visited<select id="fs-visited"><option value="">All</option><option value="0">Not Yet Visited</option><option value="6">More than 180 days</option><option value="3">More than 90 days</option><option value="1">More than 30 days</option></select></label>' +
    '<label>Name contains<input id="fs-name" type="text" placeholder="leave blank for all"></label>' +
    '<div class="fs-count" id="fs-count"></div>' +
    '<div class="fs-btns"><button type="button" id="fs-reset" class="fs-alt">Reset</button><button type="button" id="fs-apply">Apply</button></div>';
  document.body.appendChild(el);

  var read = function() {
    return {
      city: document.getElementById('fs-city').value,
      status: document.getElementById('fs-status').value,
      visited: document.getElementById('fs-visited').value,
      name: document.getElementById('fs-name').value.trim()
    };
  };
  var updateCount = function() {
    document.getElementById('fs-count').textContent = countMatches(read()) + ' stops match';
  };
  ['fs-city', 'fs-status', 'fs-visited'].forEach(function(id) { document.getElementById(id).addEventListener('change', updateCount); });
  document.getElementById('fs-name').addEventListener('input', updateCount);
  document.getElementById('fs-close').addEventListener('click', closeFilterSheet);
  document.getElementById('fs-reset').addEventListener('click', function() {
    fillFilterSheet({ city: '', status: '', name: '', visited: '' });
    updateCount();
  });
  document.getElementById('fs-apply').addEventListener('click', function() {
    var f = read();
    if (window.clearRoute) clearRoute();
    applyFilters(f);
    try { history.replaceState(null, '', location.pathname + filtersToQuery(f)); } catch (e) {}
    try {
      localStorage.setItem('jowla-filters', JSON.stringify({
        myCity: f.city || 'All', myStatus: f.status || 'All', myVisited: f.visited || 'All', search: f.name
      }));
    } catch (e) {}
    closeFilterSheet();
    if (window.showToast) showToast('Filters applied: ' + visibleLocations.length + ' stops');
  });
  el._updateCount = updateCount;
  return el;
}

function fillFilterSheet(f) {
  document.getElementById('fs-city').value = f.city;
  document.getElementById('fs-status').value = f.status;
  document.getElementById('fs-visited').value = f.visited;
  document.getElementById('fs-name').value = f.name;
}

function openFilterSheet() {
  var el = ensureFilterSheet();
  fillFilterSheet(currentFilters);
  el._updateCount();
  el.classList.add('open');
}
function closeFilterSheet() {
  var el = document.getElementById('filter-sheet');
  if (el) el.classList.remove('open');
}

function clearMarkers() {
  markers.forEach(function(m) { m.setMap(null); });
  markers = [];
}

function setLocations(map, locs) {
  var bounds = new google.maps.LatLngBounds();
  var infowindow = new google.maps.InfoWindow({ content: "Content String", maxWidth: Math.min(320, window.innerWidth - 48), headerDisabled: true });
  window.__iw = infowindow;
  var count = 0;
  for (var i = 0; i < locs.length; i++) {
    if (!locs[i].latitude || !locs[i].longtitude) continue;
    var new_marker = createMarker(map, locs[i], infowindow);
    markers.push(new_marker);
    bounds.extend(new_marker.position);
    count++;
  }
  google.maps.event.trigger(map, "resize");
  if (count > 1 && count < 2000) {
    map.fitBounds(bounds);
  }
}

function createMarker(map, location, infowindow) {
  var position = { lat: parseFloat(location.latitude), lng: parseFloat(location.longtitude) };
  var markerurl = "https://maps.google.com/mapfiles/kml/paddle/" + location.marker + ".png";
  var marker = new google.maps.Marker({
    position: position,
    map: map,
    title: location.name,
    icon: { url: markerurl, scaledSize: new google.maps.Size(40, 40) }
  });
  google.maps.event.addListener(marker, 'click', function() {
    window.__popupLoc = location;
    var e = escapeHtml;
    var nb = navButtons(location.latitude, location.longtitude);
    var detailsUrl = visitDetailsUrl(location);
    infowindow.setContent('<div class="iw">' +
      '<button type="button" class="iw-close" aria-label="Close" onclick="window.__iw && window.__iw.close()">&times;</button>' +
      (location.name ? '<div class="iw-name">' + e(location.name) + '</div>' : '') +
      (location.address ? '<p>' + e(location.address) + '</p>' : '') +
      (location.comments ? '<p><strong>Comments:</strong> ' + e(location.comments) + '</p>' : '') +
      (location.visitdate ? '<p><strong>Last visit:</strong> ' + e(location.visitdate) + '</p>' : '') +
      '<a class="iw-btn" href="' + e(nb.primary.url) + '" target="_blank" rel="noopener">Navigate (' + nb.primary.label + ')</a>' +
      '<a class="iw-btn alt" href="' + e(detailsUrl) + '" target="_blank" rel="noopener" onclick="if(window.markRouteStopDone){markRouteStopDone(window.__popupLoc);}">Visit Details</a>' +
      '</div>');
    infowindow.open(map, marker);
  });
  return marker;
}
