// 52 ACYR Shirt Orders -> Google Sheet (Google Apps Script)
//
// What it does: each submitted order is appended as one row to a Google Sheet,
// marked "Unpaid". You just flip the Status cell to "Paid" when they pay with
// their registration. It also emails a notification so you see new orders.
//
// SETUP (one time, ~2 minutes):
// 1. Go to https://script.google.com  (sign in as info@saltspringcentre.com so
//    the notification email sends from that account)
// 2. New project -> delete the default code -> paste this entire file
// 3. Deploy > New deployment
// 4. Type = "Web app"
// 5. Execute as: "Me"
// 6. Who has access: "Anyone"
// 7. Deploy, authorize when prompted
// 8. Copy the Web app URL and paste it into acyr52/index.html as the value of
//    ORDER_SHEET_URL (near the top of the <script> block).
//
// The Sheet "52 ACYR Shirt Orders" is created automatically in your Drive on the
// first order. Columns: Timestamp | Name | Email | Order | Shirts | Subtotal |
// GST | Total | Status | Notes.

var SHEET_NAME   = '52 ACYR Shirt Orders';
var NOTIFY_EMAIL = 'info@saltspringcentre.com';  // who gets the new-order email

function getSheet() {
  var ss, files = DriveApp.getFilesByName(SHEET_NAME);
  if (files.hasNext()) ss = SpreadsheetApp.open(files.next());
  else ss = SpreadsheetApp.create(SHEET_NAME);
  var sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Timestamp','Name','Email','Order','Shirts','Subtotal','GST','Total','Status','Notes']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var order = (d.items || []).join('\n');
    var sh = getSheet();
    var sheetUrl = sh.getParent().getUrl();
    sh.appendRow([
      new Date(),
      d.name || '',
      d.email || '',
      order,
      d.count || '',
      '$' + (d.subtotal || ''),
      '$' + (d.gst || ''),
      '$' + (d.total || ''),
      d.status || 'Unpaid',
      d.notes || ''
    ]);

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail(
        NOTIFY_EMAIL,
        '52 ACYR shirt order (UNPAID) — ' + (d.name || ''),
        'New shirt order, marked UNPAID in the "' + SHEET_NAME + '" sheet.\n\n' +
        'Name: ' + (d.name || '') + '\n' +
        'Email: ' + (d.email || '') + '\n\n' +
        order + '\n\n' +
        'Subtotal: $' + (d.subtotal || '') + '\n' +
        'GST (5%): $' + (d.gst || '') + '\n' +
        'Total: $' + (d.total || '') + '\n' +
        (d.notes ? ('\nNotes: ' + d.notes + '\n') : '') +
        '\nPayment: with retreat registration.\n\n' +
        'Sheet: ' + sheetUrl
      );
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('52 ACYR shirt order endpoint is live.');
}
