# Changelog

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
