# Changelog

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
