# Changelog

## [0.26.1]
- Route view: show only the route's stops as their original status pins (number chip on each), instead of green dots

## [0.26.0]
- Route view: numbered stops now carry their original status pin as a badge so each visit's status is identifiable

## [0.25.4]
- Shorten cluster marker overlap to 150ms to reduce lag

## [0.25.3]
- Lighter cluster circles (styled div instead of SVG) to reduce pan lag

## [0.25.2]
- Keep old cluster markers on screen ~300ms until the new ones appear (cluster flicker)

## [0.25.1]
- Stop re-rendering every cluster marker on each small pan (cause of marker flicker)

## [0.25.0]
- Clear route button; typeable city filter on the main page

## [0.24.14]
- Show address line 1 under the Next stop in the route header

## [0.24.13]
- Keep route list closed on reopen, show address line 1 under stop names, reduce marker flicker

## [0.24.12]
- Lazy map markers (no crash on All) and city typeahead in filters

## [0.24.11]
- Filters page fetches only the city column (fix 0.24.9 regression)

## [0.24.10]
- Rename newindex.html to map.html

## [0.24.9]
- Fetch only the sheet columns the app uses (batchGet)

## [0.24.8]
- PII guard in tests

## [0.24.7]
- Desktop Minimize really collapses the route card; maybe-rental popups hide the automation comment and date; a locally logged maybe-rental stop counts as visited

## [0.24.6]
- Desktop: keep floating buttons visible when the route panel is expanded

## [0.24.5]
- Respect hide-other-pins on data refresh/filter; title-case + maybe-rental tag in popup

## [0.24.4]
- Guard clusterer render before the map projection is ready (cold-load 'Could not load stops')

## [0.24.3]
- Silent retry on stop-load failure, 10% trimmed fit

## [0.24.2]
- Truncate long end name in summary, fresh Next ETA, trimmed fit bounds for filtered views

## [0.24.1]
- Hide other pins redraws immediately after a fresh route

## [0.24.0]
- 7.10: experimental Fewer U-turns setting (turn detector + street sweep)

## [0.23.4]
- Use SuperClusterViewportAlgorithm so only viewport markers are attached

## [0.23.3]
- Only viewport markers attached at high zoom (clusterer maxZoom shortcut)

## [0.23.2]
- Fix marker popup: gmpClickable for gmp-click

## [0.23.1]
- 7.12: gmp-click, loading=async, toast fix, quickLog ledger

## [0.23.0]
- 7.9: Stop choice setting (Nearest / Most visits per hour)

## [0.22.2]
- 7.8: GPS heading on origin and sideOfRoad on stops for driving (falls back to a plain request on 400)

## [0.22.1]
- Shorter summary count (14/15 stops)

## [0.22.0]
- Round 7.1-7.7, 7.11: auto-rental rows ranked last, Next line above Go/Log, shorter summary, route pins above clusters, bigger done toggle, start source, title case names

## [0.21.4]
- Fix offline data: the service worker now actually saves the sheet response (the old streaming write failed silently), and a failed data load still restores the saved route list.

## [0.21.3]
- Service worker installs fetch fresh copies (bypassing the browser HTTP cache) so an update never caches stale files.

## [0.21.2]
- Fix: an unfiltered map no longer zooms out to the whole world (a few rows have coordinates far from DFW); a saved world-level view is ignored.

## [0.21.1]
- Travel mode now defaults to Drive (saved Auto settings are switched once); the Places address field suggests addresses as you type, like the end-point picker.

## [0.21.0]
- Advanced Markers with clustering (Map ID in config.js, self-hosted markerclusterer): markers are created once per row and filters only add or remove them from the clusterer; route, start and location markers moved to Advanced Markers.

## [0.20.0]
- Saved places (this browser only): save your location or an address under a name in Route settings, then pick them as the route start or end; deleting a place falls back to your location / round trip.

## [0.19.14]
- New app icons (pin with a dotted route): 192, 512, a full-bleed maskable 512 with safe zone, and the 180 apple-touch icon; regenerate with tools/make-icons.py.

## [0.19.13]
- Cluster suggestions: the empty state names the active filters and the recent-visit window, with a Clear filters button.

## [0.19.12]
- Walk or drive is now chosen from how close the stops are to each other (not distance from you), with an Auto / Walk / Drive setting in Route settings.

## [0.19.11]
- index.html adds any city found in the sheet data that is missing from its static list (works offline from the cached data).

## [0.19.10]
- Pure logic moved to logic.js with unit tests (filters, ETAs, tour estimate, clusters, haversine); tests/run.js plus a GitHub Actions workflow run syntax checks and all tests.

## [0.19.9]
- jQuery removed (fetch plus the existing regex URL parser); old URL filter formats still work.

## [0.19.8]
- Single config.js now holds the API keys, sheet, form and version; Maps loads from config; tools/bump-version.js bumps every version string.

## [0.19.7]
- If Google Maps cannot load (offline), the saved route list, Go links, Log and done toggles still appear after a few seconds.

## [0.19.6]
- Refresh data button in Route settings, plus a silent refresh when the app returns to the foreground after 30 minutes; current filters, viewport and route are kept.

## [0.19.5]
- Service worker updates are no longer forced: a New version available toast with Reload appears; the cached sheet data is kept across deploys so offline mode still has data after an update.

## [0.19.4]
- Optimize usually needs one Routes API call: stops are pre-trimmed with a free distance estimate, a second call only happens if the real total is over 10 percent past the target, and an over-target result is flagged.

## [0.19.3]
- Faster filtering: names, statuses and visit dates are parsed once at load, bounds checks are numeric, and the name filter count is debounced.

## [0.19.2]
- Removed leftover Set as start text and code; settings show your location as the start (a saved custom start can still be cleared); done toggle on a row now also records the visit locally; route renders once.

## [0.19.1]
- Map appears immediately at your last view with a Loading stops message; a failed data load shows an error with Retry instead of a blank page.

## [0.19.0]
- Optimize during a route in progress now asks: re-plan the remaining stops from your position (done stops kept), start a new route, or cancel. When all stops are done, "Find more stops" appears.

## [0.18.9]
- ETAs and the "ends at" time now count from now starting at the first undone stop; done stops show a check mark; refreshed on every done/undo and each minute.

## [0.18.8]
- Quick-log holds each submission 7 s; Undo within that window cancels it (nothing is sent). After that, Undo says to use Visit Details.

## [0.18.7]
- Visited filter "More than 30/90/180 days" now includes never-visited stops (owner decision, plan 6.8).

## [0.18.6]
- Visits logged on this device are remembered locally (jowla-local-visits, 30 days) so Optimize does not offer them again, even after a reload; Undo removes them.

## [0.18.5]
- Quick-log: double taps no longer log the next stop (1.5 s cooldown, 10 s per-stop guard, next chips fade in).

## [0.18.4]
- Quick-log now submits like the real Visit Details form: a GET with the fields in the query string, and no empty Language/Comments (empty checkbox values caused 400).

## [0.18.3]
- Quick-log sends the form fields as FormData (multipart) instead of a urlencoded body.

## [0.18.2]
- Camera control moved to the bottom-left so it is not covered by the buttons and route list.
- New list button reopens a closed route sheet.

## [0.18.1]
- Map camera control is shown again on non-touch devices (desktop); still hidden on touchscreens.

## [0.18.0]
- Quick-log now posts through the public Visit Details Google Form: no owner access or deploy needed; current Status values are resent so they are not wiped.
- `apps-script/Code.gs` is now an optional standalone relay (confirmed delivery); set `syncUrl`/`syncToken` in `config.js` to use it. Quick-log toggle under `?admin=1` Sheet sync.

## [0.17.0]
- Apple Maps links no longer pass a fixed `source`, so Apple starts from Current Location and shows Go (a fixed start only offers Steps).
- Hid Google's camera/pan control button on the map.
- Docs refreshed (README, PLAN handoff).

## [0.16.2]
- Closing the route sheet while half/full open no longer hides the floating buttons.

## [0.16.1]
- End point search uses Places API (New) (`AutocompleteSuggestion`) instead of the legacy widget; legacy Places is unavailable for new projects. Geocoder fallback kept.

## [0.16.0]
- Google segment fix confirmed.
- Apple multi-stop buttons labelled as an overview (Apple offers only Steps for multi-stop routes); Go pill and row Go use single-stop links that start navigation; tour text updated.

## [0.15.1]
- Route sheet keeps its size and scroll when switching apps and back (no forced collapse); extra bottom padding clears the browser toolbar.
- Google segment links: raw `lat,lng` waypoints joined by `|` and explicit origin on later segments (attempt at the infinite "Loading...").

## [0.15.0]
- Segment links as compact numbered buttons, one row per app.
- Different end point by address (Places Autocomplete/Geocoder) or current location; stop picker removed.
- Optimize button is now an icon.
- First-run walkthrough tour (`tour.js`) with Replay in settings.

## [0.14.0]
- Rows decluttered (Log + Go only); one "Set a different end point…" button with a stop picker below the list.
- Segment builders moved to `segments.js` with tests (`node tests/segments.test.js`): no repeated stops, later segments omit the origin so Google/Apple use your location.

## [0.13.0]
- Marker popup: only Navigate (preferred app) and Visit Details.
- Route end always defaults to the start; per-row "End here" re-optimizes so the route finishes at that stop, with a reset button. Old saved routes default to a round trip.
- All Google/Apple segments listed in the sheet (segment 1 was missing).
- Quick-log needs no user setup: `config.js` holds the URL/token; manual form only with `?admin=1`.
- Cluster list no longer shows a name; filter/cluster close button enlarged.

## [0.12.0]
- Route start/end: "Set as end" in the marker popup, end marker, round trip by default; total time and ETAs include the final leg; nav links end at the end point.
- Route settings and Sheet sync styled as buttons.

## [0.11.0]
- Apple Maps restored on all platforms: shared `nav.js` (`navLinks`), "Preferred maps app" setting, popup and route rows show both apps, Apple routes split into 15-stop segments; `isIOS` removed.

## [0.10.0]
### Added
- Quick log: No Response / Left Message / Gave Targheeb buttons under the next stop write the visit code and date to the sheet (shortcut beside Visit Details). Offline writes are queued and retried.
- Apps Script endpoint source in `apps-script/Code.gs`; URL and token entered under Route settings > Sheet sync.

## [0.9.0]
### Added
- Cluster suggestions: the ✦ button lists the densest groups of eligible stops in view; tap to highlight, or Optimize to route just that cluster.

## [0.8.0]
### Added
- PWA: web manifest, icons, and a service worker (app shell cached; Sheets data network-first with cached fallback). Installable to the home screen.
- jQuery is self-hosted so the shell loads offline. The Maps JS API still needs a connection.

## [0.7.0]
### Added
- In-map filter sheet (City/Status/Visited/Name) with live count; updates the URL and remembered filters, clears the current route.
### Fixed
- FABs no longer overlap the route sheet; peek sheet sizes to its content.
- Marker popup no longer shows a blank header band; added a close button.

## [0.6.0]
### Added
- Visit → Next flow: **Log visit ✓** opens VisitDetails and marks the stop done; the next stop appears immediately, with an Undo toast.
- Visit links in the stop list and the infowindow also mark route stops done.
- Sheet peeks open on return to the tab so **Go** for the next stop is ready.
- App version shown in settings; asset cache-bust tied to the version.

## [0.5.0]
### Added
- Filters home page; Optimize via the Routes API; Do-Not-Visit exclusion.
- Google Maps segments and Apple Maps multi-stop support; minimize panel.
- Settings (unvisited window), custom start, numbered markers, fit-to-time, ETAs, route persistence.
- Mobile-first UI: bottom sheet, FABs, toasts, done/next-stop tracking.
