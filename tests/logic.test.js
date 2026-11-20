/* Unit tests for logic.js. Synthetic data only (no real names, addresses or coordinates). */
const assert = require('assert');
const L = require('../logic.js');

const DAY = 864e5;
const NOW = Date.UTC(2030, 5, 15);
const row = (o) => Object.assign({ city: 'Testville', _name: 'alpha one', _sts: 'student', _visitMs: null }, o);

// --- mergeColumnRanges: rebuild rows from column-limited batchGet ranges
const merged = L.mergeColumnRanges([
  { values: [['a0'], ['b0']] },
  { values: [['c', 'd'], ['e']] },
  { values: [['l'], []] },
  { values: [[], ['v1']] }
], [0, 2, 11, 21]);
assert.strictEqual(merged.length, 2);
assert.strictEqual(merged[0][0], 'a0');
assert.strictEqual(merged[0][3], 'd');
assert.strictEqual(merged[0][11], 'l');
assert.strictEqual(merged[1][2], 'e');
assert.strictEqual(merged[1][21], 'v1');
assert.strictEqual(merged[0][1], undefined);
assert.deepStrictEqual(L.mergeColumnRanges(null, []), []);

// --- parseCityParam: old and new URL formats
assert.strictEqual(L.parseCityParam(null), null);
assert.strictEqual(L.parseCityParam('null'), null);
assert.strictEqual(L.parseCityParam('Testville'), 'Testville');
assert.strictEqual(L.parseCityParam("%3D%3D%27Testville%27"), 'Testville');
assert.strictEqual(L.parseCityParam("=%27Test%20Town%27"), 'Test Town');

// --- filtersToQuery
assert.strictEqual(L.filtersToQuery({ city: '', status: '', name: '', visited: '' }), '?F=Search');
assert.strictEqual(
  L.filtersToQuery({ city: 'Testville', status: 'S', name: 'al', visited: '3' }),
  "?City===" + encodeURIComponent("'Testville'") + '&S=S&F=al&P=3'
);

// --- matchesFilters
const F0 = { city: '', status: '', name: '', visited: '' };
assert.ok(L.matchesFilters(row(), F0, NOW));
assert.ok(!L.matchesFilters(row(), Object.assign({}, F0, { city: 'Elsewhere' }), NOW));
assert.ok(L.matchesFilters(row(), Object.assign({}, F0, { status: 'S' }), NOW));
assert.ok(!L.matchesFilters(row(), Object.assign({}, F0, { status: 'K' }), NOW));
assert.ok(L.matchesFilters(row(), Object.assign({}, F0, { name: 'ALPHA' }), NOW));
assert.ok(!L.matchesFilters(row(), Object.assign({}, F0, { name: 'zzz' }), NOW));

// Visited filter: never-visited counts as "not visited in the last N days" (plan 6.8)
const never = row({ _visitMs: null });
const recent = row({ _visitMs: NOW - 10 * DAY });
const mid = row({ _visitMs: NOW - 100 * DAY });
const old = row({ _visitMs: NOW - 200 * DAY });
const V = (v) => Object.assign({}, F0, { visited: v });
assert.ok(L.matchesFilters(never, V('0'), NOW));
assert.ok(!L.matchesFilters(recent, V('0'), NOW));
['1', '3', '6'].forEach((v) => assert.ok(L.matchesFilters(never, V(v), NOW), 'never visited passes ' + v));
assert.ok(!L.matchesFilters(recent, V('1'), NOW));
assert.ok(L.matchesFilters(mid, V('1'), NOW) && L.matchesFilters(mid, V('3'), NOW) && !L.matchesFilters(mid, V('6'), NOW));
assert.ok(L.matchesFilters(old, V('6'), NOW));
// counts: "More than 30 days" >= "Not yet visited"
const set = [never, recent, mid, old];
const count = (v) => set.filter((r) => L.matchesFilters(r, V(v), NOW)).length;
assert.ok(count('1') >= count('0'));

// --- haversine
assert.ok(Math.abs(L.haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111.19) < 0.1);
assert.strictEqual(L.haversine({ lat: 5, lng: 5 }, { lat: 5, lng: 5 }), 0);

// --- computeEtas (plan 6.4): progress aware
const stops = [{ done: true }, { done: false }, { done: false }];
const legs = [60, 120, 180, 240]; // 3 stops + end leg
const e = L.computeEtas(stops, legs, 0, 3);
assert.strictEqual(e.etas[0], null);
assert.strictEqual(e.etas[1], 120 * 1000);
assert.strictEqual(e.etas[2], (120 + 180) * 1000 + 3 * 60000);
assert.strictEqual(e.endEta, (120 + 180 + 240) * 1000 + 2 * 3 * 60000);
const none = L.computeEtas([{ done: false }], [], 0, 3);
assert.strictEqual(none.etas[0], null);
assert.strictEqual(none.endEta, null);

// --- estimateTourMins (plan 6.11)
const start = { lat: 10, lng: 10 };
const near = [{ latitude: 10.001, longtitude: 10 }, { latitude: 10.002, longtitude: 10 }];
const far = [{ latitude: 10.2, longtitude: 10 }, { latitude: 10.4, longtitude: 10 }];
const tNear = L.estimateTourMins(start, near, 'WALK', 3);
assert.ok(tNear > 12 && tNear < 16, 'near walking tour ~ visits + a few minutes, got ' + tNear);
assert.ok(L.estimateTourMins(start, far, 'WALK', 3) > L.estimateTourMins(start, far, 'DRIVE', 3));
assert.ok(L.estimateTourMins(start, near.concat(far), 'DRIVE', 3) > L.estimateTourMins(start, near, 'DRIVE', 3));

// --- findClusters: a dense group and scattered points
const dense = [];
for (let i = 0; i < 6; i++) dense.push({ latitude: 20 + i * 0.0005, longtitude: 30 });
const scattered = [{ latitude: 21, longtitude: 31 }, { latitude: 22, longtitude: 32 }, { latitude: 23, longtitude: 33 }];
const cl = L.findClusters(dense.concat(scattered), 0.4, 4);
assert.strictEqual(cl.length, 1);
assert.strictEqual(cl[0].count, 6);
assert.deepStrictEqual(L.findClusters(scattered, 0.4, 4), []);
assert.deepStrictEqual(L.findClusters(dense.slice(0, 3), 0.4, 4), []);

// --- pickTravelMode (plan 6.19): spacing, not distance from start
const tight = [];
for (let i = 0; i < 8; i++) tight.push({ latitude: 40 + i * 0.0006, longtitude: 50 });
const spread = [];
for (let i = 0; i < 8; i++) spread.push({ latitude: 40 + i * 0.01, longtitude: 50 });
assert.strictEqual(L.pickTravelMode(tight), 'WALK');
assert.strictEqual(L.pickTravelMode(spread), 'DRIVE');
assert.strictEqual(L.pickTravelMode(tight, 'DRIVE'), 'DRIVE');
assert.strictEqual(L.pickTravelMode(spread, 'WALK'), 'WALK');
assert.strictEqual(L.pickTravelMode(tight, 'auto'), 'WALK');
assert.strictEqual(L.pickTravelMode([tight[0]]), 'DRIVE');

console.log('logic ok');

// --- isAutoVisit
assert.strictEqual(L.isAutoVisit({ visitcode: '[auto] comment update', comments: '[auto]: maybe rental' }), true);
assert.strictEqual(L.isAutoVisit({ visitcode: '[auto] comment update', comments: '[auto]: maybe rental. Dog at home' }), false);
assert.strictEqual(L.isAutoVisit({ visitcode: 'No Response', comments: '' }), false);
console.log('isAutoVisit ok');

// --- bestStopSet: a far dense block beats a few scattered near stops
(function () {
  const start = { lat: 40, lng: -100 };
  const near = [0, 1, 2].map((i) => ({ latitude: 40 + 0.004 * (i + 1), longtitude: -100 + 0.012 * i }));
  const block = []; for (let i = 0; i < 12; i++) block.push({ latitude: 40.03 + 0.0004 * (i % 4), longtitude: -100.0 + 0.0004 * Math.floor(i / 4) });
  const r = L.bestStopSet(start, near.concat(block), 'DRIVE', 60, 15);
  assert.ok(r.label.indexOf('Best block') === 0, r.label);
  assert.ok(r.stops.length >= 10);
  const only = L.bestStopSet(start, near, 'DRIVE', 60, 15);
  assert.strictEqual(only.label, 'Nearest');
  console.log('bestStopSet ok');
})();

// --- turn detector / street sweep (synthetic geometry)
(function () {
  const P = (lat, lng) => ({ lat, lng });
  // Known encoded polyline from Google docs: (38.5,-120.2),(40.7,-120.95),(43.252,-126.453)
  const dec = L.decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.strictEqual(dec.length, 3);
  assert.ok(Math.abs(dec[0].lat - 38.5) < 1e-5 && Math.abs(dec[2].lng + 126.453) < 1e-5);
  // straight north then reverse = 1 U-turn
  assert.deepStrictEqual(L.countTurns([P(40, -100), P(40.001, -100), P(40, -100)]), { uturns: 1, lefts: 0 });
  // north then west = left turn; north then east = right turn (not counted)
  assert.deepStrictEqual(L.countTurns([P(40, -100), P(40.001, -100), P(40.001, -100.001)]), { uturns: 0, lefts: 1 });
  assert.deepStrictEqual(L.countTurns([P(40, -100), P(40.001, -100), P(40.001, -99.999)]), { uturns: 0, lefts: 0 });
  assert.strictEqual(L.streetKey('123 Main St, Testville'), 'main st');
  assert.strictEqual(L.streetKey('45B Oak Ave Apt 3, Town'), 'oak ave');
  assert.strictEqual(L.addressLine1('123 Main St, Testville'), '123 Main St');
  assert.strictEqual(L.addressLine1(null), '');
  // sweep: two streets, stops interleaved in the input -> grouped per street, monotone along each
  const mk = (n, a, lat, lng) => ({ name: n, address: a, latitude: lat, longtitude: lng });
  const stops = [mk('a1', '1 Oak Ave, T', 40.000, -100), mk('b1', '2 Elm St, T', 40.000, -100.01), mk('a3', '5 Oak Ave, T', 40.002, -100), mk('b2', '4 Elm St, T', 40.002, -100.01), mk('a2', '3 Oak Ave, T', 40.001, -100), mk('b3', '6 Elm St, T', 40.001, -100.01)];
  const sw = L.streetSweepOrder({ lat: 39.999, lng: -100 }, stops).map((s) => s.name);
  assert.deepStrictEqual(sw, ['a1', 'a2', 'a3', 'b2', 'b3', 'b1']);
  console.log('turns/sweep ok');
})();
