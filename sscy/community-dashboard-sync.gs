// SSCY Community Dashboard - Google Sheet Sync
//
// SETUP:
// 1. Open your Google Sheet
// 2. Go to Extensions > Apps Script
// 3. Delete the default code, paste this entire file
// 4. Select "setup" from the function dropdown, click Run, authorize
// 5. Deploy > New deployment > Web app (Execute as: Me, Access: Anyone)
// 6. Copy the URL
//
// All dashboard content is managed from the spreadsheet tabs.
// Run setup() again any time to add missing tabs without overwriting existing data.

var SHEET_ID = '1ohKlsmcs_1RWoEDEJEtlOckKprKHH70MwZUb5b19R7Y';

// Helper: create a tab if it doesn't exist, add headers and sample data if empty
function ensureTab(ss, name, headers, bgColor, sampleData, colWidths) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    // Rename Sheet1 if it's the only blank one
    var sheets = ss.getSheets();
    if (sheets.length === 1 && sheets[0].getName() === 'Sheet1' && sheets[0].getLastRow() === 0) {
      sheet = sheets[0];
      sheet.setName(name);
    } else {
      sheet = ss.insertSheet(name);
    }
  }
  if (sheet.getRange('A1').getValue() === '') {
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold').setBackground(bgColor).setFontColor('#ffffff');
    for (var c = 0; c < colWidths.length; c++) { sheet.setColumnWidth(c + 1, colWidths[c]); }
    if (sampleData && sampleData.length) {
      sheet.getRange(2, 1, sampleData.length, sampleData[0].length).setValues(sampleData);
    }
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function setup() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  ensureTab(ss, 'Hiring',
    ['Title', 'Description', 'Contact', 'Active'],
    '#1a5c53',
    [
      ['Dish Room Lead', 'Part-Time position.', '', 'yes'],
      ['Guest Services Office Administrator', 'Temporary, Part-Time.', '', 'yes'],
      ['Reception Office Support', 'Temporary, Part-Time.', '', 'yes']
    ],
    [200, 300, 200, 80]
  );

  ensureTab(ss, 'Announcements',
    ['Title', 'Body', 'Priority', 'Date'],
    '#c9a84c',
    [],
    [200, 400, 100, 120]
  );

  ensureTab(ss, 'Meetings',
    ['Name', 'Day', 'Time', 'Location', 'Facilitator', 'Notes'],
    '#2a8a7d',
    [
      ['Community Circle', 'Tuesdays', '2:00 - 3:00 PM', '', 'Tash with Coordinators', 'Shared reflection, deep listening, dialogue, and strengthening community.'],
      ['Coordinators Meeting', 'Wednesdays', '2:00 - 3:00 PM', 'School House', 'Executive Pod', 'Cross-department alignment and collaboration.'],
      ['Morning Meetings', 'Monday & Wednesday', '9:00 - 9:15 AM', 'Dining Hall', 'Tash & Coordinators', 'Short focused gatherings for announcements and daily logistics.'],
      ['Work Parties', 'Wednesdays', '10:00 - 12:30', 'TBA', 'Anuradha & Operations', 'Hands-on collective efforts in service to the land and Centre.'],
      ['Department Meetings', 'As scheduled', '', '', 'Area Coordinators', 'Internal team alignment and planning sessions.']
    ],
    [200, 160, 140, 160, 200, 300]
  );

  ensureTab(ss, 'Emergency',
    ['Section', 'Title', 'Phone', 'Description'],
    '#c17838',
    [
      ['Directory', 'SSCY Emergency Team', '866-662-1275', 'Call and leave a voice message. The SSCY Emergency Team will be dispatched immediately.'],
      ['Land', 'Maintenance Dispatch', '831-777-4349', 'TEXT for urgent needs: gas leak, sewer smell, clogged drain, safety hazards.'],
      ['Land', 'Water Leak Hotline', '831-226-0005', 'Report water leaks immediately.'],
      ['Wellbeing', '988 Suicide and Crisis Lifeline', '988', 'Call, text 988, or chat at 988lifeline.com'],
      ['Wellbeing', 'Mental Health First Aid Responders', '', 'Community wellness support. Reach out to trained responders within our community.'],
      ['Land', 'Work Safe BC', '1.888.967.5377', 'Workplace injury reporting and resources.']
    ],
    [120, 250, 160, 400]
  );

  ensureTab(ss, 'Forms',
    ['Title', 'Description', 'URL', 'Active'],
    '#7ecbb7',
    [
      ['Accident / Incident Report', 'Report workplace injuries or safety concerns.', '', 'yes'],
      ['Schedule Adjustment Form', 'Request changes to your schedule (2 weeks notice required).', '', 'yes'],
      ['Time Away Request', 'Submit time away requests.', '', 'yes'],
      ['Purchase Order Form', 'Request purchases for your department.', '', 'yes'],
      ['Guest Request: Accommodations', 'Guest services for visitor accommodations.', '', 'yes'],
      ['Guest Request: Day/Overnight', 'Single day or overnight guest in personal residence.', '', 'yes'],
      ['Housing Consideration Form', 'Apply for community housing.', '', 'yes'],
      ['IT Support Request', 'Technical support and equipment requests.', '', 'yes'],
      ['Marketing Project Request', 'Submit marketing and communications needs.', '', 'yes'],
      ['Employee Retirement Planning', '401K enrollment and planning resources.', '', 'yes']
    ],
    [250, 350, 300, 80]
  );

  ensureTab(ss, 'Staff Resources',
    ['Title', 'Description', 'URL', 'Active'],
    '#2e7e6f',
    [
      ['The Scheduler (Sling)', 'Staff and volunteer schedules.', '', 'yes'],
      ['SSCY Resident Handbook', 'Guidelines for community residents.', '', 'yes'],
      ['Employee Handbook', 'Policies and procedures for all staff.', '', 'yes'],
      ['Volunteer Handbook', 'Information for karma yoga volunteers.', '', 'yes'],
      ['Venue Booking Calendar', 'Upcoming programs and venue availability.', '', 'yes'],
      ['Area Leads & Administrative Groups', 'Organizational structure and contacts.', '', 'yes'],
      ['Orientation Week & Session Dates', 'Key dates for new arrivals.', '', 'yes'],
      ['Social Media Brief', 'Guidelines for representing SSCY online.', '', 'yes']
    ],
    [250, 350, 300, 80]
  );

  ensureTab(ss, 'Wellbeing Resources',
    ['Title', 'Description', 'URL', 'Active'],
    '#e6d798',
    [
      ['Crisis Resources & Support', 'Document created by Community Well-Being committee.', '', 'yes'],
      ['Family Services Counseling', 'Professional counseling program.', '', 'yes'],
      ['DEI Resource Center', 'Diversity, Equity, Inclusion & Belonging resources.', '', 'yes'],
      ['Free Online Yoga Classes', 'Accessible yoga for all.', '', 'yes'],
      ['Ayurveda & Yoga Offerings', 'MMI wellness programs.', '', 'yes'],
      ['Articles & Insights', 'Reflections on life in community.', '', 'yes']
    ],
    [250, 350, 300, 80]
  );

  ensureTab(ss, 'Community Links',
    ['Title', 'Description', 'URL', 'Category', 'Active'],
    '#a78a30',
    [
      ['Our Family of Initiatives', 'Programs and organizations in the SSCY extended family.', '', 'orgs', 'yes'],
      ['Mount Madonna Center', 'Sister organization in California.', 'https://mountmadonna.org', 'orgs', 'yes'],
      ['Sri Ram Ashram', 'Founded through the teachings of Baba Hari Dass.', 'https://sriramashram.org', 'orgs', 'yes'],
      ['Sri Ram Publishing', 'Books and teachings.', 'https://srirampublishing.org', 'orgs', 'yes'],
      ['Meeting Minutes', 'Access meeting notes and records.', '', 'coordinator', 'yes'],
      ['Staff Meal Registration', 'Register for community meals.', '', 'coordinator', 'yes'],
      ['Photo Share', 'Community photo gallery.', '', 'coordinator', 'yes']
    ],
    [250, 350, 300, 120, 80]
  );

  ensureTab(ss, 'Policies',
    ['Title', 'Body'],
    '#be9f31',
    [
      ['Shift Coverage Policy', 'It is your responsibility to find coverage for your shifts.\nUse the WhatsApp Shift Coverage Channel to trade or bargain shifts.\nThis is not Tash\'s responsibility.'],
      ['Sick Policy', '1. Doctor\'s notice required for extended illness (3 days or more).\n2. Notify your Area Lead immediately.\n3. Announce on Shift Coverage WhatsApp Channel.\n4. If no response, contact Area Lead and let Maya know.\n5. Last resource: Operations Coordinator provides coverage.'],
      ['Meal Opt-Out Policy', 'We assume everyone eats all 3 meals daily.\nInform Kitchen by 9 AM on the Meal Opt-Out WhatsApp Channel.\nFor extended time away, Tash notifies Kitchen.'],
      ['Schedule Change Policy', 'Minimum 2 weeks notice required for all schedule changes.\nSubmit by email to scheduler@saltspringcentre.com'],
      ['Governance', 'Dharma Sara Satsang Society: Our community is guided by a shared Mission, Vision, and Core Values.\n\nThe Panchayat: A council-based approach to community governance and decision making.\n\nConsensus to Consent Model: Our governance framework moves from consensus-based to consent-based decision making, ensuring all voices are heard while maintaining effective progress.']
    ],
    [250, 600]
  );

  return 'Setup complete! All 9 tabs created.';
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

// Filter out rows where active = no/false/0
function filterActive(rows) {
  return rows.filter(function(row) {
    if (row.active === undefined) return true;
    var a = String(row.active).toLowerCase();
    return a !== 'no' && a !== 'false' && a !== '0';
  });
}

function doGet(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var result = {};

  result.hiring = filterActive(readTab(ss, 'Hiring')).map(function(r) {
    return { title: r.title || '', description: r.description || '', contact: r.contact || '' };
  });

  var annRaw = readTab(ss, 'Announcements');
  result.announcements = annRaw.filter(function(r) { return r.title; }).map(function(r) {
    var dateStr = '';
    if (r.date) { try { dateStr = Utilities.formatDate(new Date(r.date), 'America/Vancouver', 'yyyy-MM-dd'); } catch(e) {} }
    return { title: r.title, body: r.body || '', priority: r.priority || 'normal', date: dateStr };
  });

  result.meetings = readTab(ss, 'Meetings').filter(function(r) { return r.name; }).map(function(r) {
    return { name: r.name, day: r.day || '', time: r.time || '', location: r.location || '', facilitator: r.facilitator || '', notes: r.notes || '' };
  });

  result.emergency = readTab(ss, 'Emergency').filter(function(r) { return r.title; }).map(function(r) {
    return { section: String(r.section || '').toLowerCase(), title: r.title, phone: r.phone || '', description: r.description || '' };
  });

  result.forms = filterActive(readTab(ss, 'Forms')).map(function(r) {
    return { title: r.title || '', description: r.description || '', url: r.url || '' };
  });

  result.staff = filterActive(readTab(ss, 'Staff Resources')).map(function(r) {
    return { title: r.title || '', description: r.description || '', url: r.url || '' };
  });

  result.wellbeing = filterActive(readTab(ss, 'Wellbeing Resources')).map(function(r) {
    return { title: r.title || '', description: r.description || '', url: r.url || '' };
  });

  result.community = filterActive(readTab(ss, 'Community Links')).map(function(r) {
    return { title: r.title || '', description: r.description || '', url: r.url || '', category: String(r.category || '').toLowerCase() };
  });

  result.policies = readTab(ss, 'Policies').filter(function(r) { return r.title; }).map(function(r) {
    return { title: r.title, body: r.body || '' };
  });

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
