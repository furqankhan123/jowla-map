/** Pure logic shared by the app and tests/*.test.js (no DOM, no Google Maps). UMD like segments.js. */
(function (root) {
  var CLUSTER_RADIUS_KM = 0.4;
  var CLUSTER_MIN_STOPS = 4;
  var CLUSTER_MAX_POINTS = 2000;
  var CLUSTER_TOP_N = 5;

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

  function matchesFilters(loc, f, now) {
    now = now || Date.now();
    if (f.city && loc.city !== f.city) return false;
    if (f.status) {
      var s = loc._sts;
      if (f.status === 'S' && s.indexOf('student') === -1) return false;
      if (f.status === 'K' && s.indexOf('khususi') === -1) return false;
      if (f.status === 'F' && s.indexOf('follow') === -1) return false;
      if (f.status === 'W' && s.indexOf('week') === -1) return false;
    }
    if (f.name && loc._name.indexOf(f.name.toLowerCase()) === -1) return false;
    if (f.visited) {
      // Never-visited (or unparseable date) counts as "not visited in the last N days".
      if (loc._visitMs != null) {
        var days = (now - loc._visitMs) / (1000 * 60 * 60 * 24);
        if (f.visited === '0') return false;
        if (f.visited === '1' && days < 30) return false;
        if (f.visited === '3' && days < 90) return false;
        if (f.visited === '6' && days < 180) return false;
      }
    }
    return true;
  }

  /** Automation rows ("[auto] comment update" + "[auto]: maybe rental" tag with no human text) are not real visits. */
  function isAutoVisit(loc) {
    var vc = (loc.visitcode || '').toString().toLowerCase();
    if (vc.indexOf('[auto]') === -1) return false;
    var c = (loc.comments || '').toString().replace(/\[auto\]\s*:?\s*maybe rental\.?/gi, '').replace(/\[auto\][:\s]*/gi, '').trim();
    return c === '';
  }

  function filtersToQuery(f) {
    var params = [];
    if (f.city) params.push('City===' + encodeURIComponent("'" + f.city + "'"));
    if (f.status) params.push('S=' + f.status);
    params.push('F=' + encodeURIComponent(f.name || 'Search'));
    if (f.visited) params.push('P=' + f.visited);
    return '?' + params.join('&');
  }

  /** ETAs from now, starting at the first undone stop; done stops get null. */
  function computeEtas(stops, legSecs, now, visitMins) {
    visitMins = visitMins == null ? 3 : visitMins;
    const etas = []; let t = now; let endEta = null;
    const hasLegs = legSecs && legSecs.length;
    stops.forEach((s, i) => {
      if (s.done) { etas.push(null); return; }
      t += ((legSecs && legSecs[i]) || 0) * 1000;
      etas.push(hasLegs ? t : null);
      t += visitMins * 60 * 1000;
    });
    if (legSecs && legSecs.length > stops.length) endEta = t + (legSecs[stops.length] || 0) * 1000;
    return { etas, endEta };
  }

  /** Rough tour time: nearest-neighbour path from start and back (haversine x 1.3 detour) + visits. */
  function estimateTourMins(start, cands, mode, visitMins) {
    visitMins = visitMins == null ? 3 : visitMins;
    const kmh = mode === 'WALK' ? 4.5 : 30;
    let km = 0, cur = { lat: start.lat, lng: start.lng };
    const left = cands.map((c) => ({ lat: c.latitude, lng: c.longtitude }));
    while (left.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < left.length; i++) {
        const d = haversine(cur, left[i]);
        if (d < bd) { bd = d; bi = i; }
      }
      km += bd; cur = left.splice(bi, 1)[0];
    }
    km += haversine(cur, { lat: start.lat, lng: start.lng });
    return (km * 1.3 / kmh) * 60 + cands.length * visitMins;
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

  /** Travel mode from stop spacing: WALK when the median nearest-neighbour gap is < 250 m and the
      set spans < 1.5 km; `pref` 'WALK' / 'DRIVE' overrides, anything else means auto. */
  function pickTravelMode(cands, pref) {
    if (pref === 'WALK' || pref === 'DRIVE') return pref;
    if (!cands || cands.length < 2) return 'DRIVE';
    var pts = cands.map(function (c) { return { lat: c.latitude, lng: c.longtitude }; });
    var gaps = pts.map(function (p, i) {
      var best = Infinity;
      pts.forEach(function (q, j) { if (i !== j) best = Math.min(best, haversine(p, q)); });
      return best;
    }).sort(function (a, b) { return a - b; });
    var median = gaps[Math.floor(gaps.length / 2)];
    var diameter = 0;
    pts.forEach(function (p, i) { for (var j = i + 1; j < pts.length; j++) diameter = Math.max(diameter, haversine(p, pts[j])); });
    return median < 0.25 && diameter < 1.5 ? 'WALK' : 'DRIVE';
  }

  /** Pick the stop set with the most visits per estimated minute (start -> set -> start).
   *  cands: eligible stops (any order). Seeds are the start and the best clusters; for each seed the nearest
   *  maxStops stops are trimmed to fit targetMins. Returns { stops, label, mins, perHour }. */
  function bestStopSet(start, cands, mode, targetMins, maxStops, visitMins) {
    if (!cands.length) return null;
    var seeds = [{ lat: start.lat, lng: start.lng, label: 'Nearest' }];
    findClusters(cands, 0.4, 4).slice(0, 5).forEach(function (c) {
      seeds.push({ lat: c.centroid.lat, lng: c.centroid.lng, label: 'Best block: ' + c.count + ' stops' });
    });
    var best = null;
    seeds.forEach(function (seed) {
      var set = cands.map(function (c) { return { c: c, d: haversine(seed, { lat: c.latitude, lng: c.longtitude }) }; })
        .sort(function (a, b) { return a.d - b.d; }).slice(0, maxStops).map(function (x) { return x.c; });
      var mins = estimateTourMins(start, set, mode, visitMins);
      while (set.length > 2 && targetMins && mins > targetMins) { set.pop(); mins = estimateTourMins(start, set, mode, visitMins); }
      var perHour = set.length / mins * 60;
      // Require a clear (5%) win over the first (nearest) set so ties stay with Nearest.
      if (!best || perHour > best.perHour * 1.05) best = { stops: set, label: seed.label, mins: Math.round(mins), perHour: perHour };
    });
    return best;
  }

  var api = {
    bestStopSet: bestStopSet,
    isAutoVisit: isAutoVisit, parseCityParam: parseCityParam, matchesFilters: matchesFilters, filtersToQuery: filtersToQuery,
    computeEtas: computeEtas, estimateTourMins: estimateTourMins, haversine: haversine, findClusters: findClusters, pickTravelMode: pickTravelMode
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { Object.keys(api).forEach(function (k) { root[k] = api[k]; }); }
})(typeof window !== 'undefined' ? window : this);
