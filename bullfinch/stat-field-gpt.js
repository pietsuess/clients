/* Bullfinch teaser <1% readout. The 100-dot grid is rendered by the shared
   point-cloud scene so the opening ground motes become the measurement field. */
(function () {
  var panel = document.getElementById("problem");
  var stat = panel && panel.querySelector(".panel__stat--problem");
  if (!panel || !stat) return;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobileLike = window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function smooth(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function show(p) {
    stat.style.opacity = p;
    stat.style.transform = "translateY(" + (18 * (1 - p)) + "px)";
  }

  if (reduced || typeof ScrollTrigger === "undefined") {
    show(1);
    return;
  }

  show(0);
  ScrollTrigger.create({
    trigger: panel,
    start: "top bottom",
    end: "top top",
    scrub: true,
    onUpdate: function (self) { show(smooth(self.progress)); },
  });
  ScrollTrigger.create({
    trigger: panel,
    start: "top top",
    end: mobileLike ? "+=100%" : "+=150%",
    scrub: true,
    onUpdate: function (self) {
      show(1 - smooth(clamp01((self.progress - 0.72) / 0.20)));
    },
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
