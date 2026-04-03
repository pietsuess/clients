// SSCY Community Dashboard - Google Sheet Sync
//
// SETUP:
// 1. Create a Google Sheet called "SSCY Community Dashboard"
// 2. Create 3 tabs (sheets) named exactly: Hiring, Announcements, Meetings
// 3. Add header rows:
//
//    Hiring tab:        Title | Description | Contact | Active
//    Announcements tab: Title | Body | Priority | Date
//    Meetings tab:      Name | Day | Time | Location | Facilitator | Notes
//
// 4. Add your data rows below the headers
// 5. Go to Extensions > Apps Script
// 6. Delete the default code, paste this entire file
// 7. Click "Deploy" > "New deployment"
// 8. Type = "Web app"
// 9. Execute as: "Me"
// 10. Who has access: "Anyone"
// 11. Click "Deploy", authorize when prompted
// 12. Copy the Web app URL and paste it into the dashboard
//
// To update content: just edit the spreadsheet. Changes appear on next page load.
// No admin panel, no JSON files, no extra tools.

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {};

  // --- HIRING ---
  var hiringSheet = ss.getSheetByName('Hiring');
  result.hiring = [];
  if (hiringSheet) {
    var hiringData = hiringSheet.getDataRange().getValues();
    for (var i = 1; i < hiringData.length; i++) { // skip header row
      var row = hiringData[i];
      if (!row[0]) continue; // skip empty rows
      var active = String(row[3]).toLowerCase();
      if (active === 'no' || active === 'false' || active === '0') continue; // skip inactive
      result.hiring.push({
        title: row[0],
        description: row[1],
        contact: row[2] || ''
      });
    }
  }

  // --- ANNOUNCEMENTS ---
  var annSheet = ss.getSheetByName('Announcements');
  result.announcements = [];
  if (annSheet) {
    var annData = annSheet.getDataRange().getValues();
    for (var i = 1; i < annData.length; i++) {
      var row = annData[i];
      if (!row[0]) continue;
      result.announcements.push({
        title: row[0],
        body: row[1],
        priority: row[2] || 'normal',
        date: row[3] ? Utilities.formatDate(new Date(row[3]), 'America/Vancouver', 'yyyy-MM-dd') : ''
      });
    }
  }

  // --- MEETINGS ---
  var meetSheet = ss.getSheetByName('Meetings');
  result.meetings = [];
  if (meetSheet) {
    var meetData = meetSheet.getDataRange().getValues();
    for (var i = 1; i < meetData.length; i++) {
      var row = meetData[i];
      if (!row[0]) continue;
      result.meetings.push({
        name: row[0],
        day: row[1],
        time: row[2],
        location: row[3] || '',
        facilitator: row[4] || '',
        notes: row[5] || ''
      });
    }
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
