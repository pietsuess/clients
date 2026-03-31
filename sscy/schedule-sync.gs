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

var FILE_NAME = 'acyr-schedule-sync.json';

function getOrCreateFile() {
  var files = DriveApp.getFilesByName(FILE_NAME);
  if (files.hasNext()) return files.next();
  return DriveApp.createFile(FILE_NAME, '{}', 'application/json');
}

function doGet(e) {
  var file = getOrCreateFile();
  var content = file.getBlob().getDataAsString();
  return ContentService.createTextOutput(content).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var file = getOrCreateFile();
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
