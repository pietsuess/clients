/* Bullfinch — pinned verdict choreography + scroll-progress driver (v8,
   Claude fork: CAPTURE MODEL).

   ANIMATION MODEL — data capture, no fades, no slides:
     Copy never opacity-fades and never translates. Each element WRITES ON in
     place via a clip wipe (the same language as the tree readouts' --write:
     left-to-right for single lines, top-to-bottom for multi-line justified
     blocks), holds through the pin, then is WIPED away in place (reverse
     wipe) before the pin releases — the empty panel scrolls off, nothing
     drags up or crossfades. Tree readouts are owned ENTIRELY by
     writeTreeData in the HTML (write-on + count-up); never touched here.
     The closing card is the sole allowed slide (owned by the HTML).

   PANEL PIN (scrub: true):
     ~5%  – 45%  elements write on in sequence (eyebrow → verdict →
                 evidence/audience → numeric → trust line)
     45%  – 88%  HOLD (reader can stop scrolling and read)
     88%  – 98%  un-write in place; gone before the pin releases

   HERO EXIT (over ~0.30 of the hero scroll):
     headline WIPES out top-down in place (no fade) while the forest
     diagonal runs its own slower hide on a separate trigger.

   GLOBAL SCROLL → canopy:
     window.bullfinchCanopy.setProgress(t)
     where t is progress from top-of-page to top-of-footer (0..1).

   REDUCED MOTION:
     No Lenis (scroll.js handles), no scrubs, no pins.
     Simple on-enter reveals. Canvas is already hidden in fallback.
*/
(function () {
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobileLike = window.matchMedia && window.matchMedia("(max-width: 720px)").matches;

  // ---- Safety: if GSAP didn't load, just reveal everything --------------
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
    document
      .querySelectorAll(".panel__eyebrow, .panel__verdict, .panel__evidence p, .panel__numeric, .hero__eyebrow, .hero__line")
      .forEach(function (el) { el.style.opacity = 1; el.style.transform = "none"; });
    // No scroll choreography here, so don't leave the cue bouncing forever.
    document.body.classList.add("has-reached-01");
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  // ===== Splash handoff reveal of hero =================================
  var hasTeaserHero = Boolean(document.querySelector(".hero-is"));
  if (!hasTeaserHero) {
    gsap.set(".hero__eyebrow", { opacity: 0, x: -44, y: 0 });
    gsap.set(".hero__line",    { opacity: 0, x: -72, y: 0 });
  }

  var heroRevealed = false;
  function revealHero() {
    if (heroRevealed) return;
    heroRevealed = true;
    if (hasTeaserHero) return;
    gsap.to(".hero__eyebrow", { opacity: 1, x: 0, duration: 0.72, ease: "power3.out", delay: 0.05 });
    gsap.to(".hero__line--1", { opacity: 1, x: 0, duration: 0.78, ease: "power3.out", delay: 0.23 });
    gsap.to(".hero__line--2", { opacity: 1, x: 0, duration: 0.78, ease: "power3.out", delay: 0.41 });
  }

  document.addEventListener("bullfinch:splashcomplete", revealHero);
  if (!document.getElementById("splash") || document.body.classList.contains("has-entered")) {
    window.setTimeout(revealHero, 80);
  }

  // ===== Hero exit motion ================================================
  // The copy leaves quickly while the single forest diagonal continues its
  // slower hide on a separate, longer trigger in GPT-Teaser.html.
  var hero = document.querySelector(".hero");
  if (hero && !reduced) {
    ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "bottom top",
      scrub: true,
      onUpdate: function (self) {
        var p = self.progress;
        var out = smooth01(mapRange(p, 0.04, 0.30));
        var inner = hero.querySelector(".hero__inner");
        if (inner) {
          // No fade: the headline is WIPED away top-down in place — erased
          // like cleared data — while the forest diagonal continues its own
          // slower hide behind it. Fully reversible on upward scroll.
          inner.style.clipPath = "inset(" + (out * 100).toFixed(2) + "% 0 0 0)";
        }
        setTextVeilOpacity((1 - out) * 0.84);
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
  var lastTextVeilOpacity = 0.84;
  function setTextVeilOpacity(value) {
    if (!isFinite(value)) value = 0;
    lastTextVeilOpacity = clamp01(value);
    document.documentElement.style.setProperty("--text-veil-opacity", lastTextVeilOpacity.toFixed(3));
  }
  function computeTextVeilOpacityFromScroll() {
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (hero) {
      var heroTop = hero.offsetTop || 0;
      var heroHeight = hero.offsetHeight || window.innerHeight || 1;
      if (scrollY < heroTop + heroHeight) {
        var hp = clamp01((scrollY - heroTop) / heroHeight);
        var h1 = 1 - clamp01((hp - 0.18) / 0.18);
        var h2 = 1 - clamp01((hp - 0.30) / 0.18);
        return smooth01(Math.max(h1, h2)) * 0.84;
      }
    }
    if (panelTriggers && panelTriggers.length) {
      for (var i = 0; i < panelTriggers.length; i++) {
        var trigger = panelTriggers[i];
        if (scrollY + 1 >= trigger.start && scrollY - 1 <= trigger.end) {
          var pp = clamp01((scrollY - trigger.start) / (trigger.end - trigger.start || 1));
          var veilIn = smooth01(mapRange(pp, 0.22, 0.44));
          var veilOut = smooth01(1 - mapRange(pp, 0.84, 1.00));
          return veilIn * veilOut * 0.84;
        }
      }
    }
    var closingEl = closing || document.querySelector(".closing");
    if (closingEl) {
      var rect = closingEl.getBoundingClientRect();
      if (rect.top <= window.innerHeight) {
        var cp = clamp01((window.innerHeight - rect.top) / ((window.innerHeight * 0.5) || 1));
        return smooth01(mapRange(cp, 0.35, 0.75)) * 0.42;
      }
    }
    return 0;
  }
  function refreshTextVeilLayer() {
    var veil = document.querySelector(".text-veil");
    var previousTransition = veil && veil.style.transition;
    if (veil) veil.style.transition = "none";
    if (window.ScrollTrigger && window.ScrollTrigger.update) {
      window.ScrollTrigger.update();
    }
    setTextVeilOpacity(computeTextVeilOpacityFromScroll());
    if (!veil) return;
    veil.style.transform = "translate3d(0, 0, 0) scale(1.0001)";
    void veil.offsetHeight;
    veil.style.transform = "translate3d(0, 0, 0)";
    if (previousTransition) {
      veil.style.transition = previousTransition;
    } else {
      veil.style.removeProperty("transition");
    }
  }
  function scheduleTextVeilRefresh() {
    refreshTextVeilLayer();
    window.setTimeout(refreshTextVeilLayer, 80);
    window.setTimeout(refreshTextVeilLayer, 220);
    window.setTimeout(refreshTextVeilLayer, 520);
  }

  // Write-on order. dir "x" = left-to-right wipe (single lines); dir "y" =
  // top-to-bottom wipe (multi-line justified blocks, where a horizontal wipe
  // would break across line endings). .ground-heading is covered by its
  // eyebrow/verdict children — no block-level clip on it (nested clips would
  // compose two directions on the same text).
  var WRITE_ORDER = [
    { sel: ".panel__eyebrow",     s: 0.05, dir: "x" },
    { sel: ".panel__verdict",     s: 0.10, dir: "y" },
    { sel: ".panel__evidence p",  s: 0.16, dir: "y" },
    { sel: ".audience-item",      s: 0.16, dir: "y" },
    { sel: ".panel__numeric",     s: 0.24, dir: "x" },
    { sel: ".trust-line",         s: 0.29, dir: "x" }
  ];

  function applyPanelProgress(panel, p) {
    var inner = panel.querySelector(".panel__inner");
    var media = panel.querySelector(".panel__video");

    // CAPTURE-MODEL choreography (Claude fork): nothing fades, nothing slides.
    // Copy is revealed the way data is captured — each element WRITES ON in
    // place via a clip wipe on its own beat — then everything is UN-WRITTEN in
    // place before the pin releases, so the empty panel scrolls off with no
    // drift and no crossfade. The blocks themselves never move. Tree readouts
    // are owned entirely by writeTreeData in the HTML (write-on + count-up) —
    // never touch their opacity or transform here.
    var leave = smooth01(mapRange(p, 0.88, 0.98));

    if (inner) {
      // The container itself carries chrome (03's frosted background + blur,
      // grid borders) that the per-child clips can't hide — wipe it with the
      // same language so nothing outlives the content (the grey-slab-over-
      // the-closing bug).
      // Negative outsets on top/sides: the section-mark icons overhang the
      // container box, and an exact-box inset CROPPED them (the cut icon
      // Piet flagged). Only the bottom edge animates; at full reveal the
      // bottom is also negative so nothing that overhangs is ever clipped.
      var innerW = smooth01(mapRange(p, 0.02, 0.12)) * (1 - leave);
      var innerHid = ((1 - innerW) * 140 - 40).toFixed(2);
      inner.style.clipPath = "inset(-40% -12% " + innerHid + "% -12%)";
      var veilIn = smooth01(mapRange(p, 0.02, 0.16));
      var veilOut = smooth01(1 - mapRange(p, 0.92, 1.00));
      setTextVeilOpacity(veilIn * veilOut * 0.84);
    }

    for (var si = 0; si < WRITE_ORDER.length; si++) {
      var group = panel.querySelectorAll(WRITE_ORDER[si].sel);
      if (!group.length) continue;
      var s = WRITE_ORDER[si].s;
      var horizontal = WRITE_ORDER[si].dir === "x";
      for (var gi = 0; gi < group.length; gi++) {
        var e = smooth01(mapRange(p, s + gi * 0.03, s + 0.16 + gi * 0.03));
        var w = e * (1 - leave);
        var hidden = ((1 - w) * 100).toFixed(2) + "%";
        group[gi].style.clipPath = horizontal
          ? "inset(0 " + hidden + " 0 0)"
          : "inset(0 0 " + hidden + " 0)";
      }
    }

    // Media: the #product case is a fixed layer whose fade is owned by
    // setProductCase (in AND out, within the pin) — don't fight it here.
    if (media) {
      media.style.transform = (panel.id === "product") ? "translate3d(0, -50%, 0)" : "none";
    }
    if (panel.id === "opportunity" && window.bullfinchUiAnimation && window.bullfinchUiAnimation.setScrollProgress) {
      window.bullfinchUiAnimation.setScrollProgress(p);
    }
  }

  var panels = document.querySelectorAll(".panel");
  var panelTriggers = [];
  panels.forEach(function (panel, panelIndex) {
    var isFirstPanel = panelIndex === 0;
    if (reduced) {
      gsap.set(panel.querySelectorAll(".panel__eyebrow, .panel__verdict, .panel__evidence p, .panel__numeric"),
               { opacity: 0, y: 16 });
      gsap.set(panel.querySelectorAll(".panel__video"), { opacity: 0, x: -72 });
      ScrollTrigger.create({
        trigger: panel,
        start: "top 75%",
        once: true,
        onEnter: function () {
          gsap.to(panel.querySelectorAll(".panel__eyebrow, .panel__verdict, .panel__evidence p, .panel__numeric"),
                  { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08 });
          gsap.to(panel.querySelectorAll(".panel__video"),
                  { opacity: 1, x: 0, duration: 0.7, ease: "power3.out" });
          // No pin scrub in reduced mode, so retire the scroll cue the moment
          // section 01 is reached and its copy settles.
          if (isFirstPanel) document.body.classList.add("has-reached-01");
        },
      });
      return;
    }

    // Hide everything to match the entry choreography on first paint.
    applyPanelProgress(panel, 0);

    var panelTrigger = ScrollTrigger.create({
      trigger: panel,
      start: "top top",
      // Halve the pin distance on mobile so a thumb scroll covers twice the
      // choreography (less scrolling to get through each section). Wave timing
      // references these triggers, so it scales automatically. The market
      // bullseye (#proof) gets a much longer pin so the finished $6B TAM holds
      // for a long stretch and is genuinely hard to scroll past.
      end: panel.id === "proof"
        ? (mobileLike ? "+=220%" : "+=380%")
        : (mobileLike ? "+=100%" : "+=150%"),
      pin: true,
      pinSpacing: true,
      scrub: true,
      anticipatePin: 1,
      onUpdate: function (self) {
        applyPanelProgress(panel, self.progress);
        // Retire the bouncing scroll cue once section 01 is fully settled:
        // all copy up, veil at full blur, sitting in the 0.66-0.94 HOLD just
        // before the panel begins to leave. One-way (resetSplash clears it).
        if (isFirstPanel && self.progress >= 0.66) {
          document.body.classList.add("has-reached-01");
        }
      },
    });
    panelTriggers.push(panelTrigger);
  });

  // ===== Seed (first red dot) reveal =====================================
  // Invisible while the hero headline holds; scales 0 -> full over the scroll
  // from the hero into section 01 (the first panel reaching the top).
  if (!reduced && window.bullfinchCanopy && window.bullfinchCanopy.setSeedReveal) {
    var firstPanel = panels[0];
    if (firstPanel) {
      window.bullfinchCanopy.setSeedReveal(0);
      ScrollTrigger.create({
        trigger: firstPanel,
        start: "top bottom",   // panel 01 enters as the hero scrolls away
        end: "top top",        // panel 01 pinned at top = section 01 arrived
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          window.bullfinchCanopy.setSeedReveal(self.progress);
        },
      });
    }
  }

  // ===== Product case: size model to the space left above the text =======
  // The text is bottom-anchored in CSS so it is ALWAYS fully on screen. Measure
  // the text block and size the model to fill everything above it — as large as
  // possible without pushing the text off-screen. Mobile only; desktop keeps
  // its own side-by-side layout.
  var productPanel = document.getElementById("product");
  var productInner = productPanel && productPanel.querySelector(".panel__inner");
  var caseModel = document.querySelector(".case-fixed-layer.panel__model");
  function layoutProductCase() {
    if (!caseModel || !productPanel || !productInner) return;
    if (!mobileLike) { caseModel.style.height = ""; return; }
    // Size from STABLE, scroll-independent values: the panel is 100svh and the
    // text is bottom-anchored within it, so model height = panel height minus
    // (text + padding + gap). This stays constant regardless of scroll
    // position, so the model holds a FIXED spot (no "rising into place"), while
    // still leaving the full text on screen. Recompute only on layout changes.
    var panelH = productPanel.offsetHeight;     // 100svh, stable
    var textH = productInner.offsetHeight;      // stable
    var padBottom = 24;                         // mobile .panel padding-bottom
    var gap = Math.round(panelH * 0.02);
    var modelH = panelH - padBottom - textH - gap;
    modelH = Math.max(150, Math.min(modelH, Math.round(panelH * 0.72)));
    caseModel.style.height = modelH + "px";
  }
  layoutProductCase();
  window.addEventListener("resize", layoutProductCase);
  window.addEventListener("orientationchange", layoutProductCase);
  window.addEventListener("load", layoutProductCase);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(layoutProductCase);
  }

  // ===== Nav scroll-spy ==================================================
  // Always keep one section lit. Pinned panels use their full pin range, and
  // each item remains active until the next section takes over.
  var navLinks = document.querySelectorAll(".site-nav__links a[data-scroll-target]");
  var navItems = Array.prototype.slice.call(navLinks).map(function (link) {
    var sel = link.getAttribute("data-scroll-target");
    return {
      link: link,
      section: sel && document.querySelector(sel),
    };
  }).filter(function (item) {
    return item.section;
  });
  function panelTriggerFor(section) {
    for (var i = 0; i < panelTriggers.length; i++) {
      if (panelTriggers[i].trigger === section) return panelTriggers[i];
    }
    return null;
  }
  function navStartFor(item) {
    var panelTrigger = panelTriggerFor(item.section);
    if (panelTrigger) return panelTrigger.start;
    if (item.section.id === "closing" && panelTriggers.length) {
      return panelTriggers[panelTriggers.length - 1].end;
    }
    return Math.max(0, item.section.getBoundingClientRect().top + window.pageYOffset - window.innerHeight * 0.5);
  }
  function updateCurrentNavLink() {
    if (!navItems.length) return;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    var current = navItems[0];
    navItems.forEach(function (item) {
      if (scrollY + 2 >= navStartFor(item)) current = item;
    });
    navItems.forEach(function (item) {
      item.link.classList.toggle("is-current", item === current);
    });
  }
  if (navItems.length) {
    ScrollTrigger.create({
      trigger: document.body,
      start: "top top",
      end: function () { return ScrollTrigger.maxScroll(window); },
      scrub: true,
      invalidateOnRefresh: true,
      onUpdate: updateCurrentNavLink,
      onRefresh: updateCurrentNavLink,
    });
    updateCurrentNavLink();
  }

  // ===== Closing section veil ============================================
  // The closing card's arrival is owned by the HTML (revealClosing) — it is
  // the ONE element allowed to slide in. No fades, no duplicate line
  // choreography here; this trigger only runs the text veil.
  var closing = document.querySelector(".closing");
  if (closing && !reduced) {
    ScrollTrigger.create({
      trigger: closing,
      start: "top bottom",
      end: "top center",
      scrub: true,
      onUpdate: function (self) {
        setTextVeilOpacity(smooth01(mapRange(self.progress, 0.35, 0.75)) * 0.42);
      },
    });
  }

  // ===== Canopy wave timing =============================================
  // Each wave starts only after the current text has had time to sit, then
  // lands as the next text block begins. Wave 1 intentionally waits until
  // after the "forest data stack" panel instead of running from the hero.
  if (!reduced && window.bullfinchCanopy && window.bullfinchCanopy.setWaveProgress) {
    var productMedia = document.querySelector(".case-fixed-layer");
    var casePlaybackFrameSlots = 288 + 136;
    var caseFadeInEndProgress = (40 - 1) / casePlaybackFrameSlots;
    var caseFadeOutStartProgress = (288 + 96 - 1) / casePlaybackFrameSlots;
    function setProductCase(value, playbackProgress) {
      if (productMedia) productMedia.style.opacity = clamp01(value);
      if (window.bullfinchCaseAnimation && window.bullfinchCaseAnimation.setScrollProgress) {
        window.bullfinchCaseAnimation.setScrollProgress(playbackProgress);
      }
    }

    function setWave(wave, progress) {
      window.bullfinchCanopy.setWaveProgress(wave, progress);
    }

    // Claude fork: the cascade waves are NO LONGER driven here. The old loop
    // tied each wave to a panel-to-panel transition, but the teaser only has 3
    // panels, so waves 3-6 never fired (only ~15 of the lines drew). The scene
    // now drives the waves directly from global scroll (see setProgress) so the
    // network draws continuously across the whole journey. `setWave` is left in
    // place for the convergence path below.
    void setWave;

    if (panelTriggers[0] && panelTriggers[1] && panelTriggers[2]) {
      ScrollTrigger.create({
        trigger: document.body,
        start: function () {
          return panelTriggers[1].start;
        },
        end: function () {
          return panelTriggers[1].end;
        },
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          var p = self.progress;
          var fadeIn = smooth01(mapRange(p, 0.00, caseFadeInEndProgress));
          var fadeOut = smooth01(mapRange(p, caseFadeOutStartProgress, 1.00));
          setProductCase(fadeIn * (1 - fadeOut), p);
        },
      });
    }

    var finalPanelIdx = panelTriggers.length - 1;
    if (closing && panelTriggers[finalPanelIdx] && window.bullfinchCanopy.setConvergenceProgress) {
      // Convergence runs from just after the final panel unpins to the moment
      // the closing section is fully settled in the viewport (its bottom at the
      // viewport bottom). Because the footer now lives INSIDE .closing, that
      // settle point is the true end of the page on every device — no
      // per-device maxScroll / offsetTop guesses.
      ScrollTrigger.create({
        trigger: closing,
        start: function () {
          var finalPanel = panelTriggers[finalPanelIdx];
          return finalPanel.start + (finalPanel.end - finalPanel.start) * 0.88;
        },
        endTrigger: closing,
        end: "bottom bottom",
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
      // Part of the closing card, so it shares the closing's slide carve-out —
      // but no fade: always fully opaque, settling the last 12px into place.
      gsap.set(footerLine, { opacity: 1, y: 12 });
      ScrollTrigger.create({
        trigger: document.body,
        start: function () { return ScrollTrigger.maxScroll(window) - 36; },
        end: function () { return ScrollTrigger.maxScroll(window); },
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          footerLine.style.transform = "translateY(" + (12 * (1 - self.progress)) + "px)";
        },
      });
    }
  }

  if (window.bullfinchCanopy) {
    var driver = window.bullfinchCanopy.setProgress || window.bullfinchCanopy.setLayerTint;
    if (reduced) {
      driver && driver(0);
    } else if (closing && driver) {
      var driverConfig = {
        trigger: document.body,
        start: "top top",
        scrub: true,
        onUpdate: function (self) {
          driver(self.progress);
        },
      };
      // Global descent progress lands at 1.0 exactly when the closing section
      // is settled — same on every viewport now that the footer is inside it.
      driverConfig.endTrigger = closing;
      driverConfig.end = "bottom bottom";
      ScrollTrigger.create(driverConfig);
    }
  }

  // ===== Refresh on font load + window load =============================
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      ScrollTrigger.refresh();
    });
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    scheduleTextVeilRefresh();
  });
  window.addEventListener("focus", function () {
    scheduleTextVeilRefresh();
  });
  window.addEventListener("pageshow", function () {
    scheduleTextVeilRefresh();
  });
  window.addEventListener("load", function () {
    ScrollTrigger.refresh();
    scheduleTextVeilRefresh();
  });
})();
