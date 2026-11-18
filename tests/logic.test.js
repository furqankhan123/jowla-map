/* Unit tests for logic.js. Synthetic data only (no real names, addresses or coordinates). */
const assert = require('assert');
const L = require('../logic.js');

const DAY = 864e5;
const NOW = Date.UTC(2030, 5, 15);
const row = (o) => Object.assign({ city: 'Testville', _name: 'alpha one', _sts: 'student', _visitMs: null }, o);

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

console.log('logic ok');
