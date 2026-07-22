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
          inner.style.opacity = 1 - out;
          inner.style.transform = "translateY(" + (-90 * out) + "px)";
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

  function applyPanelProgress(panel, p) {
    var eyebrow  = panel.querySelector(".panel__eyebrow");
    var verdict  = panel.querySelector(".panel__verdict");
    var evidence = panel.querySelectorAll(".panel__evidence p");
    var numeric  = panel.querySelector(".panel__numeric");
    var inner    = panel.querySelector(".panel__inner");
    var media    = panel.querySelector(".panel__video");

    // Copy arrives immediately with the panel so there is no empty viewport.
    var pe = mapRange(p, 0.00, 0.06);
    if (eyebrow) {
      eyebrow.style.opacity = pe;
      eyebrow.style.transform = "translateX(" + (-16 * (1 - pe)) + "px)";
    }

    // Optional media panels use the same read rhythm as text.
    // Product case appears earlier, halfway through the line draw, while copy timing stays locked.
    if (media) {
      var isProduct = panel.id === "product";
      var pmIn = isProduct ? 1 : smooth01(mapRange(p, 0.18, 0.30));
      var pmOut = isProduct ? 0 : smooth01(mapRange(p, 0.88, 1.00));
      var pm = pmIn * (1 - pmOut);
      var mediaX = isProduct ? 0 : -72 * (1 - pmIn) - 72 * pmOut;
      if (!isProduct || p > 0.001) media.style.opacity = pm;
      media.style.transform = isProduct ? "translate3d(0, -50%, 0)" : "translateX(" + mediaX + "px)";
    }
    if (panel.id === "opportunity" && window.bullfinchUiAnimation && window.bullfinchUiAnimation.setScrollProgress) {
      window.bullfinchUiAnimation.setScrollProgress(p);
    }

    // Verdict follows immediately after the eyebrow.
    // No scale, no letter-spacing animation: those reflow balanced text,
    // which makes words pop between lines mid-scrub. Locked layout, soft entry.
    var pv = mapRange(p, 0.02, 0.10);
    if (verdict) {
      verdict.style.opacity = pv;
      verdict.style.transform = "translateY(" + (16 * (1 - pv)) + "px)";
    }

    // Evidence settles early and remains readable for most of the pin.
    if (evidence.length) {
      var winStart = 0.08;
      var step = 0.035;
      var segLen = 0.09;
      for (var i = 0; i < evidence.length; i++) {
        var s = winStart + i * step;
        var e = s + segLen;
        var pp = mapRange(p, s, e);
        evidence[i].style.opacity = pp;
        evidence[i].style.transform = "translateY(" + (24 * (1 - pp)) + "px)";
      }
    }

    var pn = mapRange(p, 0.18, 0.24);
    if (numeric) {
      numeric.style.opacity = pn;
      numeric.style.transform = "translateY(" + (16 * (1 - pn)) + "px)";
    }

    // Hold through the reading window, then leave before the next panel arrives.
    var px = mapRange(p, 0.84, 0.96);
    if (inner) {
      inner.style.opacity = 1 - px;
      inner.style.transform = "translateY(" + (-24 * px) + "px)";
      var veilIn = smooth01(mapRange(p, 0.02, 0.16));
      var veilOut = smooth01(1 - mapRange(p, 0.80, 0.96));
      setTextVeilOpacity(veilIn * veilOut * 0.84);
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

  // ===== Closing section reveal ==========================================
  var closing = document.querySelector(".closing");
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
          setTextVeilOpacity(smooth01(mapRange(p, 0.35, 0.75)) * 0.42);
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

    for (var wi = 0; wi < 6; wi++) {
      (function (idx) {
        if (!panelTriggers[idx] || !panelTriggers[idx + 1]) return;
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
          onUpdate: function (self) {
            setWave(idx + 1, self.progress);
          },
        });
      })(wi);
    }

    if (panelTriggers[0] && panelTriggers[1] && panelTriggers[2]) {
      ScrollTrigger.create({
        trigger: document.body,
        start: function () {
          return panelTriggers[0].start + (panelTriggers[0].end - panelTriggers[0].start) * 0.88;
        },
        end: function () {
          return panelTriggers[2].start + (panelTriggers[2].end - panelTriggers[2].start) * 0.08;
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
