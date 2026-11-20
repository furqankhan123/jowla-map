var map;
var locations = [];
var visibleLocations = [];
var markers = [];
var frisco = {lat: 33.0597, lng: -96.7512};

/** Cached lowercase/parsed fields so filter passes do no string/date work per row. */
function setVisitMs(loc) {
  var t = loc.visitdate ? new Date(loc.visitdate).getTime() : NaN;
  // A visit logged on this device (ledger) is real even if the sheet row still carries the auto tag.
  loc._auto = !loc._localVisit && !!(window.isAutoVisit && window.isAutoVisit(loc));
  loc._visitMs = (isNaN(t) || loc._auto) ? null : t;
}
function prepRow(loc) {
  loc._name = (loc.name || '').toLowerCase();
  loc._sts = (loc.sts || '').toLowerCase();
  setVisitMs(loc);
}
window.setVisitMs = setVisitMs;

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

/** Round "dot" Advanced Marker (user location, route start, numbered stops). */
function makeDotMarker(map, pos, o) {
  var d = document.createElement('div');
  var size = o.size || 22;
  d.style.cssText = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;box-sizing:border-box;border:' + (o.border || 2) + 'px solid #fff;' +
    'background:' + o.color + ';color:#fff;font:bold 12px/1 sans-serif;display:flex;align-items:center;justify-content:center;' +
    'box-shadow:0 1px 3px rgba(0,0,0,.45);transform:translateY(50%);';
  if (o.text != null) d.textContent = o.text;
  return new google.maps.marker.AdvancedMarkerElement({
    map: map, position: pos, content: d, zIndex: o.zIndex, title: o.title || '', gmpClickable: false
  });
}
window.makeDotMarker = makeDotMarker;

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
      userDot.position = pos;
    } else {
      userDot = makeDotMarker(map, pos, { color: '#4285f4', size: 18, border: 3, zIndex: 500, title: 'You are here' });
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
  loc._localVisit = true;
}
window.ledgerRecord = function (stop, on) {
  if (!stop || stop.rowid == null) return;
  var l = readLedger(), k = ledgerKey(stop);
  var loc = (window.locations || []).find(function (x) { return ledgerKey(x) === k; });
  if (on) {
    l[k] = new Date().toISOString();
    if (loc && loc._prevVisit === undefined) loc._prevVisit = loc.visitdate || '';
    if (loc) { loc.visitdate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); loc._localVisit = true; }
  } else {
    delete l[k];
    if (loc && loc._prevVisit !== undefined) { loc.visitdate = loc._prevVisit; loc._prevVisit = undefined; }
    if (loc) loc._localVisit = false;
  }
  if (loc) setVisitMs(loc);
  saveLedger(l);
};

function initialiseMap() {
  function urlParam(name) {
    var results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(window.location.href);
    if (results == null) return null;
    return results[1] || 0;
  }
  window.urlParam = urlParam;

  var VIEW_KEY = 'jowla-last-view';
  var view = null;
  try { view = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null'); } catch (e) {}
  var mapOptions = {
    mapId: window.JOWLA_CONFIG.mapId, zoom: (view && view.zoom >= 6 && view.zoom) || 16, center: (view && view.zoom >= 6 && view.center) || frisco,
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

  var C = window.JOWLA_CONFIG;
  var SHEET_URL = 'https://sheets.googleapis.com/v4/spreadsheets/' + C.sheetId + '/values:batchGet?majorDimension=ROWS&' +
    C.sheetRanges.map(function(r) { return 'ranges=' + encodeURIComponent(r); }).join('&') + '&key=' + C.sheetsKey;

  var lastLoad = 0;
  var controlsReady = false;
  function initControls() {
    if (controlsReady) return;
    controlsReady = true;
    if (typeof addOptimizeControl === 'function') addOptimizeControl(map);
  }
  function fetchSheet() {
    return fetch(SHEET_URL).then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(d) { return { values: mergeColumnRanges(d.valueRanges, C.sheetRangeStarts) }; });
  }
  function onData(data, isRefresh) {
    var ledger = readLedger();
    locations = [];
    (data.values || []).forEach(function(row) {
      var location = {};
      location.db = row[0];
      location.id = row[2];
      location.name = row[3];
      location.address = row[4];
      location.add = encodeURIComponent(row[4]);
      location.latitude = parseFloat(row[5]);
      location.longtitude = parseFloat(row[6]);
      location.city = row[7];
      location.zip = row[8];
      location.unit = row[11];
      location.marker = row[12];
      location.sts = row[13];
      location.visitcode = row[14];
      location.comments = row[15];
      location.visitdate = row[16];
      location.rowid = row[21];
      if (isDoNotVisit(location)) return;
      mergeLedger(location, ledger);
      prepRow(location);
      locations.push(location);
    });
    saveLedger(ledger);
    console.log('locations size (after DNV filter) ' + locations.length);
    var tEl = document.getElementById('toast');
    if (window.hideToast && tEl && tEl.textContent === 'Loading stops…') hideToast();
    if (!navigator.onLine && window.showToast) showToast('Offline — showing saved data');

    lastLoad = Date.now();
    if (isRefresh) {
      applyFilters(currentFilters, true);
      return;
    }
    applyUrlFilters();
    initControls();
  }

  /** Re-fetch the sheet, merge the local ledger, re-apply current filters; route and viewport untouched. */
  window.refreshData = function(silent) {
    if (!navigator.onLine) { if (!silent && window.showToast) showToast('Offline: cannot refresh', { type: 'error' }); return; }
    fetchSheet().then(function(data) {
      onData(data, true);
      if (!silent && window.showToast) showToast('Data refreshed: ' + locations.length + ' stops');
    }).catch(function() {
      if (!silent && window.showToast) showToast('Refresh failed', { type: 'error' });
    });
  };
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && lastLoad && Date.now() - lastLoad > 30 * 60 * 1000) window.refreshData(true);
  });

  function loadData(retried) {
    if (window.showToast) showToast('Loading stops…', { sticky: true });
    fetchSheet().then(function(d) { onData(d); }).catch(function(err) {
      console.warn('Stop load failed:', err && err.message);
      if (retried !== true) { setTimeout(function() { loadData(true); }, 1500); return; } // one silent retry
      initControls(); // still restore the saved route and its list without stop data
      if (window.showToast) showToast('Could not load stops', { type: 'error', sticky: true, action: { label: 'Retry', onClick: function() { loadData(true); } } });
    });
  }
  loadData();
}



var currentFilters = { city: '', status: '', name: '', visited: '' };

function applyUrlFilters() {
  var city = parseCityParam(urlParam('City'));
  var stts = urlParam('S');
  var searchname = urlParam('F');
  var visited = urlParam('P');
  if (searchname) {
    try { searchname = decodeURIComponent(searchname); } catch(e) {}
  }
  var clean = function(v) { return (!v || v === 'null' || v === 'All' || v === 'Search') ? '' : v; };
  applyFilters({ city: clean(city), status: clean(stts), name: clean(searchname), visited: clean(visited) });
}

/** f = {city, status, name, visited}; empty string means "no filter". */
function applyFilters(f, keepView) {
  currentFilters = f;
  visibleLocations = locations.filter(function(loc) { return matchesFilters(loc, f); });

  window.visibleLocations = visibleLocations;
  clearMarkers();
  setLocations(map, visibleLocations, keepView);
}

/* ---- In-map filter sheet ---- */

function countMatches(f) {
  return locations.filter(function(loc) { return matchesFilters(loc, f); }).length;
}

function ensureFilterSheet() {
  var el = document.getElementById('filter-sheet');
  if (el) return el;
  var cities = {};
  locations.forEach(function(l) { if (l.city) cities[l.city] = true; });
  var cityList = Object.keys(cities).sort();
  var cityByLower = {};
  cityList.forEach(function(c) { cityByLower[c.toLowerCase()] = c; });
  var cityOpts = cityList.map(function(c) { return '<option value="' + escapeHtml(c) + '"></option>'; }).join('');
  el = document.createElement('div');
  el.id = 'filter-sheet';
  el.innerHTML =
    '<div class="fs-head"><strong>Filters</strong><button type="button" id="fs-close" aria-label="Close">&times;</button></div>' +
    '<label>City<input id="fs-city" type="text" list="fs-city-list" placeholder="All cities (type to search)" autocomplete="off"><datalist id="fs-city-list">' + cityOpts + '</datalist></label>' +
    '<label>Status<select id="fs-status"><option value="">All</option><option value="S">Students</option><option value="K">Khususi</option><option value="F">Follow Ups</option><option value="W">3D</option></select></label>' +
    '<label>Visited<select id="fs-visited"><option value="">All</option><option value="0">Not Yet Visited</option><option value="6">More than 180 days</option><option value="3">More than 90 days</option><option value="1">More than 30 days</option></select></label>' +
    '<label>Name contains<input id="fs-name" type="text" placeholder="leave blank for all"></label>' +
    '<div class="fs-count" id="fs-count"></div>' +
    '<div class="fs-btns"><button type="button" id="fs-reset" class="fs-alt">Reset</button><button type="button" id="fs-apply">Apply</button></div>';
  document.body.appendChild(el);

  var read = function() {
    var c = document.getElementById('fs-city').value.trim();
    return {
      city: c ? (cityByLower[c.toLowerCase()] || c) : '',
      status: document.getElementById('fs-status').value,
      visited: document.getElementById('fs-visited').value,
      name: document.getElementById('fs-name').value.trim()
    };
  };
  var updateCount = function() {
    document.getElementById('fs-count').textContent = countMatches(read()) + ' stops match';
  };
  ['fs-status', 'fs-visited'].forEach(function(id) { document.getElementById(id).addEventListener('change', updateCount); });
  var cntTimer = null;
  var debounced = function() {
    clearTimeout(cntTimer);
    cntTimer = setTimeout(updateCount, 200);
  };
  document.getElementById('fs-name').addEventListener('input', debounced);
  document.getElementById('fs-city').addEventListener('input', debounced);
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

var clusterer = null;
var sharedIw = null;
function ensureClusterer(map) {
  if (!clusterer) {
    var algo = new markerClusterer.SuperClusterViewportAlgorithm({ maxZoom: 17, radius: 60, viewportPadding: 400 });
    // The stock algorithm reports "changed" on ANY pan (its padded pixel view differs), so every idle
    // destroys and recreates all cluster markers, which flickers. Keep the last result until the map has
    // moved more than half the padding, or the zoom or marker set changes.
    var superCalc = algo.calculate.bind(algo);
    var last = null;
    algo.calculate = function (input) {
      var proj = input.mapCanvasProjection, map = input.map, mk = input.markers;
      var zoom = Math.round(map.getZoom()), c = map.getCenter();
      if (last && proj && last.zoom === zoom && last.n === mk.length && last.first === mk[0] && last.last === mk[mk.length - 1]) {
        var p = proj.fromLatLngToDivPixel(c), q = proj.fromLatLngToDivPixel(last.center);
        if (p && q && Math.abs(p.x - q.x) < 200 && Math.abs(p.y - q.y) < 200) return { clusters: last.clusters, changed: false };
      }
      var res = superCalc(input);
      last = { zoom: zoom, center: c, n: mk.length, first: mk[0], last: mk[mk.length - 1], clusters: res.clusters };
      return res;
    };
    // The base class returns ALL markers unclustered at zoom >= maxZoom (39k DOM nodes). Raise only its
    // check so SuperCluster keeps returning just the viewport's points; its own clustering maxZoom stays 17.
    algo.maxZoom = 22;
    clusterer = new markerClusterer.MarkerClusterer({
      map: map, markers: [],
      algorithm: algo
    });
    // Stock render() removes the previous cluster markers one animation frame after creating the new
    // ones. New advanced markers take longer than that to appear on a phone, so every cluster briefly
    // vanishes (the flicker in the recordings). Same logic, but the old markers are removed ~300ms later,
    // and only if the latest render did not reuse them.
    var MU = markerClusterer.MarkerUtils, EV = markerClusterer.MarkerClustererEvents;
    clusterer.render = function () {
      var m = this.getMap();
      if (!(m instanceof google.maps.Map) || !m.getProjection()) return;
      google.maps.event.trigger(this, EV.CLUSTERING_BEGIN, this);
      var r = this.algorithm.calculate({ markers: this.markers, map: m, mapCanvasProjection: this.getProjection() });
      if (r.changed || r.changed == null) {
        var keep = new Set();
        r.clusters.forEach(function (c) { if (c.markers.length === 1) keep.add(c.markers[0]); });
        var stale = [];
        this.clusters.forEach(function (c) {
          if (c.marker == null) return;
          if (c.markers.length !== 1 || !keep.has(c.marker)) stale.push(c.marker);
        });
        this.clusters = r.clusters;
        this.renderClusters();
        var self = this;
        setTimeout(function () {
          var live = new Set();
          self.clusters.forEach(function (c) { if (c.marker != null) live.add(c.marker); });
          stale.forEach(function (x) { if (!live.has(x)) MU.setMap(x, null); });
        }, 300);
      }
      google.maps.event.trigger(this, EV.CLUSTERING_END, this);
    };
  }
  return clusterer;
}

function clearMarkers() {
  if (clusterer) clusterer.clearMarkers(true);
  markers = [];
}

/** Markers are created once per row (cached on the row) and only added/removed from the clusterer. */
function setLocations(map, locs, keepView) {
  var bounds = new google.maps.LatLngBounds();
  if (!sharedIw) {
    sharedIw = new google.maps.InfoWindow({ maxWidth: Math.min(320, window.innerWidth - 48), headerDisabled: true });
    window.__iw = sharedIw;
  }
  var list = [];
  for (var i = 0; i < locs.length; i++) {
    var loc = locs[i];
    if (!loc.latitude || !loc.longtitude) continue;
    list.push(loc._proxy || (loc._proxy = makeLazyMarker(map, loc)));
    bounds.extend({ lat: loc.latitude, lng: loc.longtitude });
  }
  markers = list;
  if (window.pinsHiddenForRoute && window.pinsHiddenForRoute()) { markers = list; return; } // route shown: keep other pins off
  try { ensureClusterer(map).addMarkers(list); }
  catch (e) { console.warn('Cluster render deferred (map projection not ready):', e && e.message); } // redraws on the next idle
  // Only fit when the set is small: a few mis-geocoded rows (other states/countries) would zoom
  // an "All" view out to the whole world. Large sets keep the saved / default view.
  if (!keepView && list.length > 1 && list.length < 2000) {
    // Fit to the core of the set: a few mis-geocoded rows far away must not zoom out to the whole country.
    var la = locs.filter(function (l) { return l.latitude && l.longtitude; }).map(function (l) { return [+l.latitude, +l.longtitude]; });
    if (la.length > 20) {
      var lats = la.map(function (p) { return p[0]; }).sort(function (a, b) { return a - b; });
      var lngs = la.map(function (p) { return p[1]; }).sort(function (a, b) { return a - b; });
      var lo = Math.floor(la.length * 0.1), hi = Math.ceil(la.length * 0.9) - 1;
      bounds = new google.maps.LatLngBounds({ lat: lats[lo], lng: lngs[lo] }, { lat: lats[hi], lng: lngs[hi] });
    }
    map.fitBounds(bounds);
  }
}

/**
 * Cheap stand-in the clusterer can hold by the tens of thousands. The real AdvancedMarkerElement
 * (DOM node + image) is built only when the clusterer actually puts this point on the map, and
 * kept (detached) afterwards. The clusterer treats non-advanced markers via getPosition/setMap/getVisible.
 */
function makeLazyMarker(map, loc) {
  var pos = null, real = null;
  return {
    getPosition: function() { return pos || (pos = new google.maps.LatLng(+loc.latitude, +loc.longtitude)); },
    getVisible: function() { return true; },
    setMap: function(m) {
      if (m) { if (!real) real = loc._marker = createMarker(m, loc); real.map = m; }
      else if (real) real.map = null;
    }
  };
}

var pinTemplate = null;
function createMarker(map, location) {
  var position = { lat: parseFloat(location.latitude), lng: parseFloat(location.longtitude) };
  if (!pinTemplate) {
    pinTemplate = document.createElement('img');
    pinTemplate.width = 40; pinTemplate.height = 40; pinTemplate.alt = ''; pinTemplate.style.display = 'block';
  }
  var img = pinTemplate.cloneNode(false);
  img.src = "https://maps.google.com/mapfiles/kml/paddle/" + location.marker + ".png";
  img.decoding = 'sync'; // lazy-loaded imgs pop in late when a marker re-enters the view
  var marker = new google.maps.marker.AdvancedMarkerElement({ position: position, content: img, title: location.name || '', gmpClickable: true });
  marker.addEventListener('gmp-click', function() {
    window.__popupLoc = location;
    var e = escapeHtml;
    var nb = navButtons(location.latitude, location.longtitude);
    var detailsUrl = visitDetailsUrl(location);
    sharedIw.setContent('<div class="iw">' +
      '<button type="button" class="iw-close" aria-label="Close" onclick="window.__iw && window.__iw.close()">&times;</button>' +
      (location.name ? '<div class="iw-name">' + e(window.titleCase ? titleCase(location.name) : location.name) + '</div>' + (location._auto ? '<div class="iw-tag" style="color:#5f6368;font-size:12px">maybe rental</div>' : '') : '') +
      (location.address ? '<p>' + e(location.address) + '</p>' : '') +
      // "maybe rental" rows: the comment is only the automation tag and the date is when the script ran, not a visit.
      (location.comments && !location._auto ? '<p><strong>Comments:</strong> ' + e(location.comments) + '</p>' : '') +
      (location.visitdate && !location._auto ? '<p><strong>Last visit:</strong> ' + e(location.visitdate) + '</p>' : '') +
      '<a class="iw-btn" href="' + e(nb.primary.url) + '" target="_blank" rel="noopener">Navigate (' + nb.primary.label + ')</a>' +
      '<a class="iw-btn alt" href="' + e(detailsUrl) + '" target="_blank" rel="noopener" onclick="if(window.markRouteStopDone){markRouteStopDone(window.__popupLoc);}">Visit Details</a>' +
      '</div>');
    sharedIw.open({ map: map, anchor: marker });
  });
  return marker;
}
