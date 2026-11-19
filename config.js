/* Deployment config: the single place for keys, sheet, form and version.
   This file is public (GitHub Pages): keep both API keys HTTP-referrer and API restricted.
   `version` is rewritten by tools/bump-version.js (do not edit by hand).
   Keep formUrl / entry in sync with apps-script/Code.gs and VisitDetails.html.
   mapId is the Cloud Console Map ID used for Advanced Markers. */
window.JOWLA_CONFIG = {
  version: '0.24.5',
  apiKey: 'AIzaSyBWKjSZa8wcaEEqUrjk-opBhmEVxd6GbPQ',      // Maps JavaScript, Routes, Places (New), Geocoding
  sheetsKey: 'AIzaSyBWKjSZa8wcaEEqUrjk-opBhmEVxd6GbPQ',   // Sheets (read only)
  mapId: 'de08d2ec96ce5eb259d881cb',   // Advanced Markers (public, not a secret)
  sheetId: '1U7JJDnTvClhdpHCje29uLwTNCiBhdPfUPxzChbxoXNQ',
  sheetRange: 'DFWDB!A2:V',
  formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSe_TQfBBhpLky9XyTz0SuSsJpcgfF61pS8onUX4RgQxEITOpA/formResponse',
  entry: { db: 'entry.647159166', rowid: 'entry.589985326', name: 'entry.459245489',
    code: 'entry.607683347', status: 'entry.1275295467', lang: 'entry.2108730671', comments: 'entry.322317336' },
  syncUrl: '',   // OPTIONAL relay URL (quick-log works without it, direct to the Google Form)
  syncToken: ''  // shared secret from Script Properties
};
