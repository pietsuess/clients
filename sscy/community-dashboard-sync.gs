// SSCY Community Dashboard - Google Sheet Sync
//
// SETUP:
// 1. Go to https://script.google.com
// 2. Click "New project", name it "SSCY Community Dashboard Sync"
// 3. Delete the default code, paste this entire file
// 4. Click "Deploy" > "New deployment"
// 5. Type = "Web app"
// 6. Execute as: "Me"
// 7. Who has access: "Anyone"
// 8. Click "Deploy", authorize when prompted
// 9. Copy the Web app URL
//
// That's it. The spreadsheet, tabs, and headers are created automatically
// on first request. Just start adding rows.

var SHEET_NAME = 'SSCY Community Dashboard';

function getOrCreateSpreadsheet() {
  var files = DriveApp.getFilesByName(SHEET_NAME);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }

  // Create spreadsheet with all tabs and headers
  var ss = SpreadsheetApp.create(SHEET_NAME);

  // Hiring tab (Sheet1 renamed)
  var hiring = ss.getSheets()[0];
  hiring.setName('Hiring');
  hiring.getRange('A1:D1').setValues([['Title', 'Description', 'Contact', 'Active']]);
  hiring.getRange('A1:D1').setFontWeight('bold').setBackground('#1a5c53').setFontColor('#ffffff');
  hiring.setColumnWidth(1, 200);
  hiring.setColumnWidth(2, 300);
  hiring.setColumnWidth(3, 200);
  hiring.setColumnWidth(4, 80);
  // Sample data
  hiring.getRange('A2:D4').setValues([
    ['Dish Room Lead', 'Part-Time position.', '', 'yes'],
    ['Guest Services Office Administrator', 'Temporary, Part-Time.', '', 'yes'],
    ['Reception Office Support', 'Temporary, Part-Time.', '', 'yes']
  ]);
  hiring.setFrozenRows(1);

  // Announcements tab
  var ann = ss.insertSheet('Announcements');
  ann.getRange('A1:D1').setValues([['Title', 'Body', 'Priority', 'Date']]);
  ann.getRange('A1:D1').setFontWeight('bold').setBackground('#c9a84c').setFontColor('#ffffff');
  ann.setColumnWidth(1, 200);
  ann.setColumnWidth(2, 400);
  ann.setColumnWidth(3, 100);
  ann.setColumnWidth(4, 120);
  ann.setFrozenRows(1);
  // Add a note about priority
  ann.getRange('C1').setNote('Use "normal" or "urgent". Urgent announcements show in terracotta/red.');

  // Meetings tab
  var meet = ss.insertSheet('Meetings');
  meet.getRange('A1:F1').setValues([['Name', 'Day', 'Time', 'Location', 'Facilitator', 'Notes']]);
  meet.getRange('A1:F1').setFontWeight('bold').setBackground('#2a8a7d').setFontColor('#ffffff');
  meet.setColumnWidth(1, 200);
  meet.setColumnWidth(2, 160);
  meet.setColumnWidth(3, 140);
  meet.setColumnWidth(4, 160);
  meet.setColumnWidth(5, 200);
  meet.setColumnWidth(6, 300);
  // Sample data
  meet.getRange('A2:F6').setValues([
    ['Community Circle', 'Tuesdays', '2:00 - 3:00 PM', '', 'Tash with Coordinators', 'Shared reflection, deep listening, dialogue, and strengthening community.'],
    ['Coordinators Meeting', 'Wednesdays', '2:00 - 3:00 PM', 'School House', 'Executive Pod', 'Cross-department alignment and collaboration.'],
    ['Morning Meetings', 'Monday & Wednesday', '9:00 - 9:15 AM', 'Dining Hall', 'Tash & Coordinators', 'Short focused gatherings for announcements and daily logistics.'],
    ['Work Parties', 'Wednesdays', '10:00 - 12:30', 'TBA', 'Anuradha & Operations', 'Hands-on collective efforts in service to the land and Centre.'],
    ['Department Meetings', 'As scheduled', '', '', 'Area Coordinators', 'Internal team alignment and planning sessions.']
  ]);
  meet.setFrozenRows(1);

  return ss;
}

function doGet(e) {
  var ss = getOrCreateSpreadsheet();
  var result = {};

  // --- HIRING ---
  var hiringSheet = ss.getSheetByName('Hiring');
  result.hiring = [];
  if (hiringSheet && hiringSheet.getLastRow() > 1) {
    var hiringData = hiringSheet.getDataRange().getValues();
    for (var i = 1; i < hiringData.length; i++) {
      var row = hiringData[i];
      if (!row[0]) continue;
      var active = String(row[3]).toLowerCase();
      if (active === 'no' || active === 'false' || active === '0') continue;
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
  if (annSheet && annSheet.getLastRow() > 1) {
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
  if (meetSheet && meetSheet.getLastRow() > 1) {
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
