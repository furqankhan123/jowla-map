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
| 3 | In-map filter sheet | Done | 1 | no | M |
| 4 | PWA install + offline shell | Done (offline route list without map deferred) | 1 (independent of 3) | no | M |
| 5 | Sheet write-back "Mark visited" | Built; needs Apps Script deploy | 2 | Apps Script | M |
| 6 | Cluster suggestions | Done | 1 | no | M |
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

### A. Optimize FAB hides another button behind it  [DONE 8bcccf0]
- **Symptom:** on mobile a second dark pill peeks out from behind/below-right of the Optimize pill; it can't be tapped. Likely the Done/Next ("Go: N") pill or sheet peek bar sitting at the same bottom-right position as `#fab-group` (`map.css` `#fab-group`, bottom = `--sheet-peek` + 16px), so they overlap whenever a route is active.
- **Fix:** put every floating button in the single `#fab-group` flex column (locate, Next/Go, Optimize) so they stack with a 12px gap instead of absolutely overlapping; remove any separate fixed-position copy. If the Next pill must stay separate, give it its own slot (e.g. above Locate) and raise `#fab-group` `bottom` by its height via a CSS variable set when it shows. Hide Optimize's duplicate while a route sheet is open if redundant.
- **Verify:** at 390px width with and without a route: no overlap, all buttons tappable, nothing clipped by the sheet peek.

### B. Marker popup has blank space at the top  [DONE 8bcccf0]
- **Cause:** Google's InfoWindow reserves a header row (`.gm-style-iw-ch`) for the close button; our content sits below it, and the dark theme makes it a visible empty band.
- **Fix:** create the window with `headerDisabled: true` in `map.js` (both `new google.maps.InfoWindow` calls, lines ~88 and ~168) and add our own close "×" inside `.iw` (top-right, 44px target) that calls `infowindow.close()`. Fallback CSS: `.gm-style-iw-ch { padding-top: 0; min-height: 0; }` and trim `.gm-style-iw-d` top padding.
- **Verify:** tap a marker: card starts directly with the name, close button works, tall content still scrolls, dark and light themes.
### C. Restore the Apple Maps option (all platforms, no iOS detection)  [DONE 0.11.0]
- **Symptom:** the marker popup "Navigate" in `map.js` (~line 197) is Google-only. Apple support survives only in `optimize-route.js` (`buildAppleMapsUrl`, primary/"Open full route" buttons, per-row "Go"), and it is gated on `isIOS`. The sheet's Apple primary also silently falls back to Google above `MAX_APPLE_STOPS` = 15 stops.
- **Spec:**
  1. Remove `isIOS` entirely (`optimize-route.js` ~line 472 and every use). Apple Maps links (`https://maps.apple.com/...`) work in any browser: they open the Maps app on Apple devices and Apple Maps on the web elsewhere, so always offer both apps.
  2. Add one shared helper `navLinks(lat, lng)` (new small `nav.js`, or exported from optimize-route.js) returning `{apple, google}` URLs. Apple: `https://maps.apple.com/?daddr=LAT,LNG&dirflg=d`; Google: existing `dir/?api=1&destination=`. Use it in the popup, the Go row, and the Next-stop pill so URL logic lives in one place.
  3. Add a setting "Preferred maps app" (Google / Apple) in Route settings, stored in localStorage `jowla-nav-pref`, default Google. The preferred app is the primary button; the other is always shown as a secondary link.
  4. Popup: primary "Navigate" opens the preferred app; a second button "Open in Apple/Google Maps" opens the other one.
  5. Route sheet: show both Google and Apple buttons for everyone. When more than 15 stops, split Apple into 15-stop segments like `buildGoogleMapsSegments` ("Apple Maps – Segment N") instead of dropping it.
- **Files:** map.js, optimize-route.js, map.css (secondary button style), settings markup in newindex.html.
- **Verify:** on iPhone, Android and desktop the popup, Next pill, row Go and sheet all show both apps; the preference flips which is primary; 16+ stops yields multiple Apple segments; no reference to `isIOS` remains.
### D. Settings controls should look like buttons  [DONE 0.11.1]
- **Problem:** "Route settings" and "Sync sheet" in the route sheet are bare `<summary>` / text links (`optimize-route.js` ~line 517, sync settings bound by `bindSyncSettings`), so users don't realize they can be tapped.
- **Fix:** style both as real buttons: `.settings-btn` with the `.iw-btn.alt` look (light-blue fill, blue bold text, 1px border, 8px radius, min-height 44px, full-width or side by side), a leading icon (gear / refresh) and a trailing chevron that rotates when open. Keep `<details>`/`<summary>` for accessibility but apply the button styles to `summary` and remove the default disclosure marker; add `:active` and `:focus-visible` states.
- **Files:** map.css, optimize-route.js (markup/classes), sync settings markup.
- **Verify:** both controls read as buttons at 390px, 44px tap targets, open/close works, keyboard focus visible.

### E. Implement the Apple Maps change  [DONE 0.11.0]
Build section C exactly as specified (shared `navLinks` helper, remove `isIOS`, "Preferred maps app" setting, popup second button, both apps in the sheet, 15-stop Apple segments). Steps 3-6 are now done, so this is the next code task.

### F. Start and end locations in the route and total time  [DONE 0.12.0, saved places not built]
- **Goal:** the user's day starts and ends at a known place (home, office, car). Total time must include getting from the start to the first stop and from the last stop to the end, and the end can differ from the start.
- **Options (Route settings):** "Start" = GPS (default) / custom point (existing marker "Set as start") / saved place; "End" = Same as start (default) / Different location. "Different location" is set by the same marker-popup action ("Set as end", next to "Set as start") or by a saved place; shown as a green flag marker, with "clear" like start. Persist in `opts` and localStorage with the route.
- **Routing:** in `requestRoute` (`optimize-route.js` ~245) when an end is set, use it as `destination` and make all candidates intermediates with `optimizeWaypointOrder`; for "same as start" the destination equals the origin (round trip). The old last-candidate-as-destination behavior is removed: the end is always a location, never a stop. The final leg adds an entry to `legSecs`.
- **Total time:** `totalMins` = all legs including the return/end leg + `AVG_VISIT_MINS` per stop (not for the end point). Fit-to-time (`targetMins` loop, ~line 223) uses this full total, so stops are dropped until start-to-end fits. Summary shows e.g. "12 stops · ~58 min · ends at Home 4:42 PM".
- **UI:** the end point appears as a final row in the stop list (no Visit/Done buttons) with its ETA. Google/Apple navigation URLs use the chosen end as `destination` (Apple/Google segments: final segment ends at the end point).
- **Edge cases:** end equals start with one stop; end unreachable by mode; Routes API waypoint cap (25 intermediates) still applies.
- **Verify:** same-start/end round trip adds the return time; different end changes the order and total; fit-to-time respects it; clearing the end returns to same-as-start; persisted route restores the end.
## Session handoff (state at 494014a, v0.10.0, pushed to origin/main)

**Done:** steps 1-6 (mobile-first, done/next, in-map filters, PWA, quick-log write-back, cluster suggestions) and bugs A and B. **Step 5 is code-complete but inert** until the owner deploys `apps-script/Code.gs` and enters the URL and token under Route settings > Sheet sync. **Open:** C/E (Apple Maps), D (settings as buttons), F (start/end + total time), step 7 (deferred), and the offline route list without the map.

**Nothing from this session has been verified on a real phone.** Only `node --check`, a Node unit check of `findClusters`, and reading live sheet data were done. First task next session: run the app on a phone (or DevTools at 390px) and walk the Verify lists for A, B, step 3 (filters), step 4 (install/offline), step 5 (against a copy of the sheet) and step 6 (clusters).

**Facts learned from the live sheet (use these, don't re-derive):**
- Visit codes in use: `No Response`, `Left Message`, `Gave Targheeb` (plus `Do Not Visit` and `[auto] comment update`; many address strings also sit in the visitcode column, so treat unknown codes as noise).
- Date format: `October 25, 2026` (long month, day, year). `sheetDate()` in `writeback.js` and the regex in the Apps Script rely on it.
- `rowid` (column V) is the sheet row number; about 45,400 rows load into the page. The Sheets API key is HTTP-referrer restricted (direct curl returns 403), which is correct.

**Suggestions / follow-ups (not planned above):**
1. **Quick-log Undo:** the Undo toast only un-marks the stop; the sheet write stays. Either drop Undo for quick-log, or add an undo write restoring the previous code/date (store them in the queue item).
2. **Apps Script hardening:** test on a copy of the sheet first; keep `ALLOWED_CODES` (Code.gs) in sync with `QUICK_CODES` (writeback.js); the endpoint is public by URL so the token is the only protection, rotate it if leaked.
3. **Performance at ~45k rows:** `applyFilters` recreates every marker; consider marker clustering or rendering only markers in the viewport, and debounce the filter-sheet name input (it recounts all rows per keystroke).
4. **PWA polish:** icons are generated placeholders (replace with real artwork); bump `CACHE_VERSION` in `sw.js` with every release alongside `APP_VERSION` and the `?v=` strings (one source of truth would stop drift); add the offline route list (render `ensurePanel`/`showRoutePanel` from localStorage before Maps loads).
5. **Repo hygiene:** add `.playwright-mcp/` and `.mcp.json` to `.gitignore`; add a `.gitattributes` with `* text=auto` to stop the LF/CRLF warnings; remove the unused `infoWindow = new google.maps.InfoWindow` near the top of `initialiseMap` in map.js.
6. **Cluster empty state:** Suggest uses `window.visibleLocations`, so filters apply; mention in the empty-state text when a filter is active.
7. **README:** still to be filled from this file (workflow section) once C-F land.

**Recommended order next:** E/C (Apple Maps) -> F (start/end/total time; affects routing and fit-to-time) -> D (settings buttons, markup/CSS only) -> phone verification pass -> suggestions 1, 3, 5 -> step 7 only after F provides per-leg modes.

## Future improvements (backlog, collected 0.12.0)

### From live-app usage (DONE 0.13.0; owner must fill config.js syncUrl/syncToken after deploying Code.gs)
1. **Cluster list: drop the name.** Suggested clusters should not show a stop/street name; show only count and spread (e.g. "12 stops · 0.3 km across"). (`cluster.js` / suggest sheet markup)
2. **Google segment 1 missing.** With Google Maps as the preferred app only "Segment 2" shows. Likely the primary "Start in Google Maps" button is rendered in `#route-primary` (hidden/covered in the sheet body) while the body list skips index 0 (`prim.forEach` with `idx > 0`). Show segment 1 in the body too, or make the primary visible in every sheet state; verify with 1, 10 and 16+ stops.
3. **Zero-setup for non-technical users.** The user will not have a sheet URL or token. Quick-log must work with one tap: bake `WRITE_URL` and the shared token into the deployment (token held in a config the owner sets once, not typed by the user), or move auth server-side (Apps Script restricted to the app's origin/user). Remove "Sheet sync" from the user-facing settings (keep an owner-only/advanced section); if sync is not configured, hide quick-log buttons rather than asking for setup.
4. **Round trip end is not honoured in Apple Maps.** With the default end (= start) Apple launches with the last visited stop as its final destination. The Apple/Google links must append the end point (start for a round trip) as the final destination; check `buildAppleMapsSegments` receives `navStops` and that `route.end` exists for routes persisted before 0.12.0 (old routes have no `end`, so they fall back to the last stop). Also confirm per-row "Go" and the Next pill are unaffected.
5. **Marker popup clutter.** Keep only "Navigate" (opens Google Maps by default, or Apple Maps if chosen in settings) and "Visit Details". Remove "Open in other app", "Set as start" and "Set as end" from the popup.
6. **End defaults to start.** Default end = start point (round trip) everywhere, including after clearing. No end picker in the popup (see 7).
7. **Set a different end from the ordered list.** Remove "Set as start/end" from the popup; add a per-row control in the route sheet ("Set as end") that makes that stop (or a chosen stop) the route end and re-optimizes/recomputes, with a "Reset to start" action. The end stop is then excluded from the visit list or shown as the final row.
8. **Filter sheet close "×" too small.** Make the in-map filter close button at least 44x44px with a larger glyph (`#fs-close` in `map.css`).

### Next round (DONE 0.14.0; verify on phone)
1. **Declutter ordered-list rows.** Each row should be: done toggle, number, ETA + name, and one action. Remove the per-row "Google/Apple" alt link (`a.go.alt`, `nb.other`), the per-row "End here" button (`.end-btn`), and rename the per-row "Visit" link to "Log". Keep the primary "Go" link only if it is still wanted after the button cleanup; otherwise rely on the Go pill / Start button.
2. **One "Set end point" button at the bottom of the list** (replaces per-row End here). Default end = start (round trip, shown as "End: back at start"). Tapping the button opens a small picker listing the stops (or "Choose on map") so the user can pick a different final stop; then re-optimize via `rerouteWithEnd(idx)`. Keep "Reset: return to start" when a custom end is set. Hide the button when only one stop remains.
3. **Google segment 2 loads forever / does not carry over.** In `buildGoogleMapsSegments` segment N>1 uses the previous segment's last stop as `origin=lat,lng`; Google Maps (esp. the app) can hang or refuse to start navigation with an explicit coordinate origin that is not the user's location. Fix options: omit `origin` for segments after the first so Google uses "Your location" (the user is at the end of the previous segment), keep `waypoints` capped at 9, and make sure the final destination is the route end, not a duplicated stop. Also verify URL encoding of `|` in `waypoints` (use `encodeURIComponent` / `%7C`) and that the segment has at most 9 waypoints plus destination. Test segment 2 on Android Google Maps app and iOS.
4. **Apple segment 2 repeats the last stop before the end point.** `buildAppleMapsSegments` overlaps by one stop (`remaining.slice(chunk.length - 1)`), so the chunk boundary stop becomes both the previous segment's destination and the next segment's first waypoint/source; with the end point appended as the last "stop" the final chunk also lists the last real stop twice (as a waypoint and again as the boundary). Fix: segment N>1 uses `source` = previous destination and must not list that stop again as a waypoint; dedupe consecutive identical coordinates in every URL; add a unit check (Node) for 1, 15, 16, 30, 31 stops, with and without an end point, asserting no duplicate consecutive points and that the last segment ends at the end point. Apply the same overlap logic check to the Google builder.
5. Add a lightweight Node test script (`tests/segments.test.js`) for both segment builders so these regressions are caught without a phone.

### Round 3 (feedback after 0.14.0; plan only, not built)
1. **Segment buttons side by side.** Replace the stacked full-width segment buttons with a compact grid: one row per app (label "Google Maps" / "Apple Maps") and a flex-wrap row of small buttons "1", "2", "3"... (each opens that segment; tooltip/aria "Stops a-b"). Single-segment routes show one button per app. Preferred app first. Files: `optimize-route.js` (`showRoutePanel`), `map.css`.
2. **End point by address.** "Set a different end point…" opens an input (not a stop list) where the user types an address/place. Resolve with the Maps JS `google.maps.Geocoder` (or Places Autocomplete, restricted to the current region and loaded with the existing key; check the free tier and that Places/Geocoding is enabled on the key) and show suggestions. On selection, store `route.end = {lat, lng, name}` (not a stop; reuse the 0.12.0 end-row/nav-URL path via `end` and `navStops`) and re-run `requestRoute` with that destination. Optional shortcuts: "Use my current location" and recent ends saved in localStorage. Keep "Reset: return to start". Remove the stop picker (`#end-picker`, `rerouteWithEnd(idx)` becomes `rerouteWithEnd(endPoint|null)`).
3. **Optimize button as an icon.** Replace the "Optimize" pill (`#optimize-fab`) with a round icon FAB (route/sparkle/play glyph or inline SVG) matching the other FABs, with `aria-label` and `title` "Optimize nearby"; keep the busy state as a spinner. The "Optimize" text button inside Route settings stays.
4. **First-time walkthrough tour.** Short coach-mark tour shown once (localStorage `jowla-tour-done`), with Next/Skip and a "Replay tour" button in Route settings: (1) filters FAB, (2) suggest clusters, (3) optimize icon, (4) route sheet: Go / Log / done toggle, (5) end point and maps app choice. Implement as small `tour.js` (no deps): dimmed overlay with a spotlight around the target element, tooltip card, 44px buttons, works at 390px, re-positions on resize. Mark done on finish or skip.
5. **Apple Maps launch shows "Steps" instead of "Go".** Apple Maps opens the route overview with a Steps button rather than starting navigation. Investigate the URL: for single-destination links use `https://maps.apple.com/?daddr=LAT,LNG&dirflg=d` (already used for Go); for multi-stop `maps.apple.com/directions` links Apple shows the overview and the user must tap Go. Options: (a) accept and tell the user in the tour/tooltip, (b) try `http://maps.apple.com/?saddr=Current+Location&daddr=...&dirflg=d` or the `maps://` scheme on Apple devices, (c) for the Go pill and per-row Go use the single-stop link so navigation starts directly, reserving multi-stop links for the segment buttons. Test on iPhone before choosing.

### From the session handoff
- **Quick-log Undo:** Undo only un-marks locally; the sheet write stays. Either drop Undo for quick-log or queue an undo write restoring the previous code/date.
- **Apps Script hardening:** test on a copy of the sheet; keep `ALLOWED_CODES` (Code.gs) in sync with `QUICK_CODES` (writeback.js); the token is the only protection, rotate if leaked.
- **Performance at ~45k rows:** `applyFilters` recreates every marker; use marker clustering or viewport-only rendering; debounce the filter name input.
- **PWA polish:** replace placeholder icons; one source of truth for version (`APP_VERSION`, `CACHE_VERSION`, `?v=`); offline route list rendered from localStorage before Maps loads.
- **Cluster empty state:** mention an active filter in the empty-state text.
- **README:** fill from this file once the above land.
- **Saved places** for start/end (F option not built).
- **Step 7:** walk/drive path coloring, only once per-leg modes exist.
- **Phone verification pass:** walk the Verify lists for A, B, steps 3-6, C/E, D and F on a real phone (none verified yet).

## Suggested workflow once live
1. Open the map and tap **Optimize** (or set a custom start first).
2. Tap **Go: N. Name** and follow the route.
3. Tap **Log visit ✓**; the form opens and the stop is marked done.
4. Return to the map; the next **Go** button is ready. Undo from the toast if needed.

## Future integration notes
- The feature is client-side only and reuses the already-loaded `locations` array, so it works with the current sheetrock / Sheets API loading path.
- If the map later moves to a different data source, only the location objects need to keep `latitude`, `longtitude`, `visitdate`, and `name`/`address`.
- API key should remain restricted by HTTP referrer for security.
