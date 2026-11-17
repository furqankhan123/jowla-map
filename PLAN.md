# Jowla Map — Optimize Nearby Route Plan

## Goal
Reduce manual “pick next nearby pin” work on the dailyfikr map.  
Generate an ordered route of nearby unvisited stops that prefers walking in dense clusters and aims to fit as many visits as possible into ~1 hour, while staying inside the Google Maps free tier.

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

Done: 1 (unvisited filter), 2 (custom start), 3 (numbered markers), 5 (fit-to-time), 6 (ETAs, persisted route, settings).
Still open: 3 (walk/drive path coloring), 4 (cluster suggestions), 6 ("Mark visited" sheet write-back).

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

## Suggested workflow once live
1. Open the map for the desired city/area.
2. Tap **Optimize Nearby** (or set a custom start first).
3. Review the ordered list and total time in the side panel.
4. Tap **Open in Google Maps** and follow the route.
5. After each visit, use the existing Visit Details link to log the outcome.

## Future integration notes
- The feature is client-side only and reuses the already-loaded `locations` array, so it works with the current sheetrock / Sheets API loading path.
- If the map later moves to a different data source, only the location objects need to keep `latitude`, `longtitude`, `visitdate`, and `name`/`address`.
- API key should remain restricted by HTTP referrer for security.
