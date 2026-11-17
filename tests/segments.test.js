const assert = require('assert');
const { buildGoogleMapsSegments: G, buildAppleMapsSegments: A } = require('../segments.js');
const start = { lat: 1, lng: 1 };
const mk = (n) => Array.from({ length: n }, (_, i) => ({ latitude: 10 + i, longtitude: 20 + i }));
function points(url, app) {
  const q = new URL(url).searchParams, out = [];
  if (app === 'g') {
    (q.get('waypoints') || '').split('|').filter(Boolean).forEach((p) => out.push(p));
    out.push(q.get('destination'));
  } else {
    q.getAll('waypoint').forEach((p) => out.push(p)); out.push(q.get('destination'));
  }
  return out;
}
for (const n of [1, 2, 10, 11, 15, 16, 30, 31, 46]) {
  const stops = mk(n);
  for (const [name, fn, app, cap] of [['google', G, 'g', 10], ['apple', A, 'a', 15]]) {
    const segs = fn(stops, start, 'driving');
    const all = segs.flatMap((s) => points(s.url, app));
    assert.strictEqual(all.length, n, `${name} ${n}: each point once`);
    assert.strictEqual(new Set(all).size, n, `${name} ${n}: no repeats`);
    assert.strictEqual(all[all.length - 1], `${10 + n - 1},${20 + n - 1}`, `${name} ${n}: ends at last point`);
    segs.forEach((s) => assert(points(s.url, app).length <= cap, `${name} ${n}: cap`));
    if (app === 'a') segs.slice(1).forEach((s) => assert(!/source=/.test(s.url), 'apple: later segments omit source'));
    else segs.slice(1).forEach((s, i) => assert(new URL(s.url).searchParams.get('origin') === points(segs[i].url, 'g').pop(), 'google: origin = previous destination'));
    assert(/origin=|source=/.test(segs[0].url));
    segs.forEach((s) => assert(!/%2C|%7C/i.test(s.url), `${name}: no encoded separators`));
  }
}
// end point equal to the previous point is not repeated
const dup = mk(3).concat([{ latitude: 12, longtitude: 22 }]);
assert.strictEqual(points(G(dup, start, 'walking')[0].url, 'g').length, 3);
console.log('segments ok');
