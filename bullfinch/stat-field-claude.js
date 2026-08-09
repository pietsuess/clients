/* Claude fork of stat-field-gpt.js. Only the 01 TODAY readout timings differ:
   the label/number/rest reveal and the count+fill build now start AFTER the
   mote grid has finished assembling, not alongside it. The grid assembly runs
   [0 -> 0.30] of the #problem pin (see the setStatStage trigger in
   teaser.html), so nothing here fires before 0.30. Piet: the count must not
   start before the grid is fully compiled. Section 04's traction count-up
   below is untouched. GPT-Teaser.html keeps the original file.
   Kept as a separate file rather than an edit because stat-field-gpt.js is
   shared with Codex's GPT-Teaser.html — same split as scene-claude-teaser.js
   and swot-claude.js. */
/* Bullfinch teaser <1% readout. The original 001 -> 100 seven-segment and
   TODAY -> BULLFINCH animation drive the shared WebGL mote field. */
(function () {
  var panel = document.getElementById("problem");
  var stat = panel && panel.querySelector(".panel__stat--problem");
  var readoutEl = document.getElementById("statReadout");
  if (!panel || !stat || !readoutEl) return;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobileLike = window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
  // data-map-points (dev): the 01 graphic is the map-points canvas, not the
  // mote grid. The TODAY -> BULLFINCH flip syncs to the map's Act 4
  // conversion window (0.66 -> 0.96 in map time = 0.528 -> 0.768 of the pin,
  // since the acts occupy the pin's first 80%). Prod keeps the old window.
  var mapMode = document.body.hasAttribute("data-map-points");
  var lblToday = document.getElementById("statToday");
  var lblBull = document.getElementById("statBull");
  var labelEl = panel.querySelector(".stat-label");
  var numEl = panel.querySelector(".stat-num");
  var restEl = panel.querySelector(".stat-rest");

  var SEG_RECT = { a:[9,0,32,9], b:[41,9,9,31.5], c:[41,49.5,9,31.5], d:[9,81,32,9],
                   e:[0,49.5,9,31.5], f:[0,9,9,31.5], g:[9,40.5,32,9] };
  var SEG_ON = { "0":"abcdef", "1":"bc", "2":"abged", "3":"abgcd", "4":"fgbc",
                 "5":"afgcd", "6":"afgecd", "7":"abc", "8":"abcdefg", "9":"abcdfg" };
  var SVGNS = "http://www.w3.org/2000/svg";
  var digitMaps = [];
  for (var dp = 0; dp < 3; dp++) {
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "stat-digit");
    svg.setAttribute("viewBox", "0 0 50 90");
    var map = {};
    Object.keys(SEG_RECT).forEach(function (seg) {
      var r = SEG_RECT[seg];
      var rect = document.createElementNS(SVGNS, "rect");
      rect.setAttribute("x", r[0]); rect.setAttribute("y", r[1]);
      rect.setAttribute("width", r[2]); rect.setAttribute("height", r[3]);
      rect.setAttribute("rx", "2"); rect.setAttribute("class", "stat-seg");
      svg.appendChild(rect); map[seg] = rect;
    });
    readoutEl.appendChild(svg); digitMaps.push(map);
  }
  function setReadout(n) {
    var s = String(n); while (s.length < 3) s = "0" + s;
    for (var i = 0; i < 3; i++) {
      var lit = SEG_ON[s.charAt(i)] || "";
      var m = digitMaps[i];
      Object.keys(m).forEach(function (seg) {
        m[seg].setAttribute("class", "stat-seg" + (lit.indexOf(seg) >= 0 ? " on" : ""));
      });
    }
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function mapRange(x, a, b) { return clamp01((x - a) / (b - a)); }
  function smooth(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function ease(x) { x = clamp01(x); return 1 - Math.pow(1 - x, 3); }
  function paint(fillProgress) {
    var nLit = Math.max(1, Math.round(fillProgress * 100));
    var labelT = ease(clamp01(fillProgress / .5));
    setReadout(nLit);
    if (lblToday) {
      lblToday.style.opacity = 1 - labelT;
      lblToday.style.filter = "blur(" + (labelT * 6) + "px)";
    }
    if (lblBull) {
      lblBull.style.opacity = labelT;
      lblBull.style.filter = "blur(" + ((1 - labelT) * 5) + "px)";
      lblBull.style.transform = "translateY(" + (-(1 - labelT) * 3) + "em)";
    }
    if (window.bullfinchCanopy && window.bullfinchCanopy.setStatFillProgress) {
      window.bullfinchCanopy.setStatFillProgress(fillProgress);
    }
  }

  if (reduced || typeof ScrollTrigger === "undefined") {
    [labelEl, numEl, restEl].forEach(function (el) { if (el) { el.style.opacity = 1; el.style.transform = "none"; } });
    paint(0);
    return;
  }

  var items = [labelEl, numEl, restEl];
  // MAP-LEAD (dev desktop, Piet 2026-08-09): the stat block is reparented to
  // a viewport-fixed layer and the readout arrives DURING the 00 leave, with
  // the photograph — beats that live on the HERO pin, which this file cannot
  // see. teaser-dev.html owns the readout in/out opacity AND the TODAY ->
  // BULLFINCH flip (via window.__statFlip, fed MAP time so the flip stays
  // glued to the green conversion wherever map time starts). Here: zero the
  // three elements, expose the flip, and stand down. Prod and phone keep the
  // pin-anchored drive below untouched.
  if (mapMode && !mobileLike) {
    window.__statFlip = function (t) { paint(ease(t)); };
    for (var mi = 0; mi < items.length; mi++) {
      if (items[mi]) { items[mi].style.opacity = 0; items[mi].style.transform = "none"; }
    }
    paint(0);
    return;
  }
  function drive(p) {
    for (var i = 0; i < items.length; i++) {
      var el = items[i]; if (!el) continue;
      var inT = mapRange(p, .32 + i * .05, .42 + i * .05);
      var outT = mapRange(p, .86 + (items.length - 1 - i) * .018, .92 + (items.length - 1 - i) * .018);
      el.style.opacity = inT * (1 - outT);
      // No translateY: the readout label/number/rest reveal by opacity IN PLACE.
      // The old translateY (22px in, 24px out) was a vertical slide during the
      // 01 pin (Piet: "the text section slides up"). Killed — nothing moves.
      el.style.transform = "none";
    }
    paint(ease(mapRange(p, mapMode ? .528 : .46, mapMode ? .768 : .74)));
  }
  drive(0);
  ScrollTrigger.create({
    trigger: panel,
    start: "top top",
    // Must match #problem's ACTUAL pin length in swot-claude.js (+=150% desktop
    // / +=100% mobile). It was +=200%, so the readout's out-wipe (starts at
    // 0.86 = 172% of the old range) did not begin until AFTER the panel had
    // already unpinned at 150% — the still-visible readout then rode up the page
    // (Piet: "the graphic and text for 100% is still sliding up"). Aligned, it
    // un-writes IN PLACE before the panel releases.
    end: mobileLike ? "+=100%" : "+=150%",
    scrub: true,
    invalidateOnRefresh: true,
    onUpdate: function (self) { drive(self.progress); },
    onRefresh: function (self) { drive(self.progress || 0); }
  });
})();

/* Section 04 ("TRACTION") — $39M pipeline count-up in the verdict headline,
   scrubbed by that panel's pin. Reserved-width digits (see .count-up) so the
   balanced headline never reflows as it counts. */
(function () {
  var panel = document.getElementById("data");
  var numEl = document.getElementById("tractionCount");
  if (!panel || !numEl) return;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
    numEl.textContent = "39";
    return;
  }
  var mobileLike = window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function mapRange(x, a, b) { return clamp01((x - a) / (b - a)); }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  // count runs as the verdict fades in (0.26) and lands on 39 before the HOLD
  function drive(p) { numEl.textContent = Math.round(ease(mapRange(p, 0.26, 0.50)) * 39); }

  drive(0);
  ScrollTrigger.create({
    trigger: panel,
    start: "top top",
    end: mobileLike ? "+=100%" : "+=200%",   // matches the #data pin in swot.js
    scrub: true,
    invalidateOnRefresh: true,
    onUpdate: function (self) { drive(self.progress); },
  });
})();
