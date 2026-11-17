# Jowla Map — Optimize Nearby Route Plan

## Goal
Reduce the time spent clicking around the app: find a marker, open it in the nav app, fill the visit details, find the next marker.
Optimize generates an ordered route of nearby unvisited stops (~1 hour, walking in dense clusters), and Visit → Next collapses logging and advancing into one tap, all within the Google Maps free tier.

## Current baseline
- Map lives at `https://dailyfikr.github.io/` (and variants such as `newindex.html`).
- Addresses are loaded from a Google Sheet and shown as markers.
- Clicking a marker opens a single-destination Google Maps link.
- Typical session: ~10 stops.
- Visit time: 1 min if no answer, 3–5 min if someone is home → planning average of **3 minutes** per stop.

## Free-tier notes
- One Directions request with `optimize:true` counts as Directions Advanced.
- Free cap for that SKU is ~5,000 requests/month.
- At a few optimizations per day the usage stays well under the free limit.
- Candidate selection itself is pure distance math on already-loaded markers (zero API cost).

## Implemented in this clone
- New map control button: **“Optimize Nearby”**.
- Uses current location (falls back to map center).
- Selects nearest unvisited markers (skips any with a visit date in the last 30 days).
- Prefers walking when the set is dense; otherwise driving.
- Calls Google Directions with `optimize:true`.
- Estimates total time (travel + 3 min × stops).
- Shows the ordered list in a **side panel** (not a popup).
- Draws the route polyline on the map.
- Provides an “Open in Google Maps” button that launches the multi-stop navigation.

Files changed / added:
- `optimize-route.js` — new feature logic
- `map.js` — hooks the control after map init
- `newindex.html` — loads the new script
- `map.css` — styles for the side panel

## Refinements (status)

Done: 1 (unvisited filter), 2 (custom start), 3 (numbered markers), 5 (fit-to-time), 6 (ETAs, persisted route, settings, mobile-first UI, Done/Next stop via Visit -> Next).
Still open: walk/drive path coloring, cluster suggestions, in-map filters, PWA, sheet write-back (see Build order).

### 1. Stronger unvisited filter
- Skip stops whose `visitdate` is within the last 30/90/180 days (make the window configurable).
- Also respect the existing status / “Do Not Visit” column if present.
- Optional toggle in the side panel: “Include recently visited”.

### 2. Custom start point
- Let the user tap any marker to set it as the route origin instead of always using current location.
- Show a small “Set as start” button in the existing marker info window.
- Or long-press a marker to set start, then press Optimize.

### 3. Route visualization improvements
- Already drawing the polyline (suppressing extra markers so original pins stay visible).
- Next: highlight the ordered markers with numbered icons (1, 2, 3…).
- Optional: color the path by walking vs driving.

### 4. Cluster suggestions (later priority)
- Button “Suggest clusters” that runs a simple density pass (e.g. DBSCAN-style or radius grouping) on the current viewport.
- Lists the densest groups of unvisited stops and lets the user pick one to optimize.
- Useful when the map is zoomed out and many markers are visible.

### 5. Fit-to-hour logic
- After optimization, if projected time > 60 min, drop the farthest stops and re-optimize until it fits.
- Or let the user choose a target duration (30 / 45 / 60 min) before generating.

### 6. UI polish
- Side panel is already in place; next polish:
  - Show estimated arrival time at each stop.
  - Add “Next stop” / “Mark visited” quick actions that update the sheet (or open the existing Visit Details form).
  - Persist the last route so a refresh doesn’t lose it.

## Build order

| # | Step | Status | Depends on | Backend? | Size |
|---|------|--------|-----------|----------|------|
| 1 | Mobile-first pass | Done (6bac1ee) | - | no | L |
| 2 | Done / Next stop | Done (6bac1ee) | 1 | no | M |
| 3 | In-map filter sheet | Next | 1 | no | M |
| 4 | PWA install + offline shell | Next | 1 (independent of 3) | no | M |
| 5 | Sheet write-back "Mark visited" | After 3-4 | 2 | Apps Script | M |
| 6 | Cluster suggestions | After 3 | 1 | no | M |
| 7 | Walk/drive path coloring | Deferred | mixed-mode routing | no | S |
Ongoing: restrict both API keys by HTTP referrer; fill README from PLAN.md.

3 and 4 are independent and unblock everything cheap; 5 is the only backend work and needs your Apps Script deploy, so it comes after the client features are stable; 6 reuses 3's filtered set; 7 stays deferred.

## Specs for remaining steps

### Step 3: In-map filter sheet
**Goal:** change City/Status/Visited/Name without leaving the map (removes the slow round trip to index.html).

- **UI:** a "Filters" FAB (above Optimize in `#fab-group` in [newindex.html](newindex.html)) opens a bottom sheet reusing the sheet CSS pattern from [map.css](map.css) (`#filter-panel` old rules get replaced). Fields mirror [index.html](index.html): City select (same option list; extract to one shared JS array `CITIES` in map.js and have index.html keep its static list or load it), Status, Visited, Name input; all 16px, 48px tall. Buttons: "Apply" (primary) and "Reset". Shows live count "N stops".
- **Logic:** refactor `applyUrlFilters()` in [map.js](map.js) into `applyFilters(f)` taking `{city,status,name,visited}`; `applyUrlFilters` parses the URL then calls it. Apply → `applyFilters`, `history.replaceState` with the same query format `createDynamicURL` produces (`City==='X'`, `S=`, `F=`, `P=`) so links/bookmarks stay valid, and re-fit bounds (existing `setLocations`).
- **Prefill:** sheet initial values come from the parsed URL params; also persist to `localStorage` key `jowla-filters` (same key index.html uses) so both pages agree.
- **Interaction with route:** applying filters clears `routeMarkers`/polyline and hides the route panel (`clearRouteOverlays`, close sheet) since the route was built from the old set; toast "Filters applied".
- **Files:** map.js, map.css, newindex.html, small touch in index.html (share storage key).
- **Verify:** apply each filter alone and combined; URL updates and reload reproduces the view; count matches marker count; Optimize afterwards uses only the filtered set; filter sheet and route sheet never overlap (opening one closes the other).

### Step 4: PWA install + offline shell
**Goal:** home-screen app, fast cold start, last route/data usable on weak signal.

- **Manifest:** `manifest.webmanifest` (name "Jowla Map", `display: standalone`, `start_url: index.html`, theme `#1a73e8`, icons 192/512 + maskable). Generate icons as PNGs into `icons/`. Link from both HTML pages plus `apple-touch-icon`.
- **Service worker:** `sw.js` at repo root (GitHub Pages scope).
  - Precache app shell: index.html, newindex.html, map.css, map.js, optimize-route.js, manifest, icons, jQuery (self-host a copy as `vendor/jquery-3.1.1.min.js` so it caches reliably).
  - Strategy: shell = stale-while-revalidate; Google Sheets API response = network-first with cache fallback (cache key = request URL; the key is in the URL, fine); never cache Routes API POSTs, Maps JS, or map tiles.
  - Bump a `CACHE_VERSION` constant to invalidate; HTML references use `?v=` already, so also key the cache on that.
- **Offline behavior:** if Sheets fetch fails and cache exists, load cached data and toast "Offline — showing saved data". The Maps JS API itself needs network, so full offline map is out of scope; when offline show a toast instead of a blank page, and still show the saved route list in the sheet (list + nav links work without the map). Implement by rendering the route panel from `localStorage` before Maps loads (small refactor: `showRoutePanel` doesn't need `google`, only `ensurePanel`).
- **Registration:** `navigator.serviceWorker.register('sw.js')` at end of map.js and index.html, wrapped in feature check.
- **Files:** new manifest, sw.js, icons/, vendor/jquery; edits to both HTML pages and map.js.
- **Verify:** Chrome DevTools > Application: installable, SW active; Lighthouse PWA check; throttle to Offline and reload: shell loads, data from cache, route sheet renders; update flow (bump version, reload twice, new assets served).

### Step 5: Sheet write-back for "Mark visited"
**Goal:** one-tap "Visited" on a stop in the route sheet updates the Google Sheet (the API key is read-only, so this needs a small backend).

- **Backend (you deploy, I write the code):** a Google Apps Script bound to the sheet, deployed as a Web App (execute as owner, access: anyone with link). `doPost(e)` parses JSON `{rowid, visitcode, visitdate, token}`, rejects if `token` != a shared secret in Script Properties, finds the row whose column V (rowid, index 21) matches, writes visitdate (col Q) and visitcode (col O) with `LockService` to avoid races, returns `{ok:true}`. Keep the script in the repo as `apps-script/Code.gs` for reference.
- **Client:** `markVisited(stop)` in optimize-route.js posts via `fetch` with `Content-Type: text/plain` (avoids CORS preflight on Apps Script) to the web-app URL stored as a constant `WRITE_URL`; the shared token is entered once in Route settings ("Sync token") and kept in localStorage — not committed to the repo.
- **UI:** extends step 2: the done button gets a long-press/second button "Mark visited…" with a small menu of visit codes (reuse existing codes in data); on success, set `done`, update the in-memory location (`visitdate`) so the recent-visit filter drops it next Optimize, toast "Saved". Failure/offline: queue in `localStorage` (`jowla-write-queue`) and retry on `online` event/next load; show "N pending" in settings.
- **Open decisions for you:** the exact visit-code values and date format the sheet expects; whether VisitDetails form should remain the primary path (this would be a quick shortcut only).
- **Verify:** test against a copy of the sheet first; wrong token rejected; two quick writes both land; offline queue flushes; row matched by rowid not position.

### Step 6: Cluster suggestions
**Goal:** when zoomed out, suggest good walkable/driveable groups of unvisited stops, then optimize one.

- **Algorithm (new `cluster.js`, no deps):** take eligible stops via existing `getStopsInBounds` (same recent-visit/DNV rules) over the visible/filtered set; dedupe with `dedupeByLatLng`; grid-bucket then greedy radius clustering using `haversine` (radius default 0.4 km, min 4 stops); score = stop count minus a small spread penalty; return top 5 with centroid, count, and name of nearest street/first stop.
- **UI:** "Suggest" action in the Optimize FAB area (or a chip row at the top of the sheet) → bottom sheet listing clusters ("12 stops · 0.3 km across"). Tapping one fits the map to it and highlights its markers; a "Optimize this cluster" button calls `runOptimization` with `source` restricted to the cluster and a start = cluster-nearest-to-GPS point. Pure client-side; cap compute to 2000 points.
- **Files:** new cluster.js, small hooks in optimize-route.js (accept explicit `source`; already a parameter of `runOptimization`), map.css.
- **Verify:** known dense area returns a cluster; recent-visited stops excluded; works with filters applied; handles <min stops with a toast.

### Step 7: Walk/drive path coloring (deferred)
Not built until routing supports mixed modes (currently one `travelMode` per route in `requestRoute`). When it does: split into per-leg requests or use per-leg mode, color polyline segments (blue drive, green walk). Revisit after step 6.

### Ongoing
- Confirm Maps JS key and Routes key are HTTP-referrer restricted (key is in client source).
- Fill README with the PLAN.md workflow.

## Bug fixes (from phone screenshot)

### A. Optimize FAB hides another button behind it
- **Symptom:** on mobile a second dark pill peeks out from behind/below-right of the Optimize pill; it can't be tapped. Likely the Done/Next ("Go: N") pill or sheet peek bar sitting at the same bottom-right position as `#fab-group` (`map.css` `#fab-group`, bottom = `--sheet-peek` + 16px), so they overlap whenever a route is active.
- **Fix:** put every floating button in the single `#fab-group` flex column (locate, Next/Go, Optimize) so they stack with a 12px gap instead of absolutely overlapping; remove any separate fixed-position copy. If the Next pill must stay separate, give it its own slot (e.g. above Locate) and raise `#fab-group` `bottom` by its height via a CSS variable set when it shows. Hide Optimize's duplicate while a route sheet is open if redundant.
- **Verify:** at 390px width with and without a route: no overlap, all buttons tappable, nothing clipped by the sheet peek.

### B. Marker popup has blank space at the top
- **Cause:** Google's InfoWindow reserves a header row (`.gm-style-iw-ch`) for the close button; our content sits below it, and the dark theme makes it a visible empty band.
- **Fix:** create the window with `headerDisabled: true` in `map.js` (both `new google.maps.InfoWindow` calls, lines ~88 and ~168) and add our own close "×" inside `.iw` (top-right, 44px target) that calls `infowindow.close()`. Fallback CSS: `.gm-style-iw-ch { padding-top: 0; min-height: 0; }` and trim `.gm-style-iw-d` top padding.
- **Verify:** tap a marker: card starts directly with the name, close button works, tall content still scrolls, dark and light themes.
### C. Restore the Apple Maps option
- **Symptom:** on iPhone there is no Apple Maps choice where it matters. The marker popup "Navigate" in `map.js` (~line 197) is Google-only. Apple support survives only in `optimize-route.js` (`buildAppleMapsUrl`, `isIOS`, the primary/"Open full route" buttons, per-row "Go"). The mobile pass (`6bac1ee`) added the popup without it. The route sheet's Apple buttons are also easy to miss: the primary is Apple only if `buildAppleMapsUrl` is non-null (it returns null above `MAX_APPLE_STOPS` = 15 stops), otherwise it silently falls back to Google.
- **Spec:**
  1. Add one shared helper `navLinks(lat, lng)` (new small `nav.js`, or exported from optimize-route.js) returning `{apple, google}` URLs, plus `isIOS`. Apple single stop: `https://maps.apple.com/?daddr=LAT,LNG&dirflg=d`; Google: existing `dir/?api=1&destination=`. Use it in the popup, the Go row buttons, and the Next-stop pill so URL logic lives in one place.
  2. Add a user setting "Preferred maps app" (Auto / Apple / Google) in Route settings, stored in localStorage `jowla-nav-pref`. Auto = Apple on iOS, Google elsewhere (current behavior). The preferred app is the primary button; the other is a secondary link.
  3. Popup: primary "Navigate" opens the preferred app; a second smaller "Open in Apple/Google Maps" button opens the other (iOS only shows both; non-iOS shows Google only, plus Apple as a web link only if pref is Apple).
  4. Route sheet: when more than 15 stops on Apple, split into Apple segments of 15 like the Google segments (`buildGoogleMapsSegments` pattern) instead of dropping the Apple button; label "Apple Maps – Segment N".
  5. Harden `isIOS` for in-app/third-party iOS browsers (Brave/Chrome on iOS UA contains "iPhone"; iPadOS reports MacIntel, already handled).
- **Files:** map.js, optimize-route.js, map.css (secondary button style), settings markup in newindex.html.
- **Verify:** iPhone Safari and Brave/Chrome: popup, Next pill, row Go and sheet primary each open Apple Maps by default; switching pref to Google flips all of them; desktop/Android never show Apple unless chosen; 16+ stops yields multiple Apple segments.
## Suggested workflow once live
1. Open the map and tap **Optimize** (or set a custom start first).
2. Tap **Go: N. Name** and follow the route.
3. Tap **Log visit ✓**; the form opens and the stop is marked done.
4. Return to the map; the next **Go** button is ready. Undo from the toast if needed.

## Future integration notes
- The feature is client-side only and reuses the already-loaded `locations` array, so it works with the current sheetrock / Sheets API loading path.
- If the map later moves to a different data source, only the location objects need to keep `latitude`, `longtitude`, `visitdate`, and `name`/`address`.
- API key should remain restricted by HTTP referrer for security.
