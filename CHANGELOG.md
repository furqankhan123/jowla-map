# Changelog

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
