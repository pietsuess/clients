/* Bullfinch — pinned verdict choreography + scroll-progress driver (v8).

   PANEL PIN (200vh per panel, scrub: true):
     0%   – 4%   eyebrow slides in (translateX -16 → 0, opacity 0 → 1)
     4%   – 12%  verdict enters opacity 0 → 1, translateY 16 → 0
                 (NO scale, NO letter-spacing animation — flush-left
                  balanced text must not reflow mid-scrub)
     12%  – 22%  evidence paragraphs reveal sequentially (translateY 24 → 0)
     22%  – 28%  numeric line reveals (translateY 16 → 0)
     28%  – 88%  HOLD (60% of pin — reader can stop scrolling and read)
     88%  – 100% inner block fades + translates up 24px

   HERO EXIT (over ~0.55 viewports of scroll, two lines):
     eyebrow fades       0.00 – 0.20
     headline line 1     0.18 – 0.36
     headline line 2     0.30 – 0.48

   GLOBAL SCROLL → canopy:
     window.bullfinchCanopy.setProgress(t)
     where t is progress from top-of-page to top-of-footer (0..1).

   REDUCED MOTION:
     No Lenis (scroll.js handles), no scrubs, no pins.
     Simple on-enter reveals. Canvas is already hidden in fallback.
*/
(function () {
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Safety: if GSAP didn't load, just reveal everything --------------
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
    document
      .querySelectorAll(".panel__eyebrow, .panel__verdict, .panel__evidence p, .panel__numeric, .hero__eyebrow, .hero__line")
      .forEach(function (el) { el.style.opacity = 1; el.style.transform = "none"; });
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  // ===== Splash handoff reveal of hero =================================
  gsap.set(".hero__eyebrow", { opacity: 0, x: -44, y: 0 });
  gsap.set(".hero__line",    { opacity: 0, x: -72, y: 0 });

  var heroRevealed = false;
  function revealHero() {
    if (heroRevealed) return;
    heroRevealed = true;
    gsap.to(".hero__eyebrow", { opacity: 1, x: 0, duration: 0.72, ease: "power3.out", delay: 0.05 });
    gsap.to(".hero__line--1", { opacity: 1, x: 0, duration: 0.78, ease: "power3.out", delay: 0.23 });
    gsap.to(".hero__line--2", { opacity: 1, x: 0, duration: 0.78, ease: "power3.out", delay: 0.41 });
  }

  document.addEventListener("bullfinch:splashcomplete", revealHero);
  if (!document.getElementById("splash") || document.body.classList.contains("has-entered")) {
    window.setTimeout(revealHero, 80);
  }

  // ===== Hero exit motion (TWO lines, staggered fade) ====================
  // Eyebrow:  0.00 – 0.20
  // Line 1:   0.18 – 0.36
  // Line 2:   0.30 – 0.48
  var hero = document.querySelector(".hero");
  if (hero && !reduced) {
    ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "bottom top",
      scrub: true,
      onUpdate: function (self) {
        var p = self.progress;
        var pe = 1 - Math.max(0, Math.min(1, (p - 0.00) / 0.20));
        var p1 = 1 - Math.max(0, Math.min(1, (p - 0.18) / 0.18));
        var p2 = 1 - Math.max(0, Math.min(1, (p - 0.30) / 0.18));
        var eb = hero.querySelector(".hero__eyebrow");
        var l1 = hero.querySelector(".hero__line--1");
        var l2 = hero.querySelector(".hero__line--2");
        if (eb) eb.style.opacity = pe;
        if (l1) l1.style.opacity = p1;
        if (l2) l2.style.opacity = p2;
        hero.style.setProperty("--text-veil-opacity", (smooth01(Math.max(p1, p2)) * 0.58).toFixed(3));
      },
    });
  }

  // ===== Panel pin choreography ==========================================
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function mapRange(x, a, b) { return clamp01((x - a) / (b - a)); }
  function smooth01(x) {
    var t = clamp01(x);
    return t * t * (3 - 2 * t);
  }

  function applyPanelProgress(panel, p) {
    var eyebrow  = panel.querySelector(".panel__eyebrow");
    var verdict  = panel.querySelector(".panel__verdict");
    var evidence = panel.querySelectorAll(".panel__evidence p");
    var numeric  = panel.querySelector(".panel__numeric");
    var inner    = panel.querySelector(".panel__inner");

    // First beat is visual: arrows land, dots pulse, then copy appears.
    // 18%–24% eyebrow slides in
    var pe = mapRange(p, 0.18, 0.24);
    if (eyebrow) {
      eyebrow.style.opacity = pe;
      eyebrow.style.transform = "translateX(" + (-16 * (1 - pe)) + "px)";
    }

    // 24%–36% verdict fades in with vertical translate ONLY.
    // No scale, no letter-spacing animation: those reflow balanced text,
    // which makes words pop between lines mid-scrub. Locked layout, soft entry.
    var pv = mapRange(p, 0.24, 0.36);
    if (verdict) {
      verdict.style.opacity = pv;
      verdict.style.transform = "translateY(" + (16 * (1 - pv)) + "px)";
    }

    // 38%–58% evidence sequential reveal (stagger)
    if (evidence.length) {
      var winStart = 0.38;
      var step = 0.045;
      var segLen = 0.10;
      for (var i = 0; i < evidence.length; i++) {
        var s = winStart + i * step;
        var e = s + segLen;
        var pp = mapRange(p, s, e);
        evidence[i].style.opacity = pp;
        evidence[i].style.transform = "translateY(" + (24 * (1 - pp)) + "px)";
      }
    }

    // 60%–66% numeric line reveals
    var pn = mapRange(p, 0.60, 0.66);
    if (numeric) {
      numeric.style.opacity = pn;
      numeric.style.transform = "translateY(" + (16 * (1 - pn)) + "px)";
    }

    // 66%–94% HOLD. 94%–100% inner block fades + translates up.
    var px = mapRange(p, 0.94, 1.00);
    if (inner) {
      inner.style.opacity = 1 - px;
      inner.style.transform = "translateY(" + (-24 * px) + "px)";
      var veilIn = smooth01(mapRange(p, 0.22, 0.44));
      var veilOut = smooth01(1 - mapRange(p, 0.78, 0.90));
      panel.style.setProperty("--text-veil-opacity", (veilIn * veilOut * 0.58).toFixed(3));
    }
  }

  var panels = document.querySelectorAll(".panel");
  var panelTriggers = [];
  panels.forEach(function (panel) {
    if (reduced) {
      gsap.set(panel.querySelectorAll(".panel__eyebrow, .panel__verdict, .panel__evidence p, .panel__numeric"),
               { opacity: 0, y: 16 });
      ScrollTrigger.create({
        trigger: panel,
        start: "top 75%",
        once: true,
        onEnter: function () {
          gsap.to(panel.querySelectorAll(".panel__eyebrow, .panel__verdict, .panel__evidence p, .panel__numeric"),
                  { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08 });
        },
      });
      return;
    }

    // Hide everything to match the entry choreography on first paint.
    applyPanelProgress(panel, 0);

    var panelTrigger = ScrollTrigger.create({
      trigger: panel,
      start: "top top",
      end: "+=200%",
      pin: true,
      pinSpacing: true,
      scrub: true,
      anticipatePin: 1,
      onUpdate: function (self) {
        applyPanelProgress(panel, self.progress);
      },
    });
    panelTriggers.push(panelTrigger);
  });

  // ===== Closing section reveal ==========================================
  var closing = document.getElementById("closing");
  if (closing) {
    var cLine1 = closing.querySelector(".closing__line--1");
    var cLine2 = closing.querySelector(".closing__line--2");
    if (reduced) {
      gsap.set([cLine1, cLine2], { opacity: 1, y: 0 });
    } else {
      gsap.set([cLine1, cLine2], { opacity: 0, y: 18 });
      ScrollTrigger.create({
        trigger: closing,
        start: "top bottom",
        end: "top center",
        scrub: true,
        onUpdate: function (self) {
          var p = self.progress;
          // Line 1: reveal 0.00–0.30
          var p1 = mapRange(p, 0.00, 0.30);
          if (cLine1) {
            cLine1.style.opacity = p1;
            cLine1.style.transform = "translateY(" + (18 * (1 - p1)) + "px)";
          }
          // Line 2: reveal 0.20–0.50
          var p2 = mapRange(p, 0.20, 0.50);
          if (cLine2) {
            cLine2.style.opacity = p2;
            cLine2.style.transform = "translateY(" + (18 * (1 - p2)) + "px)";
          }
        },
      });
    }
  }

  // ===== Canopy wave timing =============================================
  // Each wave now finishes before the next text appears:
  // outgoing block starts leaving at 88%, arrows land at 8%, then the new
  // copy waits a beat before resolving.
  if (!reduced && window.bullfinchCanopy && window.bullfinchCanopy.setWaveProgress) {
    function setWave(wave, progress) {
      window.bullfinchCanopy.setWaveProgress(wave, progress);
    }

    if (hero && panelTriggers[0]) {
      ScrollTrigger.create({
        trigger: document.body,
        start: function () { return hero.offsetTop + hero.offsetHeight * 0.35; },
        end: function () {
          return panelTriggers[0].start + (panelTriggers[0].end - panelTriggers[0].start) * 0.08;
        },
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: function (self) { setWave(1, self.progress); },
      });
    }

    for (var wi = 0; wi < 4; wi++) {
      (function (idx) {
        ScrollTrigger.create({
          trigger: document.body,
          start: function () {
            return panelTriggers[idx].start + (panelTriggers[idx].end - panelTriggers[idx].start) * 0.88;
          },
          end: function () {
            return panelTriggers[idx + 1].start + (panelTriggers[idx + 1].end - panelTriggers[idx + 1].start) * 0.08;
          },
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: function (self) { setWave(idx + 2, self.progress); },
        });
      })(wi);
    }

    if (closing && panelTriggers[4] && window.bullfinchCanopy.setConvergenceProgress) {
      ScrollTrigger.create({
        trigger: document.body,
        start: function () {
          return panelTriggers[4].start + (panelTriggers[4].end - panelTriggers[4].start) * 0.88;
        },
        end: function () {
          return ScrollTrigger.maxScroll(window) - 36;
        },
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          window.bullfinchCanopy.setConvergenceProgress(self.progress);
        },
      });
    }
  }

  // ===== Global scroll-progress driver for canopy ========================
  var footer = document.getElementById("site-footer");
  var footerLine = footer && footer.querySelector(".site-footer__line");
  if (footerLine) {
    if (reduced) {
      gsap.set(footerLine, { opacity: 1, y: 0 });
    } else {
      gsap.set(footerLine, { opacity: 0, y: 12 });
      ScrollTrigger.create({
        trigger: document.body,
        start: function () { return ScrollTrigger.maxScroll(window) - 36; },
        end: function () { return ScrollTrigger.maxScroll(window); },
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          var p = self.progress;
          footerLine.style.opacity = p;
          footerLine.style.transform = "translateY(" + (12 * (1 - p)) + "px)";
        },
      });
    }
  }

  if (window.bullfinchCanopy) {
    var driver = window.bullfinchCanopy.setProgress || window.bullfinchCanopy.setLayerTint;
    if (reduced) {
      driver && driver(0);
    } else if (footer && driver) {
      ScrollTrigger.create({
        trigger: document.body,
        start: "top top",
        endTrigger: footer,
        end: "top top",
        scrub: true,
        onUpdate: function (self) {
          driver(self.progress);
        },
      });
    }
  }

  // ===== Refresh on font load + window load =============================
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      ScrollTrigger.refresh();
    });
  }
  window.addEventListener("load", function () {
    ScrollTrigger.refresh();
  });
})();
