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

- **Transport (as built, 0.18.x):** no backend. Quick-log GETs the public Visit Details Google Form (see Session handoff item 2 for URL and entry ids). Optional relay `apps-script/Code.gs` exists but is not deployed.
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
## Session handoff (state at v0.18.4, on `main`; read this first)

**How to work:** develop on branch `claude/implement-plan-md-qjez3u`, commit + push each non-trivial change, then fast-forward `main` (GitHub Pages serves `main`: https://furqankhan123.github.io/). Bump `APP_VERSION` (optimize-route.js), the `?v=` strings in newindex.html, `CACHE_VERSION` in sw.js and add a CHANGELOG entry per release. After deploy the service worker serves the old files: reload twice. Run `node tests/segments.test.js` and `node --check` on every JS file before pushing. Never put real addresses, names or coordinates from screenshots into the repo or commit messages.

**Built and live (all user-tested on an iPhone unless noted):** mobile-first sheet; Optimize (GPS start, fit-to-time, ETAs, numbered markers); Go/Log/done flow; in-map filters; cluster suggestions; PWA shell; round trip by default; "Set a different end point" by address (Places API (New) + Geocoder fallback) or current location; compact numbered segment buttons per app (`segments.js`, tested); preferred maps app setting (`nav.js`); optimize icon; first-run tour (`tour.js`); sheet state persists across app switches; quick-log (direct to the Visit Details Google Form, verified working live in 0.18.4); camera control bottom-left on desktop; reopen-route button.

**Verified facts (don't re-derive):**
- Google segment URLs: explicit `origin` (previous destination) + raw `lat,lng` waypoints joined by `|` works; encoded commas made the Google Maps app load forever.
- Apple Maps: a fixed `source=` makes Apple show only **Steps**; omitting it (start = Current Location) shows **Go** (0.17.0, CONFIRMED on iPhone). Apple's practical cap is 15 points per link.
- Places legacy API is unavailable for new projects; the key must allow Places API (New) and Geocoding API.
- The Google camera control is hidden on touch devices and shown bottom-left (`LEFT_BOTTOM`) on desktop (`pointer: coarse` check in map.js).
- The Visit Details form is a plain GET (no method attr): quick-log mimics it with a no-cors GET and the same query string. Empty Language/Comments must be OMITTED (empty checkbox value = 400); POST/FormData attempts failed with 400.
- Sheet: visit codes `No Response`, `Left Message`, `Gave Targheeb` (plus `Do Not Visit`, `[auto] comment update`; address strings also appear in the visitcode column = noise). Date format `October 25, 2026`. `rowid` (column V) is the row number; ~45,400 rows load. The Sheets key is referrer-restricted (curl returns 403, correct).

**Open items (pick up here):**
1. ~~Confirm Apple Go~~ confirmed working. Remaining curiosity only: the Apple "12 stops vs 15" count seen in an earlier screenshot (likely moot now).
2. **Quick-log (step 5) is live and needs no setup.** `writeback.js` GETs `https://docs.google.com/forms/d/e/1FAIpQLSe_TQfBBhpLky9XyTz0SuSsJpcgfF61pS8onUX4RgQxEITOpA/formResponse` with `ENTRY` ids (db 647159166, rowid 589985326, name 459245489, code 607683347, Status repeated 1275295467; Language 2108730671 and Comments 322317336 are omitted). No date field (form timestamp is used). Status is always resent so the pipeline does not wipe it. `apps-script/Code.gs` is an OPTIONAL standalone relay for confirmed delivery, to be deployed later if wanted (steps: script.google.com new project, paste, Script Property `TOKEN`, deploy as Web app, Execute as Me, Anyone, then put the URL/token in `config.js`). Keep `ENTRY`/`FORM_URL` in sync between writeback.js and Code.gs and re-read VisitDetails.html if the owner edits the form. Risk: the form/pipeline is owned by someone else; if it changes, direct mode fails silently (opaque response), so use the relay to see errors.
3. **Quick-log Undo** only un-marks locally; a form submission cannot be withdrawn. To correct, submit Visit Details again.
4. **Performance at ~45k rows:** `applyFilters` recreates every marker (marker clustering / viewport rendering); debounce the filter name input.
5. **Offline route list without the map** (render the route sheet from localStorage before Maps loads).
6. **PWA polish:** real icons (current ones are placeholders); one source of truth for version strings.
7. **Cluster empty state** should mention an active filter.
8. **Saved places** for start/end; **step 7** walk/drive path coloring (needs per-leg modes).
9. **Ongoing:** keep both API keys HTTP-referrer restricted; keep the screenshot-privacy rule above.

Items 4–8 are folded into **Round 6** below, which is the ordered plan to work from next.

## Round 6: code review findings (collected at 0.18.4, build in this order)

Order rule: bugs that lose or misrecord visits first, then performance at ~45k rows, then reliability/offline, then maintainability, then features. Each item is one release unless marked otherwise. Sizes: S < 1h, M a few hours, L a day+.

| # | Item | Type | Size | Depends on |
|---|------|------|------|-----------|
| 6.1 | Quick-log double tap logs the next stop (DONE 0.18.5) | bug | S | - |
| 6.2 | Visited stops come back in the next Optimize (DONE 0.18.6) | bug | M | - |
| 6.3 | Quick-log real Undo window (DONE 0.18.8) | bug | S | 6.2 |
| 6.4 | ETAs ignore progress (DONE 0.18.9) | bug | S | - |
| 6.5 | Optimize silently replaces a route in progress; "Continue from here" (DONE 0.19.0) | bug/UX | S | 6.2 |
| 6.6 | Data load failure = blank page; map waits on data (DONE 0.19.1) | bug | S | - |
| 6.7 | Stale custom-start UI text and dead code (DONE 0.19.2) | cleanup | S | - |
| 6.8 | "More than N days" filter drops never-visited stops (DONE 0.18.7) | bug? | S | - |
| 6.9 | Precompute row fields + debounce filters (DONE 0.19.3) | perf | S | - |
| 6.10 | Marker rendering at 45k rows (Advanced Markers + clustering) | perf | L | 6.9 |
| 6.11 | Fewer Routes API calls per Optimize (DONE 0.19.4) | perf/cost | S | - |
| 6.12 | Service worker update prompt; keep offline data across deploys (DONE 0.19.5) | reliability | S | - |
| 6.13 | Refresh sheet data without reloading (DONE 0.19.6) | reliability | S | 6.2 |
| 6.14 | Offline route list before Maps loads (DONE 0.19.7) | reliability | M | 6.6 |
| 6.15 | One config + one version string | maintenance | S | - |
| 6.16 | Remove jQuery | maintenance | S | 6.15 |
| 6.17 | Unit tests for pure logic + CI | maintenance | M | 6.15 |
| 6.18 | Shared city list for index.html | maintenance | S | - |
| 6.19 | Travel mode chosen from stop spacing, not distance from start | feature | S | - |
| 6.20 | Cluster empty state mentions active filters | feature | S | - |
| 6.21 | Real PWA icons | feature | S | - |
| 6.22 | Saved places for start/end | feature | M | 6.7 |
| 6.23 | Walk/drive path coloring (step 7) | feature | - | deferred |

### 6.1 Quick-log double tap logs the next stop
- **Problem:** `quickLog` ([writeback.js](writeback.js) ~114) calls `markRouteStopDone`, which runs `updateDoneUi` and immediately re-renders the chips for the *next* stop in the same place. A double tap (or a slow first response) lands on the new chip and logs the next stop with the same code.
- **Fix:** after a chip tap, disable all quick chips and the Log button for ~1.5 s (CSS class `.cooldown`, `pointer-events:none`, dimmed), and render the next stop's chips with a short fade-in. Also ignore a second `quickLog` for the same `rowid` within 10 s.
- **Verify:** rapid double tap on "No Response" logs exactly one stop; queue holds one item; next stop's chips become tappable after the cooldown.

### 6.2 Visited stops come back in the next Optimize
- **Problem:** only quick-log updates `loc.visitdate` in memory. "Log visit ✓", the row "Log" link, the popup "Visit Details" and the done toggle only set `stop.done` on the route. A second Optimize in the same session (or after a reload, before the form pipeline updates the sheet) proposes the same houses again. Quick-log's in-memory update is also lost on reload.
- **Fix:** a local visit ledger in localStorage `jowla-local-visits` = `{ "<db>:<rowid>": "<ISO date>" }`. Write to it from `markStopDone` and `quickLog`; remove the entry on Undo. On data load ([map.js](map.js) `initialiseMap`), merge it in: if the sheet's `visitdate` is older than the ledger date (or empty), use the ledger date. Prune entries older than 30 days or once the sheet catches up. `getStopsInBounds` then excludes them with no other change.
- **Verify:** log a stop via the form, Optimize again: it is not offered; reload and Optimize: still not offered; Undo: offered again; ledger entry disappears once the sheet shows a newer date.

### 6.3 Quick-log real Undo window
- **Problem:** Undo after quick-log only un-marks the stop locally; the form submission is already sent and cannot be withdrawn (handoff item 3).
- **Fix:** hold new quick-log items in the queue with `sendAfter = now + 7 s` (matches the action toast). `flushQueue` skips items not yet due and re-runs via `setTimeout`. Undo removes the item from the queue (if unsent), reverts `loc.visitcode/visitdate` and the 6.2 ledger entry. Items already sent: toast "Already submitted: use Visit Details to correct".
- **Verify:** tap a chip then Undo within 7 s: nothing is submitted (Network tab); without Undo: one GET after ~7 s; offline items still queue and flush.

### 6.4 ETAs ignore progress
- **Problem:** `showRoutePanel` ([optimize-route.js](optimize-route.js) ~701) computes every ETA from `Date.now()` starting at stop 1, so halfway through a route the times are wrong (done stops still count, next stop's ETA assumes you are at the start). The header "ends at" has the same flaw.
- **Fix:** compute ETAs from now starting at the first undone stop: its travel leg is unknown, so use its `legSecs` entry as an estimate (or 0 if the previous stop is done and you are presumably there), then add legs + `AVG_VISIT_MINS` for the remaining undone stops and the end leg. Done rows show "✓" instead of a time. Recompute in `updateDoneUi` (not only on full render) and once a minute while the sheet is visible.
- **Verify:** mark 3 stops done: next stop's ETA is ~now + leg, end time shrinks accordingly; undo restores.

### 6.5 Optimize replaces a route in progress; "Continue from here"
- **Problem:** tapping Optimize with an active route discards it (and its done state) without asking.
- **Fix:** if `currentRoute` has undone stops, show a small choice sheet: "Re-plan remaining N stops from here" (reroute only the undone stops from current GPS, keeping done state; reuses `requestRoute` with `old.stops.filter(!done)` and the current end) / "New route" / Cancel. When all stops are done, the primary area shows "Find more stops" which runs a normal Optimize (done stops are already excluded by 6.2).
- **Verify:** mid-route Optimize shows the choice; "Re-plan" keeps done rows and reorders the rest from the current position; "New route" behaves as today.

### 6.6 Data load failure shows a blank page
- **Problem:** `initialiseMap` ([map.js](map.js) ~57) creates the map only inside the `$.getJSON` success callback and has no error handler. A failed Sheets fetch with no cache leaves a blank screen with no message; on a slow network the user stares at nothing while ~45k rows download.
- **Fix:** create the map immediately (centered on the last viewport, stored in localStorage `jowla-last-view`, else the default), show a "Loading stops…" toast/spinner, then fetch data. On failure: error toast with a "Retry" action. Keep the offline toast when served from cache.
- **Verify:** DevTools block `sheets.googleapis.com`: map shows, error + Retry appear, Retry works after unblocking; normal load shows the map before the markers.

### 6.7 Stale custom-start UI text and dead code
- **Problem:** "Set as start" was removed from the popup in 0.13.0, but Route settings still says "GPS (or tap a pin → “Set as start”)" ([optimize-route.js](optimize-route.js) ~565), `setRouteStart` is still exported, and an old `opts.customStart` saved by an earlier version keeps silently overriding GPS. `updateDoneUi` also runs twice per render (`showRoutePanel` and `renderRoute`).
- **Fix:** settings show "Start: your location" (or the saved custom start with "clear" if one exists); remove `setRouteStart`/`window.setRouteStart` and `__pendingStart`'s start role (rename to `__popupLoc`); drop the duplicate `updateDoneUi` call. 6.22 later reintroduces a start choice via saved places.
- **Verify:** no "Set as start" text anywhere; an old saved custom start can be cleared; route renders once.

### 6.8 "More than N days" filter drops never-visited stops (owner decision)
- **Problem:** in `matchesFilters` ([map.js](map.js) ~128), Visited = "More than 30/90/180 days" returns false for rows with no `visitdate`, so stops never visited are hidden by a filter meant to show "not visited recently". Unparseable dates pass every filter.
- **Decision needed:** should "More than N days" include never-visited stops? Recommended: yes (it means "not visited in the last N days"). If yes, change the empty-date branch; unparseable dates treated as never visited. Check index.html's original semantics match.
- **Verify:** counts for each Visited option: "More than 30 days" ≥ "Not yet visited".

### 6.9 Precompute row fields + debounce filters
- **Problem:** every filter pass and every keystroke in "Name contains" re-runs `toLowerCase()` on names/status and `new Date(visitdate)` for ~45k rows; `getStopsInBounds` allocates a `google.maps.LatLng` per row.
- **Fix:** at load, store `loc._name` (lowercase), `loc._sts` (lowercase), `loc._visitMs` (parsed once, NaN → null). Use them in `matchesFilters` and `getStopsInBounds` (numeric bounds compare instead of `LatLng`). Debounce the name input's count by 200 ms. Update `_visitMs` wherever `visitdate` changes (quick-log, 6.2 ledger).
- **Verify:** typing in the name field stays smooth on a phone (Performance panel: each keystroke < 16 ms after debounce); counts unchanged vs before.

### 6.10 Marker rendering at 45k rows
- **Problem:** `applyFilters` destroys and recreates every marker (`clearMarkers` + `setLocations`), creates a new InfoWindow each time, and uses `google.maps.Marker`, which Google deprecated in Feb 2024 in favor of `AdvancedMarkerElement`. With "All" filters this is tens of thousands of DOM/canvas markers: slow first paint and filter apply, high memory on phones.
- **Fix:** switch to `AdvancedMarkerElement` (needs a Map ID; add `mapId` to config, load `marker` library) with the existing paddle icons as `<img>` content, plus `@googlemaps/markerclusterer` (self-host in `vendor/`, add to SW shell) so zoomed-out views show cluster bubbles. Create markers once at load, keyed by `db:rowid`; filters only add/remove from the clusterer. One shared InfoWindow. Route numbered markers and start/end markers move to Advanced Markers too (same zIndex rules).
- **Verify:** "All" filters load and pan smoothly on a mid-range phone; filter apply < 1 s; popup, Visit Details and route markers unchanged; fitBounds still works (the `count < 2000` guard can go).

### 6.11 Fewer Routes API calls per Optimize
- **Problem:** the fit-to-time loop ([optimize-route.js](optimize-route.js) ~216) can call the Routes API 3 times per Optimize (each billed as an advanced request), and can still end over the target after the 3rd try.
- **Fix:** before the first call, trim candidates with a cheap estimate: nearest-neighbour tour length from haversine × 1.3 (detour factor) ÷ mode speed (walk 4.5 km/h, drive 30 km/h) + 3 min per stop + return leg; keep the largest prefix that fits `targetMins`. Then call once; only loop if the real total is > 10% over. Show "~N min (over target)" if it still does not fit after the loop.
- **Verify:** log calls per Optimize over 10 runs in different areas: mostly 1; totals still within target.

### 6.12 Service worker update prompt; keep offline data across deploys
- **Problem:** stale-while-revalidate means a deploy needs "reload twice", and `DATA_CACHE` is named with `CACHE_VERSION`, so every deploy deletes the cached sheet data (offline after an update = no data).
- **Fix:** make the data cache name unversioned (`jowla-data`) and keep it in `activate`. In the page, listen for `registration.waiting`/`updatefound` and show a toast "New version available" with a "Reload" action that posts `SKIP_WAITING` and reloads on `controllerchange`; remove the unconditional `skipWaiting()` on install.
- **Verify:** deploy a version bump: toast appears on next visit, Reload shows the new version once; go offline after the update: data still loads from cache.

### 6.13 Refresh sheet data without reloading
- **Problem:** data loads once per page load; the installed PWA can stay open all day, so visits logged by others (or the form pipeline catching up) never show.
- **Fix:** "Refresh data" button in Route settings, and an automatic refresh on `visibilitychange` when the last load is > 30 min old (silent, only when online). Refresh re-runs the fetch, rebuilds `locations` (merging the 6.2 ledger), re-applies current filters without clearing the route, and keeps the viewport.
- **Verify:** change a test row in a sheet copy, tap Refresh: the marker/popup updates; route and done state are untouched.

### 6.14 Offline route list before Maps loads (handoff item 5)
- Render the saved route sheet from localStorage before the Maps JS API loads: split `showRoutePanel` so list/ETA/nav-link rendering does not touch `google` (only polyline/markers do), call it early from a small boot script, and attach map overlays when `initialiseMap` runs. If Maps fails to load (offline), keep the list and toast "Map unavailable offline; route list still works".
- **Verify:** DevTools Offline + reload with a saved route: list, Go links, Log and done toggles work; going online draws the map overlays.

### 6.15 One config + one version string (handoff item 6)
- **Problem:** the API key is duplicated in [map.js](map.js), [optimize-route.js](optimize-route.js) and [newindex.html](newindex.html); the sheet ID/range and the form URL/`ENTRY` ids are hard-coded; the version lives in `APP_VERSION`, nine `?v=` strings and `CACHE_VERSION`.
- **Fix:** move `apiKey`, `sheetId`, `sheetRange`, `formUrl`, `entry`, `mapId` and `version` into [config.js](config.js). Load the Maps script dynamically from config (no key in HTML). Add `tools/bump-version.js` (Node, no deps) that rewrites `config.js` version, every `?v=` in the HTML files and `CACHE_VERSION` in sw.js, and prepends a CHANGELOG heading. Update the release steps in the handoff and README.
- **Verify:** `grep` finds the key and version in one place each (plus generated `?v=`); `node tools/bump-version.js 0.19.0` produces a clean diff.

### 6.16 Remove jQuery
- jQuery 3.1.1 is used only for `$.getJSON` and `$.urlParam`, and that version has published CVEs (CVE-2019-11358, CVE-2020-11022/11023; not reachable from our usage, but it is dead weight in the shell cache). Replace with `fetch` and `URLSearchParams` (keep `parseCityParam` for the old `City==='X'` format), delete `vendor/jquery-3.1.1.min.js` and its SW/HTML references, and check index.html for other jQuery use first.
- **Verify:** filters via URL still work for old bookmark formats; no `$` references remain; offline shell still loads.

### 6.17 Unit tests for pure logic + CI
- **Fix:** move pure functions into node-loadable modules with the same UMD pattern as [segments.js](segments.js): `matchesFilters`/`parseCityParam`/`filtersToQuery` (filters.js), `findClusters` + `haversine` (geo.js), `buildFormBody` (already pure), the 6.11 estimator and the 6.4 ETA calculation. Add tests in `tests/` with synthetic data only (no real names or coordinates), a `tests/run.js` that runs them all, and a GitHub Actions workflow running `node --check` on every JS file plus the tests on push/PR.
- **Verify:** CI green on `main`; breaking a filter rule fails a test.

### 6.18 Shared city list for index.html
- index.html has a hard-coded list of ~50 cities while the map derives its list from the data, so they drift. Have index.html build its City select from the cached Sheets response (same URL as map.js, served by the SW data cache) with the static list as a fallback until data arrives; keep the selected value from `jowla-filters`.
- **Verify:** a city present in the data but not in the old list appears on both pages.

### 6.19 Travel mode from stop spacing
- `isDenseCluster` ([optimize-route.js](optimize-route.js) ~401) measures each stop's distance from the *start*, so optimizing a tight cluster you are driving to from 5 km away always picks DRIVE, and a spread-out set near your car can pick WALK. Decide from the median nearest-neighbour distance between the stops (walk if < 250 m and the cluster's diameter < 1.5 km), with a "Travel mode: Auto / Walk / Drive" setting to override.
- **Verify:** the cluster-from-afar case picks WALK; the override is respected and persisted.

### 6.20 Cluster empty state mentions active filters (handoff item 7)
- When no clusters are found and `currentFilters` has any value, the message says which filters are on (e.g. "Filters: City, Visited") with a "Clear filters" button; also mention the recent-visit window from Route settings.

### 6.21 Real PWA icons (handoff item 6)
- Replace the placeholder icons in `icons/` with a designed set (192, 512, 512 maskable with safe zone, 180 apple-touch); check the maskable one in Chrome's manifest preview.

### 6.22 Saved places for start/end (handoff item 8)
- Route settings "Places": save the current location or a searched address (reuse the end-picker search) under a name (Home, Masjid…), stored in localStorage `jowla-places`. Start = "My location" / a saved place; End = "Back to start" / a saved place / search. Feeds `optimizeCurrentView` (start) and `rerouteWithEnd` (end). Never commit real places to the repo.
- **Verify:** pick a saved start: route starts there; saved end: route ends there and nav links end there; deleting a place falls back to GPS / round trip.

### 6.23 Walk/drive path coloring
- Still deferred (see Step 7). Revisit only if 6.19 leads to per-leg modes.

### Ongoing (Cloud Console, owner)
- Besides HTTP-referrer restrictions, set **API restrictions** per key (Maps key: Maps JavaScript, Routes, Places (New), Geocoding; Sheets key: Sheets only) and a **daily quota cap** on the Routes API so a leaked key cannot run up a bill.

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

### Round 3 (DONE 0.15.0 except item 5 Apple "Steps": documented in the tour, needs iPhone test; address search needs Places/Geocoding enabled on the Maps key)
1. **Segment buttons side by side.** Replace the stacked full-width segment buttons with a compact grid: one row per app (label "Google Maps" / "Apple Maps") and a flex-wrap row of small buttons "1", "2", "3"... (each opens that segment; tooltip/aria "Stops a-b"). Single-segment routes show one button per app. Preferred app first. Files: `optimize-route.js` (`showRoutePanel`), `map.css`.
2. **End point by address.** "Set a different end point…" opens an input (not a stop list) where the user types an address/place. Resolve with the Maps JS `google.maps.Geocoder` (or Places Autocomplete, restricted to the current region and loaded with the existing key; check the free tier and that Places/Geocoding is enabled on the key) and show suggestions. On selection, store `route.end = {lat, lng, name}` (not a stop; reuse the 0.12.0 end-row/nav-URL path via `end` and `navStops`) and re-run `requestRoute` with that destination. Optional shortcuts: "Use my current location" and recent ends saved in localStorage. Keep "Reset: return to start". Remove the stop picker (`#end-picker`, `rerouteWithEnd(idx)` becomes `rerouteWithEnd(endPoint|null)`).
3. **Optimize button as an icon.** Replace the "Optimize" pill (`#optimize-fab`) with a round icon FAB (route/sparkle/play glyph or inline SVG) matching the other FABs, with `aria-label` and `title` "Optimize nearby"; keep the busy state as a spinner. The "Optimize" text button inside Route settings stays.
4. **First-time walkthrough tour.** Short coach-mark tour shown once (localStorage `jowla-tour-done`), with Next/Skip and a "Replay tour" button in Route settings: (1) filters FAB, (2) suggest clusters, (3) optimize icon, (4) route sheet: Go / Log / done toggle, (5) end point and maps app choice. Implement as small `tour.js` (no deps): dimmed overlay with a spotlight around the target element, tooltip card, 44px buttons, works at 390px, re-positions on resize. Mark done on finish or skip.
5. **Apple Maps launch shows "Steps" instead of "Go".** Apple Maps opens the route overview with a Steps button rather than starting navigation. Investigate the URL: for single-destination links use `https://maps.apple.com/?daddr=LAT,LNG&dirflg=d` (already used for Go); for multi-stop `maps.apple.com/directions` links Apple shows the overview and the user must tap Go. Options: (a) accept and tell the user in the tour/tooltip, (b) try `http://maps.apple.com/?saddr=Current+Location&daddr=...&dirflg=d` or the `maps://` scheme on Apple devices, (c) for the Go pill and per-row Go use the single-stop link so navigation starts directly, reserving multi-stop links for the segment buttons. Test on iPhone before choosing.

### Round 4 (DONE 0.15.1-0.17.0; Apple fix = drop fixed `source`, confirm on phone)
Note: Places and Geocoding are confirmed enabled on the Maps key, so the address end point should work; verify it on the phone. Screenshots received and reviewed (findings added under each item).

1. **Apple Maps landing screen.** Screenshot findings: Apple opens a "Directions" overview with start and end both set to the same street address (so the round trip end now works), "12 stops", 28 min / 7.1 mi, and only a **Steps** button. Apple Maps does not offer a Go/start button for multi-stop routes, so this is Apple's behavior, not a bug in our URL; there is no URL fix. Decision: use single-stop `daddr` links for anything that should start turn-by-turn (Go pill, row Go, Apple "Start" primary = first stop), and relabel multi-stop Apple segment buttons "Overview" with the tour note "tap Steps". Also check why the overview says 12 stops when the route has 15 (segment boundary or deduped points). Capture what Apple Maps shows after launching a route (screenshots to be reviewed). Goal: user lands ready to navigate. Test URL variants on iPhone: `https://maps.apple.com/?saddr=Current%20Location&daddr=LAT,LNG&dirflg=d` (single stop), `maps://?...`, and multi-stop `directions?...&waypoint=` forms; compare whether each shows Go or only Steps. Per-row/pill Go should use whichever form starts navigation directly; segment buttons keep multi-stop links and the tour/tooltip says to tap Go.
2. **Google Maps segment 2 loads forever.** Screenshot confirms the Google Maps iOS app stuck on "Loading..." with an empty bottom sheet and a blue my-location dot (it never resolved the route; the origin is omitted so it waits for/cannot use location, or the waypoint encoding is rejected). Prefer testing first: segment 2 with an explicit `origin=LAT,LNG` of the previous destination plus raw `lat,lng` waypoints joined by `|`. Still reproduces after 0.14.0 (screenshot to be reviewed). Hypotheses to test, one at a time on Android and iOS: (a) the app cannot resolve "Your location" origin when `origin` is omitted, so pass the previous segment's destination as `origin` again but as `origin=LAT,LNG` with no `origin_place_id` and without `&waypoints` pipes encoded twice (check `%7C` vs literal `|`; the 0.14.0 change encodes each waypoint with `encodeURIComponent`, which turns the comma into `%2C` and may break parsing, so try raw `lat,lng`); (b) lower waypoints per segment from 9 to 8 or use `dir/LAT,LNG/LAT,LNG/...` path-style URLs for segments; (c) open segment 2 in the browser vs app to isolate. Add the winning format to `tests/segments.test.js`.
3. **Route sheet collapses after switching apps.** Screenshots confirm: before leaving, the sheet is half open with the stop list; on returning it is at peek (map showing, list hidden). Also note the Safari bottom toolbar overlaps the bottom of the half-open sheet, so add bottom padding/`env(safe-area-inset-bottom)` and size the sheet with `dvh` so the last rows are not covered. Returning to the Jowla map forces the sheet to `peek` (the `visibilitychange` handler in `optimize-route.js` calls `setSheet('peek')` and `updateDoneUi` rebuilds content). The sheet must stay exactly as it was: remove the forced `peek`, persist sheet state (`peek/half/full`) and scroll position in memory and `sessionStorage`, restore on `visibilitychange`/`pageshow`, and make sure a page reload by the OS (Safari/Android discarding the tab) restores the same state via `restoreLastRoute`. Also keep the open filter/cluster sheets as they were. Verify: open full sheet, switch to Maps and back, sheet height and scroll unchanged.
4. **Verify address end point** on the phone now that Places/Geocoding are enabled: autocomplete suggestions appear above the sheet (`.pac-container` z-index), choosing one re-optimizes, reset works.

### Round 5 (item 1 DONE 0.16.1 via Places API (New); item 2 done)
1. **End point search fails.** Screenshot: typing in "Set a different end point" shows Google's dialog "This page can't load Google Maps correctly. Do you own this website?" (the Places Autocomplete request is rejected, so no suggestions). The map itself loads, so the key works for Maps JS but not for Places. Check in Google Cloud Console for the key used in `newindex.html`: (a) API restrictions include **Maps JavaScript API and Places API** (the "Places API" legacy service used by `google.maps.places.Autocomplete`; if only "Places API (New)" is enabled, the legacy widget fails); (b) HTTP referrer restrictions include `https://furqankhan123.github.io/*`; (c) billing is enabled on the project. Code side: stop relying on the widget alone: on error (`gm_authFailure` / no suggestions) fall back to the Geocoder "Set end" button, and show a toast "Address search unavailable"; consider switching to the Places (New) `PlaceAutocompleteElement` or the Geocoding API only. Also make the picker usable with the keyboard open (scroll the input into view, the dialog covered the field).
2. **Privacy: keep personal addresses out of the repo.** The street address seen in the Apple Maps screenshot was written into `PLAN.md` by mistake. It was removed from the file and from git history (history rewritten and force-pushed to `main` and the working branch). Rule going forward: never put real addresses, names or coordinates from screenshots into the repo, docs or commit messages. Old commit SHAs may stay reachable on GitHub until GitHub garbage-collects; to purge them immediately, contact GitHub Support or delete and recreate the repository.

## Suggested workflow once live
1. Open the map and tap **Optimize** (or set a custom start first).
2. Tap **Go: N. Name** and follow the route.
3. Tap **Log visit ✓**; the form opens and the stop is marked done.
4. Return to the map; the next **Go** button is ready. Undo from the toast if needed.

## Future integration notes
- The feature is client-side only and reuses the already-loaded `locations` array, so it works with the current sheetrock / Sheets API loading path.
- If the map later moves to a different data source, only the location objects need to keep `latitude`, `longtitude`, `visitdate`, and `name`/`address`.
- API key should remain restricted by HTTP referrer for security.
