/* Bullfinch - teaser product-panel stat visual.
   A 10x10 = 100-dot field where ONE red dot = the 1% of trees measured today;
   as the panel scrolls, coverage radiates out from it to the full 100 dots while
   a seven-segment readout counts 001 -> 100 and the label slides TODAY -> BULLFINCH.
   Driven by the SAME pin progress as the #problem panel (swot.js), so it scrubs
   in lockstep with the section. Each element animates in on entry and out on exit. */
(function () {
  var panel = document.getElementById("product");
  var gridEl = document.getElementById("statGrid");
  var readoutEl = document.getElementById("statReadout");
  if (!panel || !gridEl || !readoutEl) return;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobileLike = window.matchMedia && window.matchMedia("(max-width: 720px)").matches;

  var lblToday = document.getElementById("statToday");
  var lblBull = document.getElementById("statBull");
  var labelEl = panel.querySelector(".stat-label");
  var numEl = panel.querySelector(".stat-num");
  var restEl = panel.querySelector(".stat-rest");

  // ---- build the 100-dot field; ONE red dot is the radial origin ----
  var COLS = 10, ROWS = 10, N = COLS * ROWS;
  var ORIGIN_R = 5, ORIGIN_C = 5, ONE = ORIGIN_R * COLS + ORIGIN_C;
  var dots = [];
  for (var i = 0; i < N; i++) {
    var d = document.createElement("span"); d.className = "stat-dot";
    gridEl.appendChild(d); dots.push(d);
  }
  var order = [];
  for (var j = 0; j < N; j++) order.push(j);
  order.sort(function (a, b) {
    var da = Math.hypot(a % COLS - ORIGIN_C, Math.floor(a / COLS) - ORIGIN_R);
    var db = Math.hypot(b % COLS - ORIGIN_C, Math.floor(b / COLS) - ORIGIN_R);
    return da - db;
  });

  // ---- seven-segment readout (3 digits, built from 7 rects each) ----
  var SEG_RECT = { a:[9,0,32,9], b:[41,9,9,31.5], c:[41,49.5,9,31.5], d:[9,81,32,9],
                   e:[0,49.5,9,31.5], f:[0,9,9,31.5], g:[9,40.5,32,9] };
  var SEG_ON = { "0":"abcdef","1":"bc","2":"abged","3":"abgcd","4":"fgbc",
                 "5":"afgcd","6":"afgecd","7":"abc","8":"abcdefg","9":"abcdfg" };
  var SVGNS = "http://www.w3.org/2000/svg";
  var digitMaps = [];
  for (var dp = 0; dp < 3; dp++) {
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "stat-digit"); svg.setAttribute("viewBox", "0 0 50 90");
    var map = {};
    Object.keys(SEG_RECT).forEach(function (seg) {
      var r = SEG_RECT[seg], rc = document.createElementNS(SVGNS, "rect");
      rc.setAttribute("x", r[0]); rc.setAttribute("y", r[1]);
      rc.setAttribute("width", r[2]); rc.setAttribute("height", r[3]);
      rc.setAttribute("rx", "2"); rc.setAttribute("class", "stat-seg");
      svg.appendChild(rc); map[seg] = rc;
    });
    readoutEl.appendChild(svg); digitMaps.push(map);
  }
  function setReadout(n) {
    var s = String(n); while (s.length < 3) s = "0" + s;      // 001 / 050 / 100
    for (var i = 0; i < 3; i++) {
      var lit = SEG_ON[s.charAt(i)] || "", m = digitMaps[i];
      Object.keys(m).forEach(function (seg) {
        m[seg].setAttribute("class", "stat-seg" + (lit.indexOf(seg) >= 0 ? " on" : ""));
      });
    }
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function mapRange(x, a, b) { return clamp01((x - a) / (b - a)); }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  function paint(nLit, labelT) {
    for (var k = 0; k < N; k++) {
      var idx = order[k], on = k < nLit;
      dots[idx].className = "stat-dot" + (idx === ONE ? " is-one" : (on ? " is-on" : ""));
    }
    setReadout(nLit);
    lblToday.style.opacity = 1 - labelT;
    lblToday.style.filter = "blur(" + (labelT * 6) + "px)";
    lblBull.style.opacity = labelT;
    lblBull.style.filter = "blur(" + ((1 - labelT) * 5) + "px)";
    lblBull.style.transform = "translateY(" + (-(1 - labelT) * 3) + "em)";
  }

  // ---- static fallback (reduced motion / no GSAP): the 1% "gap" state ----
  if (reduced || typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
    [gridEl, labelEl, numEl, restEl].forEach(function (el) { if (el) { el.style.opacity = 1; el.style.transform = "none"; } });
    paint(1, 0);
    return;
  }

  // ---- entrance/exit windows over the panel's pin progress (0..1) ----
  var ITEMS = [gridEl, labelEl, numEl, restEl];
  var IN_START = 0.06, IN_STEP = 0.05, IN_LEN = 0.10;   // staggered in
  var FILL_START = 0.30, FILL_END = 0.74;               // count 1 -> 100, then hold
  // exit: every element must be FULLY animated out before the panel unpins at
  // p=1 — otherwise the leftover gets scrolled away (forbidden). Latest finisher
  // (grid, i=0) ends at 0.84 + 3*0.018 + 0.06 = 0.954, safely before 1.0.
  var OUT_START = 0.84, OUT_STEP = 0.018, OUT_LEN = 0.06;

  function drive(p) {
    // each element rises + fades in, holds, then fades + lifts out (reverse stagger)
    for (var i = 0; i < ITEMS.length; i++) {
      var el = ITEMS[i]; if (!el) continue;
      var inT = mapRange(p, IN_START + i * IN_STEP, IN_START + i * IN_STEP + IN_LEN);
      var outT = mapRange(p, OUT_START + (ITEMS.length - 1 - i) * OUT_STEP, OUT_START + (ITEMS.length - 1 - i) * OUT_STEP + OUT_LEN);
      el.style.opacity = inT * (1 - outT);
      el.style.transform = "translateY(" + (22 * (1 - inT) - 24 * outT) + "px)";
    }
    var fillProgress = ease(mapRange(p, FILL_START, FILL_END));
    var nLit = Math.max(1, Math.round(fillProgress * 100));
    var labelT = ease(clamp01(fillProgress / 0.5));   // BULLFINCH lands by mid-fill
    paint(nLit, labelT);
  }

  drive(0);
  ScrollTrigger.create({
    trigger: panel,
    start: "top top",
    end: mobileLike ? "+=100%" : "+=200%",   // must match the #problem pin in swot.js
    scrub: true,
    invalidateOnRefresh: true,
    onUpdate: function (self) { drive(self.progress); },
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
