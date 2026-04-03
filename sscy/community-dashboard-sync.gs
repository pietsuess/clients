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

// Read a sheet tab into an array of objects using header names as keys
function readTab(ss, tabName) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    var hasContent = false;
    for (var c = 0; c < headers.length; c++) {
      if (headers[c]) {
        obj[headers[c]] = data[i][c] !== undefined ? data[i][c] : '';
        if (data[i][c] !== '') hasContent = true;
      }
    }
    if (hasContent) rows.push(obj);
  }
  return rows;
}

function doGet(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var result = {};

  // Hiring - filter out inactive rows
  var hiringRaw = readTab(ss, 'Hiring');
  result.hiring = [];
  hiringRaw.forEach(function(row) {
    if (!row.title) return;
    var active = String(row.active || 'yes').toLowerCase();
    if (active === 'no' || active === 'false' || active === '0') return;
    result.hiring.push({ title: row.title, description: row.description || '', contact: row.contact || '' });
  });

  // Announcements
  var annRaw = readTab(ss, 'Announcements');
  result.announcements = [];
  annRaw.forEach(function(row) {
    if (!row.title) return;
    var dateStr = '';
    if (row.date) {
      try { dateStr = Utilities.formatDate(new Date(row.date), 'America/Vancouver', 'yyyy-MM-dd'); } catch(e) {}
    }
    result.announcements.push({ title: row.title, body: row.body || '', priority: row.priority || 'normal', date: dateStr });
  });

  // Meetings
  var meetRaw = readTab(ss, 'Meetings');
  result.meetings = [];
  meetRaw.forEach(function(row) {
    if (!row.name) return;
    result.meetings.push({
      name: row.name, day: row.day || '', time: row.time || '',
      location: row.location || '', facilitator: row.facilitator || '', notes: row.notes || ''
    });
  });

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
