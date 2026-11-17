/**
 * Jowla Map write-back endpoint.
 *
 * Setup (one time, by the sheet owner):
 *  1. Open the Google Sheet > Extensions > Apps Script, paste this file.
 *  2. Project Settings > Script Properties > add TOKEN = a long random string.
 *  3. Deploy > New deployment > type "Web app" > Execute as: Me,
 *     Who has access: Anyone. Copy the /exec URL.
 *  4. In the Jowla Map route settings, paste the URL and the same token
 *     into "Sync URL" and "Sync token".
 *
 * Request: POST (Content-Type text/plain) with a JSON body
 *   { "token": "...", "rowid": 123, "visitcode": "No Response", "visitdate": "October 25, 2026" }
 * Writes visitcode to column O and visitdate to column Q of sheet DFWDB.
 * Column V holds the row number ("rowid"); the row is checked against it.
 */
var SHEET_NAME = 'DFWDB';
var COL_VISITCODE = 15; // O
var COL_VISITDATE = 17; // Q
var COL_ROWID = 22;     // V
var ALLOWED_CODES = ['No Response', 'Left Message', 'Gave Targheeb'];

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || body.token !== token) return json_({ ok: false, error: 'unauthorized' });

    var rowid = parseInt(body.rowid, 10);
    var code = String(body.visitcode || '');
    var date = String(body.visitdate || '');
    if (!rowid || rowid < 2) return json_({ ok: false, error: 'bad rowid' });
    if (ALLOWED_CODES.indexOf(code) === -1) return json_({ ok: false, error: 'bad visitcode' });
    if (!/^[A-Za-z]+ \d{1,2}, \d{4}$/.test(date)) return json_({ ok: false, error: 'bad visitdate' });

    lock.waitLock(20000);
    var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (rowid > sheet.getLastRow()) return json_({ ok: false, error: 'row out of range' });

    // Safety: the row's own id cell must match, otherwise search for it.
    var row = rowid;
    if (String(sheet.getRange(row, COL_ROWID).getValue()) !== String(rowid)) {
      var ids = sheet.getRange(2, COL_ROWID, sheet.getLastRow() - 1, 1).getValues();
      row = -1;
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(rowid)) { row = i + 2; break; }
      }
      if (row < 0) return json_({ ok: false, error: 'rowid not found' });
    }
    sheet.getRange(row, COL_VISITCODE).setValue(code);
    sheet.getRange(row, COL_VISITDATE).setValue(date);
    return json_({ ok: true, row: row });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
