/**
 * Jowla Map optional relay (standalone; no sheet access needed).
 *
 * Setup: script.google.com > New project, paste this file.
 *  1. Project Settings > Script Properties > TOKEN = a long random string.
 *  2. Deploy > New deployment > Web app > Execute as: Me, Access: Anyone.
 *  3. Paste the /exec URL and token into Route settings > Sheet sync.
 *
 * Request: POST (text/plain) JSON
 *   { token, db, rowid, name, visitcode, sts }
 * Forwards to the public Visit Details Google Form and reports its HTTP status.
 * Keep FORM_URL / ENTRY in sync with writeback.js.
 */
var FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSe_TQfBBhpLky9XyTz0SuSsJpcgfF61pS8onUX4RgQxEITOpA/formResponse';
var ENTRY = { db: 'entry.647159166', rowid: 'entry.589985326', name: 'entry.459245489',
  code: 'entry.607683347', status: 'entry.1275295467', lang: 'entry.2108730671', comments: 'entry.322317336' };
var ALLOWED_CODES = ['No Response', 'Left Message', 'Gave Targheeb'];

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || body.token !== token) return json_({ ok: false, error: 'unauthorized' });

    var rowid = parseInt(body.rowid, 10);
    var code = String(body.visitcode || '');
    if (!rowid || rowid < 2) return json_({ ok: false, error: 'bad rowid' });
    if (ALLOWED_CODES.indexOf(code) === -1) return json_({ ok: false, error: 'bad visitcode' });

    var parts = [];
    function add(k, v) { parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v)); }
    add(ENTRY.db, String(body.db || ''));
    add(ENTRY.rowid, String(rowid));
    add(ENTRY.name, String(body.name || ''));
    add(ENTRY.code, code);
    String(body.sts || '').split(',').forEach(function (x) { x = x.trim(); if (x) add(ENTRY.status, x); });
    add(ENTRY.lang, '');
    add(ENTRY.comments, '');

    var res = UrlFetchApp.fetch(FORM_URL, {
      method: 'post', payload: parts.join('&'),
      contentType: 'application/x-www-form-urlencoded',
      muteHttpExceptions: true, followRedirects: false
    });
    var status = res.getResponseCode();
    if (status === 200 || status === 302) return json_({ ok: true, status: status });
    return json_({ ok: false, error: 'form ' + status });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
