// SSCY Community Dashboard - Google Sheet Sync
//
// SETUP:
// 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1ohKlsmcs_1RWoEDEJEtlOckKprKHH70MwZUb5b19R7Y/
// 2. Go to Extensions > Apps Script
// 3. Delete the default code, paste this entire file
// 4. Click Run (play button) to authorize - allow Sheets access
// 5. Click Deploy > New deployment > Web app
// 6. Execute as: Me, Who has access: Anyone
// 7. Deploy and copy the URL
//
// The script reads directly from this spreadsheet. No Drive permissions needed.
// It will create the tabs and headers automatically on first run.

var SHEET_ID = '1ohKlsmcs_1RWoEDEJEtlOckKprKHH70MwZUb5b19R7Y';

function setup() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  // Hiring tab
  var hiring = ss.getSheetByName('Hiring');
  if (!hiring) {
    hiring = ss.getSheets()[0];
    if (hiring.getName() === 'Sheet1') {
      hiring.setName('Hiring');
    } else {
      hiring = ss.insertSheet('Hiring');
    }
  }
  if (hiring.getRange('A1').getValue() === '') {
    hiring.getRange('A1:D1').setValues([['Title', 'Description', 'Contact', 'Active']]);
    hiring.getRange('A1:D1').setFontWeight('bold').setBackground('#1a5c53').setFontColor('#ffffff');
    hiring.setColumnWidth(1, 200); hiring.setColumnWidth(2, 300); hiring.setColumnWidth(3, 200); hiring.setColumnWidth(4, 80);
    hiring.getRange('A2:D4').setValues([
      ['Dish Room Lead', 'Part-Time position.', '', 'yes'],
      ['Guest Services Office Administrator', 'Temporary, Part-Time.', '', 'yes'],
      ['Reception Office Support', 'Temporary, Part-Time.', '', 'yes']
    ]);
    hiring.setFrozenRows(1);
  }

  // Announcements tab
  var ann = ss.getSheetByName('Announcements');
  if (!ann) { ann = ss.insertSheet('Announcements'); }
  if (ann.getRange('A1').getValue() === '') {
    ann.getRange('A1:D1').setValues([['Title', 'Body', 'Priority', 'Date']]);
    ann.getRange('A1:D1').setFontWeight('bold').setBackground('#c9a84c').setFontColor('#ffffff');
    ann.setColumnWidth(1, 200); ann.setColumnWidth(2, 400); ann.setColumnWidth(3, 100); ann.setColumnWidth(4, 120);
    ann.getRange('C1').setNote('Use "normal" or "urgent". Urgent = terracotta banner.');
    ann.setFrozenRows(1);
  }

  // Meetings tab
  var meet = ss.getSheetByName('Meetings');
  if (!meet) { meet = ss.insertSheet('Meetings'); }
  if (meet.getRange('A1').getValue() === '') {
    meet.getRange('A1:F1').setValues([['Name', 'Day', 'Time', 'Location', 'Facilitator', 'Notes']]);
    meet.getRange('A1:F1').setFontWeight('bold').setBackground('#2a8a7d').setFontColor('#ffffff');
    meet.setColumnWidth(1, 200); meet.setColumnWidth(2, 160); meet.setColumnWidth(3, 140);
    meet.setColumnWidth(4, 160); meet.setColumnWidth(5, 200); meet.setColumnWidth(6, 300);
    meet.getRange('A2:F6').setValues([
      ['Community Circle', 'Tuesdays', '2:00 - 3:00 PM', '', 'Tash with Coordinators', 'Shared reflection, deep listening, dialogue, and strengthening community.'],
      ['Coordinators Meeting', 'Wednesdays', '2:00 - 3:00 PM', 'School House', 'Executive Pod', 'Cross-department alignment and collaboration.'],
      ['Morning Meetings', 'Monday & Wednesday', '9:00 - 9:15 AM', 'Dining Hall', 'Tash & Coordinators', 'Short focused gatherings for announcements and daily logistics.'],
      ['Work Parties', 'Wednesdays', '10:00 - 12:30', 'TBA', 'Anuradha & Operations', 'Hands-on collective efforts in service to the land and Centre.'],
      ['Department Meetings', 'As scheduled', '', '', 'Area Coordinators', 'Internal team alignment and planning sessions.']
    ]);
    meet.setFrozenRows(1);
  }

  return 'Setup complete!';
}

function doGet(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var result = {};

  // Hiring
  var hiring = ss.getSheetByName('Hiring');
  result.hiring = [];
  if (hiring && hiring.getLastRow() > 1) {
    var data = hiring.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      var active = String(data[i][3]).toLowerCase();
      if (active === 'no' || active === 'false' || active === '0') continue;
      result.hiring.push({ title: data[i][0], description: data[i][1], contact: data[i][2] || '' });
    }
  }

  // Announcements
  var ann = ss.getSheetByName('Announcements');
  result.announcements = [];
  if (ann && ann.getLastRow() > 1) {
    var data = ann.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      result.announcements.push({
        title: data[i][0], body: data[i][1],
        priority: data[i][2] || 'normal',
        date: data[i][3] ? Utilities.formatDate(new Date(data[i][3]), 'America/Vancouver', 'yyyy-MM-dd') : ''
      });
    }
  }

  // Meetings
  var meet = ss.getSheetByName('Meetings');
  result.meetings = [];
  if (meet && meet.getLastRow() > 1) {
    var data = meet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      result.meetings.push({
        name: data[i][0], day: data[i][1], time: data[i][2],
        location: data[i][3] || '', facilitator: data[i][4] || '', notes: data[i][5] || ''
      });
    }
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
