/** Navigation URL segment builders (Google + Apple). No DOM; unit-tested in tests/segments.test.js. */
(function (root) {
  var MAX_GM_WAYPOINTS = 9;   // Google URL limit: 9 intermediates + destination
  var MAX_APPLE_POINTS = 15;  // practical Apple Maps limit per link

  function pts(stops) {
    var out = [];
    stops.forEach(function (s) {
      var p = { lat: s.latitude, lng: s.longtitude };
      var prev = out[out.length - 1];
      if (prev && prev.lat === p.lat && prev.lng === p.lng) return; // never repeat a point back to back
      out.push(p);
    });
    return out;
  }
  function chunk(points, size) {
    var chunks = [];
    for (var i = 0; i < points.length; i += size) chunks.push({ from: i, pts: points.slice(i, i + size) });
    return chunks;
  }
  function label(c, total) {
    return 'Stops ' + (c.from + 1) + '–' + (c.from + c.pts.length) + (c.from + c.pts.length === total ? '' : '');
  }
  function ll(p) { return p.lat + ',' + p.lng; }

  /** Segment 1 starts at `start`; later segments omit the origin so the app uses "Your location"
   *  (the user is at the end of the previous segment). Each point appears exactly once. */
  function buildGoogleMapsSegments(stops, start, modeText) {
    var points = pts(stops), mode = modeText === 'walking' ? 'walking' : 'driving';
    return chunk(points, MAX_GM_WAYPOINTS + 1).map(function (c, idx) {
      var dest = c.pts[c.pts.length - 1], way = c.pts.slice(0, -1);
      var url = 'https://www.google.com/maps/dir/?api=1&destination=' + ll(dest) + '&travelmode=' + mode;
      // Later segments start where the previous one ended; an explicit origin avoids the app waiting on "Your location".
      var origin = idx === 0 ? start : points[c.from - 1];
      if (origin) url += '&origin=' + ll(origin);
      // Raw lat,lng joined by '|' (encoding the comma made the Google Maps app hang on "Loading...").
      if (way.length) url += '&waypoints=' + way.map(ll).join('|');
      return { url: url, label: label(c, points.length), stopCount: c.pts.length };
    });
  }

  function buildAppleMapsSegments(stops, start, modeText) {
    var points = pts(stops), mode = modeText === 'walking' ? 'walking' : 'driving';
    return chunk(points, MAX_APPLE_POINTS).map(function (c, idx) {
      var dest = c.pts[c.pts.length - 1];
      var url = 'https://maps.apple.com/directions?destination=' + ll(dest) + '&mode=' + mode;
      if (idx === 0 && start) url += '&source=' + ll(start);
      c.pts.slice(0, -1).forEach(function (p) { url += '&waypoint=' + ll(p); });
      return { url: url, label: label(c, points.length), stopCount: c.pts.length };
    });
  }

  var api = { buildGoogleMapsSegments: buildGoogleMapsSegments, buildAppleMapsSegments: buildAppleMapsSegments };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.buildGoogleMapsSegments = buildGoogleMapsSegments; root.buildAppleMapsSegments = buildAppleMapsSegments; }
})(typeof window !== 'undefined' ? window : this);
