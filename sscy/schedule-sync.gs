// ACYR Schedule Sync - Google Apps Script
//
// SETUP (one time, ~2 minutes):
// 1. Go to https://script.google.com
// 2. Click "New project"
// 3. Delete the default code, paste this entire file
// 4. Click "Deploy" > "New deployment"
// 5. Type = "Web app"
// 6. Execute as: "Me"
// 7. Who has access: "Anyone"
// 8. Click "Deploy", authorize when prompted
// 9. Copy the Web app URL and paste it into schedule-editor.html
//    (replace the SYNC_URL value)
//
// That's it. The schedule editor will use this URL to publish and sync.
// Data is stored as a file in your Google Drive called "acyr-schedule-sync.json"
// Heartbeat data is in "acyr-schedule-heartbeat.json"

var FILE_NAME = 'acyr-schedule-sync.json';
var HB_FILE_NAME = 'acyr-schedule-heartbeat.json';

function getOrCreateFile(name) {
  var files = DriveApp.getFilesByName(name);
  if (files.hasNext()) return files.next();
  return DriveApp.createFile(name, '{}', 'application/json');
}

function doGet(e) {
  var params = e ? e.parameter : {};

  // Heartbeat: GET ?heartbeat=Name updates presence and returns all active users
  if (params.heartbeat) {
    var hbFile = getOrCreateFile(HB_FILE_NAME);
    var hbData = {};
    try { hbData = JSON.parse(hbFile.getBlob().getDataAsString()); } catch(err) {}

    // Update this user's timestamp
    hbData[params.heartbeat] = new Date().toISOString();

    // Clean up entries older than 3 minutes
    var now = new Date().getTime();
    var active = {};
    for (var name in hbData) {
      if (now - new Date(hbData[name]).getTime() < 180000) {
        active[name] = hbData[name];
      }
    }

    hbFile.setContent(JSON.stringify(active));
    return ContentService.createTextOutput(JSON.stringify(active)).setMimeType(ContentService.MimeType.JSON);
  }

  // Default: return schedule data
  var file = getOrCreateFile(FILE_NAME);
  var content = file.getBlob().getDataAsString();
  return ContentService.createTextOutput(content).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var file = getOrCreateFile(FILE_NAME);
  var data = e.postData.contents;
  // Validate it's JSON
  try { JSON.parse(data); } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: 'Invalid JSON'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  file.setContent(data);
  return ContentService.createTextOutput(JSON.stringify({ok: true}))
    .setMimeType(ContentService.MimeType.JSON);
}
