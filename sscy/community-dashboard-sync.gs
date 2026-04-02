// SSCY Community Dashboard Sync - Google Apps Script
//
// SETUP (one time, ~2 minutes):
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
// Data is stored as "sscy-community-dashboard.json" in your Google Drive.
// The dashboard pages fetch this on load to render dynamic sections.
// Admin users can POST updates from the dashboard admin panel.

var FILE_NAME = 'sscy-community-dashboard.json';

var DEFAULT_DATA = {
  _meta: { updatedAt: '', updatedBy: '' },
  announcements: [
    // { title: 'Water Conservation', body: 'Please conserve water this week.', date: '2026-04-01', priority: 'normal' }
  ],
  hiring: [
    { title: 'Dish Room Lead', description: 'Part-Time position.', posted: '2026-04-01', contact: '' },
    { title: 'Guest Services Office Administrator', description: 'Temporary, Part-Time.', posted: '2026-04-01', contact: '' },
    { title: 'Reception Office Support', description: 'Temporary, Part-Time.', posted: '2026-04-01', contact: '' }
  ],
  meetings: [
    { name: 'Community Circle', day: 'Tuesdays', time: '2:00 - 3:00 PM', location: '', facilitator: 'Tash with Coordinators', notes: 'A space for shared reflection, deep listening, dialogue, and strengthening community.' },
    { name: 'Coordinators Meeting', day: 'Wednesdays', time: '2:00 - 3:00 PM', location: 'School House', facilitator: 'Executive Pod', notes: 'Cross-department alignment and collaboration.' },
    { name: 'Morning Meetings', day: 'Monday & Wednesday', time: '9:00 - 9:15 AM', location: 'Dining Hall', facilitator: 'Tash & Coordinators', notes: 'Short focused gatherings for announcements and daily logistics.' },
    { name: 'Work Parties', day: 'Wednesdays', time: '10:00 - 12:30', location: 'TBA', facilitator: 'Anuradha & Operations', notes: 'Hands-on collective efforts in service to the land and Centre.' },
    { name: 'Department Meetings', day: 'As scheduled', time: '', location: '', facilitator: 'Area Coordinators', notes: 'Internal team alignment and planning sessions.' }
  ]
};

function getOrCreateFile(name) {
  var files = DriveApp.getFilesByName(name);
  if (files.hasNext()) return files.next();
  return DriveApp.createFile(name, JSON.stringify(DEFAULT_DATA, null, 2), 'application/json');
}

function doGet(e) {
  var file = getOrCreateFile(FILE_NAME);
  var content = file.getBlob().getDataAsString();
  return ContentService.createTextOutput(content).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var file = getOrCreateFile(FILE_NAME);
  var data = e.postData.contents;
  // Validate JSON
  try { JSON.parse(data); } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: 'Invalid JSON'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  file.setContent(data);
  return ContentService.createTextOutput(JSON.stringify({ok: true}))
    .setMimeType(ContentService.MimeType.JSON);
}
