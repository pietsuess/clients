// Shared header behaviour for every page.
// Hide the header when scrolling down past a short way; reveal on any upward scroll.
(function () {
  var header = document.getElementById('hdr');
  if (!header) return;
  var threshold = 160;
  var lastY = window.scrollY;
  var ticking = false;
  function update() {
    var y = window.scrollY;
    if (y <= threshold) {
      header.classList.remove('nav-hidden');        // always shown near the top
    } else if (y > lastY + 4) {
      header.classList.add('nav-hidden');            // scrolling down
    } else if (y < lastY - 4) {
      header.classList.remove('nav-hidden');         // scrolling up
    }
    lastY = y;
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
})();

// Sheet-driven content (optional).
// A published Google Sheet with three columns — KEY, VALUE, ON — can:
//   - replace the text of any element tagged  data-cms="KEY"       (uses VALUE)
//   - hide any section tagged  data-cms-section="KEY"  when  KEY.show  is off
// If the sheet is blank, offline, or missing a key, the page keeps the copy
// already written in the HTML. Nothing here can blank the site.
// To switch it on: publish the sheet to the web as CSV and paste the link below.
(function () {
  var CONTENT_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4-yWOCdbUb9ll39fNm5w-yMN9VVUHhKQ5tEoU980SMloMGDle7EO1KdY5kk03wkJg_Z1Y9VmJkrnN/pub?output=csv';
  if (!CONTENT_CSV_URL) return;

  function parseLine(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i], n = line[i + 1];
      if (c === '"' && q && n === '"') { cur += '"'; i++; }
      else if (c === '"') { q = !q; }
      else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else { cur += c; }
    }
    out.push(cur);
    return out;
  }

  var OFF = /^(0|no|false|off|hide)$/i;

  // Render sheet text safely: escape all HTML, then turn *asterisks* into
  // italics. Jeremy types  a *special one-week* event  to italicise part of
  // a line. No raw HTML from the sheet is ever inserted.
  function render(s) {
    var esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }

  fetch(CONTENT_CSV_URL, { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw 0; return r.text(); })
    .then(function (text) {
      var rows = text.replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map(parseLine);
      var map = {};
      rows.forEach(function (c) {
        var key = (c[0] || '').trim();
        if (!key) return;
        map[key] = { value: (c[1] != null ? c[1] : '').trim(), on: (c[2] != null ? c[2] : '').trim() };
      });
      document.querySelectorAll('[data-cms]').forEach(function (el) {
        var row = map[el.getAttribute('data-cms')];
        if (row && row.value !== '') el.innerHTML = render(row.value);
      });
      document.querySelectorAll('[data-cms-section]').forEach(function (el) {
        var row = map[el.getAttribute('data-cms-section') + '.show'];
        if (row && OFF.test(row.on)) el.style.display = 'none';
      });
    })
    .catch(function () { /* keep the hardcoded copy */ });
})();
