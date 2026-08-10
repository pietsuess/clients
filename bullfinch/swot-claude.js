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
     45%  – 80%  HOLD (reader can stop scrolling and read)
     80%  – 100% un-write in place, in lockstep with the 01->02 motes/forest

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
  // Piet: the hero must NOT scroll up and get cropped. It is PINNED and its
  // copy is erased IN PARTS, in place — brand row, headline, prefix, cycle,
  // subtitle wiped one after another — then the emptied hero releases.
  var hero = document.querySelector(".hero");
  if (hero && !reduced) {
    var HERO_PARTS = [
      { sel: ".hero-brand-row",   dir: "x" },
      { sel: ".hero-is__label",   dir: "x" },
      { sel: ".hero-is__prefix",  dir: "x" },
      { sel: ".hero-is__cycle",   dir: "x" },
      { sel: ".hero__subtitle",   dir: "y" }
    ];
    ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "+=80%",
      pin: true,
      pinSpacing: true,
      scrub: true,
      anticipatePin: 1,
      onUpdate: function (self) { applyHeroLeave(self.progress); },
      // Refresh re-assert (Piet 2026-08-09 eve, client bug report): a
      // ScrollTrigger.refresh() mid-page can run this scrub through p=0 on
      // the revert pass, leaving the forest diagonal COVERING while standing
      // in 03/04. onRefresh fires after recompute with the true progress.
      onRefresh: function (self) { applyHeroLeave(self.progress || 0); },
    });
    function applyHeroLeave(p) {
      for (var hi = 0; hi < HERO_PARTS.length; hi++) {
        var el = hero.querySelector(HERO_PARTS[hi].sel);
        if (!el) continue;
        var out = smooth01(mapRange(p, 0.06 + hi * 0.13, 0.34 + hi * 0.13));
        var hid = (out * 100).toFixed(2) + "%";
        el.style.clipPath = HERO_PARTS[hi].dir === "x"
          ? "inset(0 0 0 " + hid + ")"
          : "inset(0 0 " + hid + " 0)";
      }
      setTextVeilOpacity((1 - smooth01(mapRange(p, 0.06, 0.60))) * 0.84);
      // R1 (the 00 -> 01 leave): the forest diagonal wiping off is driven by
      // THIS hero-pin progress, so the hero words erasing and the diagonal
      // covering move together on one scrub. The grid assembly (motes coming
      // up) is driven on the #problem pin's ENTRY band instead, so the motes
      // rise INTO the grid exactly as the 01 copy + TODAY readout write on
      // (R2: grid and text populate together, not grid-then-text).
      if (window.__bfSetForestWipe) window.__bfSetForestWipe(p);
    }
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
        // Closing veil is OFF (Piet): the tint + backdrop blur dimmed the
        // whole field and drew a blur-halo "stroke" around the final red
        // dot. The night-grade text sits fine on the dark field without it.
        return 0;
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
    { sel: ".trust-line",         s: 0.29, dir: "x" },
    // .problem-note (01 only) used to have NO clip, so it sat visible and rode
    // the section up during the pre-pin entry scroll (Piet's "the note slides
    // up"). It is now a normal write-on block: hidden until the pin, wiped on
    // top-down IN PLACE with the rest of 01, un-wiped on leave. No translation.
    { sel: ".problem-note",       s: 0.26, dir: "y" },
    // The team stop's headshots. Only #team has this wrapper, so every other
    // panel skips it on the `if (!group.length) continue` above. It writes on
    // just before the verdict so the faces are already there to be read by the
    // time the line about them lands — and, critically, it means the block is
    // hidden until the pin instead of riding the section up on entry.
    { sel: ".panel__people-clip", s: 0.06, dir: "y" }
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
    // R1: the 01 copy un-writes over [0.80, 1.0] of the pin — the SAME range and
    // easing the HTML unified 01->02 trigger uses to spread the motes, fade the
    // seed and wipe the forest diagonal, so all four move together on one scrub.
    // 02 with the app clip runs a much longer pin and its last evidence pair
    // is still writing on at ~0.78, so the generic 0.80 un-write would start
    // erasing the copy before the reader has reached it. Held back to 0.90.
    var clipPanel = appClipOn && panel.id === "product";
    // Leave start 0.94 of the 210% pin (Piet 2026-08-09): un-write band is
    // ~12.6vh, just wider than 03's 12svh lead, so 03 pins right after the
    // un-write begins — no dead air, and never two fully-written sections.
    // The app clip's out band below MUST stay on this same number.
    var leave = clipPanel
      ? smooth01(mapRange(p, 0.94, 1.00))
      : smooth01(mapRange(p, 0.80, 1.00));
    // 03 staggered exit (Piet 2026-08-09): the people items un-write ONE BY
    // ONE from 0.70 through the unpin instead of all together on the 0.80
    // band, dragging the exit across the run-out to 04. exitK counts
    // elements in write order each scrub (same order every call).
    var exitK = 0;
    function itemLeave() {
      if (panel.id !== "opportunity") return leave;
      // Wider spread (Piet: "start sooner finish later") — first out at
      // 0.60, cap at 0.92 so the tail finishes exactly at the unpin. An
      // uncapped tail would put starts past 1.0 and those items would ride
      // out assembled, never un-writing.
      var s0 = Math.min(0.60 + exitK * 0.022, 0.92);
      exitK++;
      return smooth01(mapRange(p, s0, s0 + 0.08));
    }

    if (inner) {
      // The container itself carries chrome (03's frosted background + blur,
      // grid borders) that the per-child clips can't hide — wipe it with the
      // same language so nothing outlives the content (the grey-slab-over-
      // the-closing bug).
      // Negative outsets on top/sides: the section-mark icons overhang the
      // container box, and an exact-box inset CROPPED them (the cut icon
      // Piet flagged). Only the bottom edge animates; at full reveal the
      // bottom is also negative so nothing that overhangs is ever clipped.
      // 03: the container chrome wipes LAST (0.92 -> 1.00), behind the
      // staggered items, or its bottom-up clip would erase them mid-cascade.
      var innerLeave = (panel.id === "opportunity")
        ? smooth01(mapRange(p, 0.92, 1.00))
        : leave;
      var innerW = smooth01(mapRange(p, 0.02, 0.12)) * (1 - innerLeave);
      var innerHid = ((1 - innerW) * 140 - 40).toFixed(2);
      inner.style.clipPath = "inset(-40% -12% " + innerHid + "% -12%)";
      var veilIn = smooth01(mapRange(p, 0.02, 0.16));
      var veilOut = smooth01(1 - mapRange(p, 0.92, 1.00));
      setTextVeilOpacity(veilIn * veilOut * 0.84);
    }

    // 03 (#opportunity): trees + species data are already done at pin start,
    // so the lower bar (audience grid + partners strip) must not trickle in
    // on the generic bands (~45% of the pin). Compressed bands finish it by
    // ~0.18 — effectively with the data.
    // Trees form by 0.08 of the pin and the species data finishes WITH the
    // formation — so the whole lower bar must be done by ~0.08 too, not
    // trailing after (Piet: finishes at the SAME time as the data).
    // 03 (#opportunity): the lower panel (audience grid + partners strip) no
    // longer snap-crops in the first 0.08. It reveals as a STAGGERED CASCADE —
    // eyebrow/verdict, then each audience cell in turn, then the partners label
    // and each logo one by one — finishing at ~0.22 of the pin, IN LOCKSTEP
    // with the tree species data (which the HTML tree trigger now counts up on
    // this same on-screen window). Both land together instead of the bar
    // snapping while the data is still counting.
    var fastBar = panel.id === "opportunity";
    // Parallel to WRITE_ORDER — one entry per selector, or the fast bar reads
    // the wrong start times. Last entry is .panel__people-clip (03's fast bar
    // has no people block, so the value is never used).
    var FAST_S = [0.03, 0.05, 0.00, 0.06, 0.00, 0.16, 0.00, 0.00];
    var writeWindow = fastBar ? 0.06 : 0.16;
    var writeStagger = fastBar ? 0.024 : 0.03;
    // DEV (data-map-points) 01 hold-back (Piet 2026-08-08 night): the LEFT
    // copy waits — photo lands with the hero leave, TODAY readout arrives on
    // its usual beat — then eyebrow/verdict/evidence/numeric write on over
    // the dots animation (0.30 -> ~0.55 of the pin) while the photo steps
    // back to its resting wash. Parallel to WRITE_ORDER; null = keep the
    // generic start. The bottom note (over the map) keeps its own beat.
    var PROBLEM_S = [0.30, 0.33, 0.37, null, 0.39, null, null, null];
    var mapPanel = mapPointsOn && panel.id === "problem";

    for (var si = 0; si < WRITE_ORDER.length; si++) {
      // #opportunity's partners strip is owned by the per-logo cascade below,
      // so skip the block-level .trust-line clip here (avoids a double clip).
      if (fastBar && WRITE_ORDER[si].sel === ".trust-line") continue;
      var group = panel.querySelectorAll(WRITE_ORDER[si].sel);
      // Map-lead dev (2026-08-09): teaser-dev reparents 01's stat block to a
      // viewport-fixed layer OUTSIDE the article, taking .problem-note with
      // it. This query is live, so find it by its block instead. Prod and
      // phone never reparent and never reach the fallback.
      if (!group.length && mapPanel) {
        group = document.querySelectorAll(".panel__stat--problem " + WRITE_ORDER[si].sel);
      }
      if (!group.length) continue;
      var s = fastBar ? FAST_S[si] : WRITE_ORDER[si].s;
      if (mapPanel && PROBLEM_S[si] != null) s = PROBLEM_S[si];
      var horizontal = WRITE_ORDER[si].dir === "x";
      // Piet: Wear / Walk / Data come on ONE BY ONE across the whole of 02,
      // including the stretch where the app clip is up — not bunched into the
      // first third on the generic 0.03 stagger. Explicit starts, because the
      // spacing is a read-the-copy decision, not an even division.
      // Pulled forward (Piet): the last of the three used to land at 0.60-0.74
      // of a very long pin, well after the device had finished.
      var spread = (clipPanel && WRITE_ORDER[si].sel === ".panel__evidence p")
        ? [0.0857, 0.3429, 0.60]
        : null;
      for (var gi = 0; gi < group.length; gi++) {
        var gs = spread ? (spread[gi] !== undefined ? spread[gi] : s) : s + gi * writeStagger;
        var gw = spread ? 0.24 : writeWindow;
        var e = smooth01(mapRange(p, gs, gs + gw));
        var w = e * (1 - itemLeave());
        var hidden = ((1 - w) * 100).toFixed(2) + "%";
        group[gi].style.clipPath = horizontal
          ? "inset(0 " + hidden + " 0 0)"
          : "inset(0 0 " + hidden + " 0)";
      }
    }

    // 03 partners strip: the "Partners and recognition" label writes first,
    // then each logo clips on in quick succession through ~0.22, so the strip
    // BUILDS logo-by-logo (a detection cascade) instead of one block crop, and
    // lands with the audience cells and the tree data.
    if (fastBar) {
      var trustLabel = panel.querySelector(".trust-label");
      if (trustLabel) {
        var lw = smooth01(mapRange(p, 0.11, 0.17)) * (1 - itemLeave());
        trustLabel.style.clipPath = "inset(0 " + ((1 - lw) * 100).toFixed(2) + "% 0 0)";
      }
      var logos = panel.querySelectorAll(".trust-strip > div");
      for (var li = 0; li < logos.length; li++) {
        var le = smooth01(mapRange(p, 0.13 + li * 0.009, 0.13 + 0.05 + li * 0.009));
        var lww = le * (1 - itemLeave());
        logos[li].style.clipPath = "inset(0 0 " + ((1 - lww) * 100).toFixed(2) + "% 0)";
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
  // DEV opt-in. 02 has to carry the device sequence AND the app clip after it,
  // so its pin is lengthened to make real room rather than squeezing the clip
  // into what was left over.
  var appClipOn = document.body.hasAttribute("data-app-clip");
  var mapPointsOn = document.body.hasAttribute("data-map-points");
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
        : (appClipOn && panel.id === "product"
            // 420% -> 360% -> 300% -> 210% (Piet 2026-08-09: "a big wait zone
            // that just needs to be cut, everything brought up to make it
            // like that space never existed"). Every pre-leave dev fraction
            // below is retimed so the absolute scroll distances are
            // unchanged (Data still done ~176vh, video seats ~144vh); the
            // leave fraction is 0.94, so the exit starts ~197vh —
            // ~21vh after Data completes, zero dead tail into 03.
            ? (mobileLike ? "+=280%" : "+=210%")
            : (mobileLike ? "+=100%" : "+=150%")),
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

  // ===== Seed (first red dot) ============================================
  // Piet: the seed is VISIBLE FROM THE VERY FIRST SCREEN, seated at the
  // exact screen spot it occupies in the pinned grid, and it does not move
  // until after the grid. No reveal trigger — the scene defaults it to 1.

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
  // the ONE element allowed to slide in. The closing veil itself is OFF
  // (Piet): it dimmed/blurred the field and put a stroke halo around the
  // final dot. This trigger now just guarantees the veil is fully cleared,
  // including any residue left by panel 3's leave band on fast scrolls.
  var closing = document.querySelector(".closing");
  if (closing && !reduced) {
    ScrollTrigger.create({
      trigger: closing,
      start: "top bottom",
      end: "top center",
      scrub: true,
      onUpdate: function () {
        setTextVeilOpacity(0);
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

    // DEV opt-in (data-app-clip): the device sequence hands its slot to a
    // screen recording of the app in action. The PNG sequence finishes playing
    // at 288/424 of the pin (~0.679); the device only starts leaving AFTER that
    // so the animation is never cut short. The clip then holds until the 02
    // copy un-writes on its own beat (0.80 -> 1.0), and leaves with it, so the
    // pin still releases empty — nothing scrolls out.
    var appClip = appClipOn ? document.getElementById("app-clip") : null;
    // Dev playback scale. THE BUG Piet kept seeing ("the png seq fades way
    // too soon"): case-animation.js maps playback over its OWN 424 slots, so
    // the local casePlaybackFrameSlots retime never reached it — the sequence
    // was still mid-play (frame ~140 of 288) when the device faded at 0.338.
    // The scale pre-stretches the progress WE pass in, so frame 288 lands at
    // ~102vh of the pin (0.283 of 360%), comfortably before the fade-out at
    // 0.394. Clamped at the last real frame so the tail HOLDS it.
    var casePlaybackCap = 1;
    var caseFadeInStartProgress = 0;
    var casePlaybackStart = 0;
    var casePlaybackEnd = 1;
    if (appClip) {
      casePlaybackFrameSlots = 1185;
      caseFadeInEndProgress = (40 - 1) / casePlaybackFrameSlots;
      // The sequence must NOT sit frozen on its last frame (Piet). The fade-out
      // now runs 0.32 -> 0.38 and lands exactly where playback ends, so the
      // device is gone AS frame 480 arrives, never held after it.
      // Fractions rebased to the 210% pin (same absolute scroll distances as
      // the 360%-era values: ×360/210): only the post-build hold shrank.
      caseFadeOutStartProgress = 0.5486;
      // 480-frame re-render, no tail. The device holds off until ~36vh of
      // the pin, fades up over the next ~25vh, and the sequence plays to
      // ~137vh — finishing just as its fade-out ends.
      caseFadeInStartProgress = 0.1714;
      caseFadeInEndProgress = 0.2914;
      casePlaybackStart = 0.1714;
      casePlaybackEnd = 0.6514;
      casePlaybackCap = 479 / 480;
    }

    function setProductCase(value, playbackProgress) {
      if (productMedia) productMedia.style.opacity = clamp01(value);
      if (window.bullfinchCaseAnimation && window.bullfinchCaseAnimation.setScrollProgress) {
        window.bullfinchCaseAnimation.setScrollProgress(playbackProgress);
      }
    }

    // The clip SLIDES UP into the slot the device just left (0.32 -> 0.40,
    // riding the png seq fade-out) and holds while the copy writes on around
    // it. REAL VIDEO leave (Piet 2026-08-09): no more upward slide-off — the
    // recording FADES OUT IN PLACE over 0.90 -> 1.00 (start pulled a little
    // ahead of the 0.94 leave, Piet 2026-08-09), overlapping the band the 02
    // copy un-writes (clipPanel leave in applyPanelProgress), so the rest of
    // the transition begins exactly as the fade starts and 02 empties
    // straight into 03.
    // The video plays ONCE when the slide seats at 0.40; scrolling back out
    // below the arrival rewinds it so it replays on re-entry.
    var appClipVideo = appClip ? appClip.querySelector("video") : null;
    var appClipPlayed = false;
    function setAppClip(p) {
      if (!appClip) return;
      var inP = smooth01(mapRange(p, 0.5486, 0.6857));
      var outP = smooth01(mapRange(p, 0.90, 1.00));
      var travel = (1 - inP) * 116;
      appClip.style.opacity = p > 0.5486 && p < 1 ? (1 - outP).toFixed(3) : 0;
      appClip.style.setProperty("--clip-y", travel.toFixed(2) + "%");
      if (appClipVideo) {
        if (p >= 0.6857 && p < 1 && !appClipPlayed) {
          appClipPlayed = true;
          var played = appClipVideo.play();
          if (played && played.catch) played.catch(function () {});
        } else if (p < 0.5486 && appClipPlayed) {
          appClipVideo.pause();
          appClipVideo.currentTime = 0;
          appClipPlayed = false;
        }
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
          var fadeIn = smooth01(mapRange(p, caseFadeInStartProgress, caseFadeInEndProgress));
          // With the clip in play the device has to be fully gone before the
          // clip is fully up, or the two are on screen together at half opacity
          // and the swap reads as a crossfade of two objects rather than a
          // handoff of one slot.
          var fadeOut = smooth01(mapRange(p, caseFadeOutStartProgress, appClip ? casePlaybackEnd : 1.00));
          setProductCase(fadeIn * (1 - fadeOut),
                         Math.min(casePlaybackCap, mapRange(p, casePlaybackStart, casePlaybackEnd)));
          setAppClip(p);
          // 02 backdrop tint: ease the scene to light green while the device
          // section holds, back to beige before 03 arrives.
          if (window.bullfinchCanopy.setProductTintProgress) {
            window.bullfinchCanopy.setProductTintProgress(
              smooth01(mapRange(p, 0.0, 0.15)) * (1 - smooth01(mapRange(p, 0.85, 1.0)))
            );
          }
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
