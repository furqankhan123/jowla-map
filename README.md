# Jowla Map

A visit-planning map for DFW, driven by a Google Sheet and hosted as static pages (GitHub Pages). Markers come from the sheet; **Optimize** builds an ordered, numbered route of nearby unvisited stops.

## Objective

> I want to reduce the time in clicking around the app. mainly finding a marker, opening it in my nav app, then filling the visit details, and then finding the next marker to visit.

The loop this targets, and how each feature shortens it:

| Step | Before | Now |
|---|---|---|
| Find a marker | Pan/zoom and tap pins | **Optimize** picks nearby unvisited stops and numbers them |
| Navigate | Open each pin's infowindow | **Go: N. Name** button, Google/Apple Maps handoff |
| Log the visit | Open the form, then mark progress by hand | **Log visit ✓** opens the form and marks the stop done |
| Next marker | Find it again | The primary button immediately shows the next stop |

## Features
- Filters home page (`index.html`) and the map (`newindex.html`).
- Optimize (icon button) via the Routes API: walking in dense clusters, driving otherwise; Do-Not-Visit rows excluded; round trip back to the start by default, or finish at an address you type.
- Numbered route markers, ETAs per stop, fit-to-time (30/45/60 min), in-map filters and cluster suggestions.
- Visit → Next flow with Undo toast; done state persists across reloads.
- Google Maps and Apple Maps handoff (preferred app setting; routes split into numbered segments).
- First-run walkthrough tour; installable PWA.
- Mobile-first bottom sheet (peek/half/full); a list button reopens a closed route sheet.
- Quick-log chips (No Response / Left Message / Gave Targheeb) under the next stop submit the public Visit Details Google Form directly (no setup, offline queue); the sheet records the visit via the owner's existing form pipeline.
- Map camera control shown bottom-left on desktop (hidden on touchscreens).

## A typical session
1. Open `newindex.html`, tap **Optimize**.
2. Tap **Go: 1. Name** and drive/walk there.
3. Tap **Log visit ✓**, fill the form, come back; the sheet shows **Go: 2. …**.
4. Repeat. Undo from the toast if you logged the wrong stop.

## Files
- `index.html`: filters home page
- `newindex.html`: map page
- `map.js`: sheet loading, markers, infowindow
- `optimize-route.js`: Optimize, route panel, Log → Next, end point, settings
- `segments.js`, `nav.js`: Google/Apple URL builders (tested in `tests/`) and the preferred-app helper
- `cluster.js`, `writeback.js`, `tour.js`, `config.js`, `sw.js`: clusters, quick-log sync, tour, deployment config, service worker
- `apps-script/Code.gs`: optional relay for confirmed quick-log delivery (not needed; direct mode works)
- `map.css`: styles
- `PLAN.md`: roadmap and **session handoff** (start here to continue work)
- `CHANGELOG.md`: release notes

## Setup and deploy
Static hosting only; push to GitHub Pages. `map.js` reads sheet range `DFWDB!A2:V` with these columns (0-indexed): 0 db, 2 id, 3 name, 4 address, 5 latitude, 6 longitude, 7 city, 8 zip, 11 unit, 12 marker, 13 status, 14 visit code, 15 comments, 16 visit date, 21 row id. The Maps/Sheets API key must stay HTTP-referrer restricted.

## Tests
`node tests/segments.test.js`

## Releasing
Bump `APP_VERSION` in `optimize-route.js` and the `?v=` strings in `newindex.html`, update `CHANGELOG.md`, then tag `vX.Y.Z` (annotated) and push with `--follow-tags`.
