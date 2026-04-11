// SSCY Community Events API
//
// Serves upcoming events from the SSCY community Google Calendar as JSON.
// Used by events-data.js to populate the 4 community gatherings dynamically
// (Sunday Satsang, Vancouver Satsang, Kirtan, Daily Arati) plus any
// other recurring community events SSCY adds to the calendar.
//
// SETUP:
// 1. Go to script.google.com -> New project (or add to existing SSCY project)
// 2. Paste this file
// 3. Deploy -> New deployment -> Web app
//    - Description: "SSCY community events API"
//    - Execute as: Me
//    - Who has access: Anyone
// 4. Copy the web app URL
// 5. Update COMMUNITY_EVENTS_API constant in events-data.js to that URL
//
// The first run will prompt for Calendar API permission. Authorize it.
//
// To add events that appear on the site, create recurring events in the
// community calendar. The title becomes the card title, description becomes
// the longDesc, location becomes location, and the color can be used to
// categorize.

var CALENDAR_ID = 'c_t567jg3h1u3hgj7fii50ie8k6k@group.calendar.google.com';
var LOOKAHEAD_DAYS = 90; // Return events happening in the next N days

function doGet(e) {
  try {
    var cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) {
      return jsonResponse({ error: 'Calendar not found or not accessible to this script account' });
    }

    var now = new Date();
    var until = new Date();
    until.setDate(until.getDate() + LOOKAHEAD_DAYS);

    var events = cal.getEvents(now, until);

    // Group by title to dedupe recurring instances into one "card" per distinct event
    var byTitle = {};
    events.forEach(function(ev) {
      var title = ev.getTitle();
      if (!byTitle[title]) {
        byTitle[title] = {
          title: title,
          description: ev.getDescription(),
          location: ev.getLocation(),
          instances: []
        };
      }
      byTitle[title].instances.push({
        start: ev.getStartTime().toISOString(),
        end: ev.getEndTime().toISOString(),
        allDay: ev.isAllDayEvent()
      });
    });

    // Convert to array, build schedule string from first instance
    var results = [];
    Object.keys(byTitle).forEach(function(title) {
      var item = byTitle[title];
      var first = item.instances[0];
      var startDate = new Date(first.start);
      var endDate = new Date(first.end);

      // Infer schedule string: "Sunday, 2:00 - 3:30 PM" or "Daily, 6:45 - 7:15 AM"
      var dayName = startDate.toLocaleDateString('en-US', {
        weekday: 'long',
        timeZone: 'America/Vancouver'
      });
      var startTime = formatTime(startDate);
      var endTime = formatTime(endDate);

      // If it happens every day, call it "Daily"
      var uniqueDays = {};
      item.instances.forEach(function(inst) {
        uniqueDays[new Date(inst.start).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Vancouver' })] = true;
      });
      var daysCount = Object.keys(uniqueDays).length;
      var dayLabel = daysCount >= 7 ? 'Daily' : dayName;

      var schedule = dayLabel + ', ' + startTime + ' - ' + endTime;

      // Generate a stable id from the title
      var id = 'community-' + title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      results.push({
        id: id,
        type: 'community',
        title: title,
        schedule: schedule,
        days: [dayLabel],
        time: startTime + ' - ' + endTime,
        price: 'Free',
        format: item.location ? 'In-person' : 'Online / Zoom',
        location: item.location || '',
        desc: stripHtml(item.description).slice(0, 200),
        longDesc: stripHtml(item.description),
        nextDate: first.start
      });
    });

    // Sort by next date
    results.sort(function(a, b) { return a.nextDate.localeCompare(b.nextDate); });

    return jsonResponse({ events: results, count: results.length, generated: new Date().toISOString() });
  } catch (err) {
    return jsonResponse({ error: String(err) });
  }
}

function formatTime(date) {
  var opts = { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Vancouver' };
  return date.toLocaleTimeString('en-US', opts);
}

function stripHtml(s) {
  if (!s) return '';
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run once manually to test in the Apps Script editor
function testFetch() {
  var result = doGet();
  Logger.log(result.getContent());
}
