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

  // Piet 2026-08-11, phone: "why is there so much popping around of elements".
  // A mobile browser fires resize every time the URL bar slides in or out, and
  // every one of those refreshes ScrollTrigger: pins re-measure, scrubs
  // re-evaluate, and anything sized off the viewport re-lays out mid-scroll.
  // ignoreMobileResize tells it to skip refreshes caused by a viewport HEIGHT
  // change alone on touch devices, which is exactly that case; a real rotation
  // or width change still refreshes.
  ScrollTrigger.config({ ignoreMobileResize: true });

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
  // 02's Wear / Walk / Data write-on starts and window (see the spread in
  // applyPanelProgress). Named because the phone recording keys off them:
  // it rises only once Walk has finished writing (2026-10-14).
  var PRODUCT_EVIDENCE_STARTS = [0.0857, 0.3429, 0.60];
  var PRODUCT_EVIDENCE_WINDOW = 0.24;
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

    // PHONE 03 = TWO STOPS (Piet 2026-08-17: "make applications a second sub
    // 03 so 03a and 03b team and application and have them animate out and in
    // each"). Both halves share one grid cell on phone (see the 720 block), so
    // each owns the whole screen in its turn. This retires the two models that
    // failed before it: the 08-14 overflow lift and the 08-16 1:1 walk, whose
    // measured --opp-lift under-read the flex-shrunk .team-half and painted
    // the bios over the band. Nothing translates now — it is all write-on and
    // un-write, which is the animate-out-in-place language the rest of the
    // page already speaks.
    //
    // Bands are fractions of the flat 200% pin and are ABSOLUTE (oppDelay is
    // desktop-only below): 03a's first beat at 0.07 is ~14vh in, the same
    // clearance from 02's verdict that the 0.10 delay used to buy.
    //   03a  in 0.07-0.32   hold   out 0.38-0.55
    //   03b  in 0.59-0.83   hold   out 0.88-0.99
    // `s` is indexed by WRITE_ORDER position; `step` staggers within a group.
    var oppTwoPhase = mobileLike && panel.id === "opportunity";
    var OPP_A = {
      s: [0.02, 0.05, 0.09, null, 0.16, null, null, 0.00],
      in0: 0.07, step: 0.022, win: 0.09,
      out0: 0.38, outStep: 0.012, outCap: 0.48, outWin: 0.07
    };
    var OPP_B = {
      s: [0.02, 0.05, null, 0.09, null, null, null, null],
      in0: 0.59, step: 0.020, win: 0.08,
      out0: 0.88, outStep: 0.008, outCap: 0.92, outWin: 0.07
    };
    // Exit-cascade counters, one per phase, advanced in WRITE_ORDER order so
    // every scrub numbers the elements identically.
    var oppAK = 0, oppBK = 0;
    function oppBand(el, si, gj) {
      var ph = (el.closest && el.closest(".team-half")) ? OPP_A : OPP_B;
      var sOff = (ph.s[si] == null) ? ph.s[0] : ph.s[si];
      var st = ph.in0 + sOff + gj * ph.step;
      var os = Math.min(
        ph.out0 + (ph === OPP_A ? oppAK++ : oppBK++) * ph.outStep,
        ph.outCap
      );
      return smooth01(mapRange(p, st, st + ph.win)) *
        (1 - smooth01(mapRange(p, os, os + ph.outWin)));
    }
    var oppWalkEnd = 0.82;
    if (mobileLike && panel.id === "opportunity") {
      // The lift is retired; assert 0 so a stale --opp-rise from an older
      // cached script can never leave the halves translated.
      panel.style.setProperty("--opp-rise", "0");
    }

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
    // 03 entry delay (Piet 2026-08-16: "one needs to be gone sooner or the
    // other come in later" — 02's verdict was still up while 03's copy was
    // already written). Every 03 write band starts 0.10 of the pin later;
    // exits are untouched. One dial.
    var oppDelay = (panel.id === "opportunity") ? 0.10 : 0;
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
      var s0 = mobileLike
        // Phone scroll-through: exits wait for the measured walk to finish,
        // then cascade through the viewport-length tail.
        ? Math.min(oppWalkEnd + 0.02 + exitK * 0.012, 0.96)
        : Math.min(0.60 + exitK * 0.022, 0.92);
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
      var innerW = smooth01(mapRange(p, 0.02 + oppDelay, 0.12 + oppDelay)) * (1 - innerLeave);
      if (oppTwoPhase) {
        // 03b's chrome (the ground-heading rule, the audience cell borders)
        // opens just before its first beat and wipes LAST, behind the items —
        // and, critically, it is what keeps the whole applications band off
        // the screen for the entirety of 03a.
        innerW = smooth01(mapRange(p, 0.57, 0.63)) *
          (1 - smooth01(mapRange(p, 0.94, 1.00)));
      }
      var innerHid = ((1 - innerW) * 140 - 40).toFixed(2);
      inner.style.clipPath = "inset(-40% -12% " + innerHid + "% -12%)";
      var veilIn = smooth01(mapRange(p, 0.02, 0.16));
      var veilOut = smooth01(1 - mapRange(p, 0.92, 1.00));
      setTextVeilOpacity(veilIn * veilOut * 0.84);
    }

    // NO CLIP ON .eyebrow-anchor. It was here to take the TEAM mark off
    // screen for 03b, and it CROPPED THE ICON: inset() percentages resolve
    // against the element's own border box, the anchor is one text line tall,
    // so -40%/-12% came out around -10px/-7px against a .section-mark that is
    // a 128px box centred on the line and overhanging it by ~52px each way.
    // The same percentages are safe on .panel__inner only because that box is
    // the full screen. The marks now retire themselves per stop instead — see
    // the per-stop scrub windows in the section-mark script in teaser-dev.html.

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
        ? PRODUCT_EVIDENCE_STARTS
        : null;
      // Phase-local group indices: .panel__eyebrow and .panel__verdict each
      // match once per half, so the applications copy must count from 0 in
      // its own phase rather than inheriting the team element's stagger slot.
      var gjA = 0, gjB = 0;
      for (var gi = 0; gi < group.length; gi++) {
        var gs = spread ? (spread[gi] !== undefined ? spread[gi] : s) : s + gi * writeStagger;
        var gw = spread ? PRODUCT_EVIDENCE_WINDOW : writeWindow;
        var e = smooth01(mapRange(p, gs + oppDelay, gs + oppDelay + gw));
        var w = e * (1 - itemLeave());
        if (oppTwoPhase) {
          var onTeam = !!(group[gi].closest && group[gi].closest(".team-half"));
          w = (WRITE_ORDER[si].sel === ".panel__people-clip")
            // FACES ARE HELD ACROSS BOTH STOPS (Piet 2026-08-17: "keep their
            // pictures up for applications since you are not using the op
            // half"). They write on with 03a's first beat and leave at the
            // unpin with 03b's chrome — only the team COPY un-writes between
            // the stops. Nothing moves: the un-written copy keeps its layout
            // slot, so the faces sit exactly where 03a left them.
            ? smooth01(mapRange(p, OPP_A.in0, OPP_A.in0 + OPP_A.win)) *
              (1 - smooth01(mapRange(p, 0.94, 1.00)))
            : oppBand(group[gi], si, onTeam ? gjA++ : gjB++);
        }
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
      // The strip lives in .panel__inner, so on phone it is pure 03b: same
      // cascade, retimed onto phase B's bands.
      var trustLabel = panel.querySelector(".trust-label");
      if (trustLabel) {
        var lw = oppTwoPhase
          ? smooth01(mapRange(p, OPP_B.in0 + 0.10, OPP_B.in0 + 0.18)) *
            (1 - smooth01(mapRange(p, OPP_B.out0, OPP_B.out0 + OPP_B.outWin)))
          : smooth01(mapRange(p, 0.11 + oppDelay, 0.17 + oppDelay)) * (1 - itemLeave());
        trustLabel.style.clipPath = "inset(0 " + ((1 - lw) * 100).toFixed(2) + "% 0 0)";
      }
      var logos = panel.querySelectorAll(".trust-strip > div");
      for (var li = 0; li < logos.length; li++) {
        var lww;
        if (oppTwoPhase) {
          var b0 = OPP_B.in0 + 0.12 + li * 0.009;
          var bx = Math.min(OPP_B.out0 + 0.01 + li * 0.006, OPP_B.outCap);
          lww = smooth01(mapRange(p, b0, b0 + 0.06)) *
            (1 - smooth01(mapRange(p, bx, bx + OPP_B.outWin)));
        } else {
          var le = smooth01(mapRange(p, 0.13 + oppDelay + li * 0.009, 0.13 + oppDelay + 0.05 + li * 0.009));
          lww = le * (1 - itemLeave());
        }
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
  // 02 WIDE STAGE (Piet 2026-10-15). Desktop 02 runs its copy over the same
  // 210% as before, then PRODUCT_WIDE_EXTRA more of pin where the demo video
  // opens out wide and plays its wide part. Everything keyed to the copy reads
  // its old progress through PRODUCT_COPY_SHARE, so no copy distance moves;
  // the leave-to-03 bands (clip fade, tint out, journey stage 3) ride the END
  // of the longer pin at their old lengths.
  // PHONE (Piet 2026-10-15): extra pin on its 280% too, but INSIDE the copy,
  // at Data done (copy 0.84), the copy held through it. Order (Piet: "put the
  // text, all the text ... up first, then the tall video, then the mocked up
  // tall video"): every line is up with no video; then the tall video rises
  // over it and covers all of it, Data too (PHONE_RISE); it plays
  // (PHONE_TALL); then the stacked video (PHONE_WIDE). % of screen. The mark
  // break-up, the leave, the fade and the photo exit all come after, at
  // their old distances.
  // teaser-dev.html reads the share as window.bfProductCopyShare.
  // After the rise (Piet 2026-10-15: "The first video has to come up stop
  // and play, and after a pause then can be scrolled past, and the next
  // video comes up at and pauses. They should have different flows"): the
  // tall video holds (PHONE_HOLD), then rides the scroll up and away
  // (PHONE_EXIT); halfway out, the stacked video rises on its own ease-out
  // into the same spot (PHONE_NEXT) and holds while it plays (PHONE_WIDE).
  var PHONE_RISE = 25, PHONE_HOLD = 100, PHONE_EXIT = 90, PHONE_NEXT = 70, PHONE_WIDE = 100;
  var PHONE_TALL = PHONE_HOLD + PHONE_EXIT / 2 + PHONE_NEXT;
  var PRODUCT_WIDE_EXTRA = appClipOn ? (mobileLike ? PHONE_RISE + PHONE_TALL + PHONE_WIDE : 100) : 0;
  var PRODUCT_COPY_BASE = mobileLike ? 280 : 210;
  var PRODUCT_PIN = PRODUCT_COPY_BASE + PRODUCT_WIDE_EXTRA;
  var PRODUCT_COPY_SHARE = PRODUCT_COPY_BASE / PRODUCT_PIN;
  var PRODUCT_WIDE_COPY_AT = mobileLike ? 0.84 : 1;
  // Pin fractions: the extra pin starts at HOLD_FROM (desktop: the copy
  // share); on phone the tall video is seated at RISE_TO and the wide stage
  // starts at WIDE_FROM (desktop: HOLD_FROM).
  var PRODUCT_HOLD_FROM = PRODUCT_WIDE_COPY_AT * PRODUCT_COPY_SHARE;
  var PHONE_RISE_TO = PRODUCT_HOLD_FROM + PHONE_RISE / PRODUCT_PIN;
  var PRODUCT_WIDE_FROM = PRODUCT_HOLD_FROM + (mobileLike ? (PHONE_RISE + PHONE_TALL) / PRODUCT_PIN : 0);
  // Phone swap (setAppClip): the tall video's exit, and the stacked still's
  // rise, which ends at PRODUCT_WIDE_FROM.
  var PHONE_EXIT_FROM = PHONE_RISE_TO + PHONE_HOLD / PRODUCT_PIN;
  var PHONE_EXIT_TO = PHONE_EXIT_FROM + PHONE_EXIT / PRODUCT_PIN;
  var PHONE_NEXT_FROM = PHONE_EXIT_FROM + PHONE_EXIT / 2 / PRODUCT_PIN;
  window.bfProductCopyShare = PRODUCT_COPY_SHARE;
  window.bfProductPinPct = PRODUCT_PIN;
  // 02 pin progress -> copy progress: straight through up to the extra pin,
  // held through it, then on to 1 at the pin's end. Desktop = min(1, P / share).
  function productCopyAt(P) {
    if (P <= PRODUCT_HOLD_FROM) return P / PRODUCT_COPY_SHARE;
    var past = P - (1 - PRODUCT_COPY_SHARE);
    return past <= PRODUCT_HOLD_FROM ? PRODUCT_WIDE_COPY_AT : Math.min(1, past / PRODUCT_COPY_SHARE);
  }
  window.bfProductCopyAt = productCopyAt;
  // Whole-pin fraction for a band that must come after the phone's stage:
  // phone = the same distance from the pin's end as on the old 280%;
  // desktop = unchanged.
  window.bfProductLeaveAt = function (f) {
    return PRODUCT_WIDE_COPY_AT < 1 ? 1 - (1 - f) * PRODUCT_COPY_SHARE : f;
  };
  function copyProgress(panel, p) {
    return panel.id === "product" ? productCopyAt(p) : p;
  }
  // 02 AUTO-FINISH (desktop, Piet 2026-10-15: "if we get anywhere on this
  // scroll we need the animations to finish"). Once you are anywhere in 02,
  // its build (headline, Wear, Walk, Data, the mark, the recording rising)
  // plays through to done on its own at the governor's KNEE pace, one screen
  // a second. Going back up REWINDS it with the scroll (Piet 2026-10-15:
  // "going back up is messy"; it used to stay built until you were above 02
  // and then clear on its own over 01): from where you turn up, what is
  // drawn maps in a straight line down to nothing at the top of 02, so 02 is
  // empty before you leave it. Turn down again and it plays on to done from
  // wherever it stood. Every 02 build reads bfProductAuto.lift(p) (going
  // down = max(scroll, auto)). From Data done (0.84) on the
  // scroll alone drives, so the 0.86 mark break-up and the 0.94 leave are
  // untouched. Phone: off (lift returns the scroll as is).
  var PRODUCT_AUTO = appClipOn && !mobileLike;
  var PRODUCT_AUTO_FULL = PRODUCT_EVIDENCE_STARTS[2] + PRODUCT_EVIDENCE_WINDOW;
  var PRODUCT_AUTO_RATE = 1 / 2.1; // copy progress per second = 1 screen/s over the 210% copy pin
  // back: set while going back up = { s: the copy scroll where you turned
  // up, d: what 02 was drawn at there }; null going down.
  var productAuto = { a: 0, target: 0, last: 0, raf: 0, fns: [], back: null, trigger: null, hold: 0, holdS: 0 };
  var productCopyScrollP = 0;
  function productAutoStep(now) {
    var dt = productAuto.last ? Math.min(0.1, (now - productAuto.last) / 1000) : 0;
    productAuto.last = now;
    var a = productAuto.a, t = productAuto.target, d = PRODUCT_AUTO_RATE * dt;
    productAuto.a = a < t ? Math.min(t, a + d) : Math.max(t, a - d);
    productAutoCarry();
    for (var i = 0; i < productAuto.fns.length; i++) productAuto.fns[i]();
    if (productAuto.a !== t) {
      productAuto.raf = requestAnimationFrame(productAutoStep);
    } else {
      productAuto.raf = 0;
      productAuto.last = 0;
    }
  }
  // The scroll rides the climb (Piet 2026-10-15: "the animation finishing
  // also needs to take us to the correct scroll position"; the build used to
  // finish with the scroll left behind, then a long dead scroll to Data
  // done). While the build plays on to done, the page is carried down with
  // it, so it ends ON Data done (0.84) and the next scroll goes straight
  // into the mark break-up and the leave. 02 is pinned, so nothing on screen
  // moves for it. Only forward, only while climbing, and never against a
  // scroll already headed further (Lenis's target).
  function productAutoCarry() {
    var tr = productAuto.trigger;
    if (!tr || productAuto.back || productAuto.target !== PRODUCT_AUTO_FULL) return;
    if (productAuto.a <= productCopyScrollP) return;
    var y = tr.start + (tr.end - tr.start) * productAuto.a * PRODUCT_COPY_SHARE;
    var lenis = window.lenis;
    var heading = lenis && typeof lenis.targetScroll === "number" ? lenis.targetScroll : window.scrollY;
    if (y <= heading) return;
    if (lenis && typeof lenis.scrollTo === "function") lenis.scrollTo(y, { immediate: true });
    else window.scrollTo(0, y);
  }
  function productAutoTarget(pCopy) {
    if (!PRODUCT_AUTO) return;
    productAuto.target = pCopy > 0 ? PRODUCT_AUTO_FULL : 0;
    // Also restarts the climb after a turn back down (a stands below the
    // target with no frame queued).
    if (productAuto.a !== productAuto.target && !productAuto.raf) {
      productAuto.raf = requestAnimationFrame(productAutoStep);
    }
  }
  // What 02 is drawn at for a scroll value p. Going down: lifted by the auto
  // value. Going back up: p from the turn point down to 0 maps in a straight
  // line from what was drawn there down to 0.
  function productLiftBase(p) {
    if (!PRODUCT_AUTO) return p;
    var b = productAuto.back;
    if (!b) return Math.max(p, productAuto.a);
    if (p >= b.s) return Math.max(p, b.d);
    return b.d > b.s ? b.d * p / b.s : p;
  }
  // The copy WAITS going back up out of the wide stage (Piet 2026-10-15:
  // "the text has to come up a little later as we scroll back up so it
  // doesn't overlap so much"). hold = 1 keeps 02 un-written while the wide
  // window shuts; then it lets go at the auto pace, so the copy writes back
  // on even if you have stopped, and never lags the straight line from the
  // let-go scroll (holdS) down to the top of 02, so 02 is still empty there.
  function productHoldCap(p) {
    var v = productAuto.hold;
    if (v <= 0) return 0;
    return productAuto.holdS > 0 ? Math.min(v, p / productAuto.holdS) : v;
  }
  function productLift(p) {
    if (!PRODUCT_AUTO) return p;
    return Math.max(productLiftBase(p), productHoldCap(p));
  }
  window.bfProductAuto = {
    lift: productLift,
    onChange: function (fn) { productAuto.fns.push(fn); }
  };
  // Which way the copy's scroll is going (onUpdate only: a refresh's
  // re-measure is not a direction). Turning up stops the auto value and
  // starts the rewind from here; turning down hands what is drawn now back
  // to the auto-finish, which plays on to done from there.
  var productDirP = 0;
  function productAutoTurn(c) {
    var turned = false;
    if (c < productDirP && !productAuto.back) {
      productAuto.back = { s: productDirP, d: productLiftBase(productDirP) };
      if (productAuto.raf) cancelAnimationFrame(productAuto.raf);
      productAuto.raf = 0;
      productAuto.last = 0;
      turned = true;
    } else if (c > productDirP && productAuto.back) {
      productAuto.a = productLiftBase(productDirP);
      productAuto.back = null;
      turned = true;
    }
    productDirP = c;
    // Readers on other triggers (mark, background pan) may already have
    // drawn this frame on the old rule; redraw them on the new one.
    if (turned) {
      for (var i = 0; i < productAuto.fns.length; i++) productAuto.fns[i]();
    }
  }
  function productHoldRedraw() {
    for (var i = 0; i < productAuto.fns.length; i++) productAuto.fns[i]();
  }
  var productHoldRaf = 0, productHoldLast = 0;
  function productHoldStop() {
    if (productHoldRaf) cancelAnimationFrame(productHoldRaf);
    productHoldRaf = 0;
    productHoldLast = 0;
  }
  function productHoldStep(now) {
    var dt = productHoldLast ? Math.min(0.1, (now - productHoldLast) / 1000) : 0;
    productHoldLast = now;
    productAuto.hold = Math.max(0, productAuto.hold - PRODUCT_AUTO_RATE * dt);
    productHoldRedraw();
    if (productAuto.hold > 0) productHoldRaf = requestAnimationFrame(productHoldStep);
    else productHoldStop();
  }
  // Called by setWideStage: wait as the window starts to shut on the way up,
  // let go once it has shut, clear on the way back into the wide stage.
  function productCopyWait() {
    if (!PRODUCT_AUTO) return;
    productHoldStop();
    productAuto.hold = 1;
    productAuto.holdS = 0;
    productHoldRedraw();
  }
  function productCopyGo() {
    if (!PRODUCT_AUTO || productAuto.hold <= 0) return;
    productHoldStop();
    productAuto.holdS = productCopyScrollP;
    if (productAuto.holdS > 0) {
      productHoldRaf = requestAnimationFrame(productHoldStep);
    } else {
      productAuto.hold = 0;
      productHoldRedraw();
    }
  }
  function productCopyClear() {
    if (!PRODUCT_AUTO || productAuto.hold <= 0) return;
    productHoldStop();
    productAuto.hold = 0;
    productHoldRedraw();
  }
  // What a panel's copy is drawn at: 02's copy share of its pin, lifted by the
  // auto-finish (which this also tells where the scroll is and, outside a
  // refresh, which way it is going).
  function drawProgress(panel, p, refreshing) {
    var c = copyProgress(panel, p);
    if (panel.id !== "product") return c;
    productCopyScrollP = c;
    if (PRODUCT_AUTO && !refreshing) productAutoTurn(c);
    if (!productAuto.back) productAutoTarget(c);
    return productLift(c);
  }
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
            ? "+=" + PRODUCT_PIN + "%"
            // 03 on phone is TWO STOPS in one pin (Piet 2026-08-17): 03a team
            // in/hold/out, then 03b applications in/hold/out. Flat 200% — a
            // measured length is what the retired scroll-through needed, and
            // its under-read of .team-half is what broke it.
            : (panel.id === "opportunity" && mobileLike
                ? "+=200%"
                : (mobileLike ? "+=100%" : "+=150%"))),
      pin: true,
      pinSpacing: true,
      scrub: true,
      anticipatePin: 1,
      onUpdate: function (self) {
        applyPanelProgress(panel, drawProgress(panel, self.progress));
        // Retire the bouncing scroll cue once section 01 is fully settled:
        // all copy up, veil at full blur, sitting in the 0.66-0.94 HOLD just
        // before the panel begins to leave. One-way (resetSplash clears it).
        if (isFirstPanel && self.progress >= 0.66) {
          document.body.classList.add("has-reached-01");
        }
      },
      // Refresh re-assert (Piet 2026-08-10, "what happened to the image
      // gating"): the hero got this on 08-09 and the panels never did. A
      // resize auto-refreshes ScrollTrigger, which reverts the pins,
      // remeasures and re-applies. A panel that ends up inactive after the
      // recompute never gets another onUpdate, so the inline clip-paths it
      // was last written with STAND. 03 stayed fully written (faces, copy,
      // WHO band) on top of 02. Same shape as the tree-field and map-release
      // onRefresh writers: re-assert the true value for the real position.
      onRefresh: function (self) { applyPanelProgress(panel, drawProgress(panel, self.progress || 0, true)); },
    });
    panelTriggers.push(panelTrigger);
    if (panel.id === "product" && PRODUCT_AUTO) {
      productAuto.trigger = panelTrigger;
      productAuto.fns.push(function () {
        applyPanelProgress(panel, window.bfProductAuto.lift(productCopyScrollP));
      });
    }
  });

  // ===== Resize keeps your place =========================================
  // Piet 2026-08-10: "why does resize also move me on where we are on the
  // scroll?" Every pin here is measured in viewport units (the generic
  // "+=150%", 02's "+=210%", the bullseye's "+=380%") and #opportunity
  // carries a -100svh - 12svh margin, so the LENGTH of the whole journey
  // scales with the window. The browser only remembers a pixel offset, and
  // ScrollTrigger's refresh reverts the pins to remeasure, which briefly
  // collapses the document and lets a deep position get clamped to the
  // shorter page. Same offset, different map, so you surface somewhere else.
  //
  // Record WHICH trigger we are in and HOW FAR through it before the
  // recompute; put the scroll back at that same fraction of its new range
  // after. Gated on the viewport actually changing size, the same guard the
  // scene's visibilitychange re-sync uses: nav clicks, font-load refreshes
  // and the fullscreen settle all call refresh() too and none of them should
  // be second-guessed. (Nav clicks are safe either way. scrollToTarget calls
  // refresh() and then lenis.scrollTo(destination) immediately after, so its
  // destination lands last and wins.)
  var lastRefreshW = window.innerWidth;
  var lastRefreshH = window.innerHeight;
  var scrollAnchor = null;

  ScrollTrigger.addEventListener("refreshInit", function () {
    scrollAnchor = null;
    if (!panelTriggers.length) return;
    if (window.innerWidth === lastRefreshW && window.innerHeight === lastRefreshH) return;
    // Height-only change on a touch device is the URL bar, not a real resize.
    // Restoring scroll for that is itself a visible jump, so leave it alone and
    // let the page ride the bar. Width changes (rotation) still restore.
    if (mobileLike && window.innerWidth === lastRefreshW) {
      lastRefreshH = window.innerHeight;
      return;
    }
    var first = panelTriggers[0];
    var last = panelTriggers[panelTriggers.length - 1];
    var y = first.scroll();
    // In the hero, above 01: hold the same fraction of the run-up.
    if (y < first.start) {
      scrollAnchor = { mode: "pre", f: first.start > 0 ? y / first.start : 0 };
      return;
    }
    // Past the last panel, in the closing: that section is not pinned, so
    // hold the DISTANCE below the last end rather than a fraction.
    if (y > last.end) {
      scrollAnchor = { mode: "post", d: y - last.end };
      return;
    }
    for (var i = 0; i < panelTriggers.length; i++) {
      var t = panelTriggers[i];
      if (y <= t.end) {
        var span = t.end - t.start;
        var f = span > 0 ? (y - t.start) / span : 0;
        scrollAnchor = { mode: "in", t: t, f: Math.min(1, Math.max(0, f)) };
        return;
      }
    }
  });

  ScrollTrigger.addEventListener("refresh", function () {
    lastRefreshW = window.innerWidth;
    lastRefreshH = window.innerHeight;
    if (!scrollAnchor) return;
    var a = scrollAnchor;
    scrollAnchor = null;
    var first = panelTriggers[0];
    var last = panelTriggers[panelTriggers.length - 1];
    var y;
    if (a.mode === "pre") y = a.f * first.start;
    else if (a.mode === "post") y = last.end + a.d;
    else y = a.t.start + a.f * (a.t.end - a.t.start);
    y = Math.max(0, Math.round(y));
    if (window.lenis && typeof window.lenis.scrollTo === "function") {
      window.lenis.scrollTo(y, { immediate: true });
    } else {
      window.scrollTo(0, y);
    }
    // Every onRefresh writer above already ran, against the pre-restore
    // position. Re-run the scrubs at the position we just set, or the page
    // holds the state of wherever the browser had dumped us.
    ScrollTrigger.update();
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
  // Clip-stage covering (Piet 2026-08-13: "the screen should just cover it
  // except for the data row"): measured by layoutProductCase (mobile only),
  // consumed per frame by setAppClip.
  var productCoverEls = [];
  var productClipH = 0;
  var productClipTop = 0;
  var productClipRoll = 0;
  function layoutProductCase() {
    if (!productPanel || !productInner) return;
    // Phone vs desktop read LIVE (2026-10-14), not the load-time mobileLike:
    // a window resized across 720px re-measures instead of keeping the other
    // layout's numbers until a reload.
    if (!window.matchMedia("(max-width: 720px)").matches) {
      if (caseModel) caseModel.style.height = "";
      var clipReset = document.querySelector(".app-clip-layer");
      if (clipReset) {
        clipReset.style.height = "";
        clipReset.style.removeProperty("--clip-space");
        clipReset.style.removeProperty("--clip-top");
      }
      productCoverEls.forEach(function (c) { c.el.classList.remove("is-covered"); });
      productCoverEls = [];
      return;
    }
    // Size from STABLE, scroll-independent values: the panel is 100svh and the
    // text is bottom-anchored within it, so model height = panel height minus
    // (text + padding + gap). This stays constant regardless of scroll
    // position, so the model holds a FIXED spot (no "rising into place"), while
    // still leaving the full text on screen. Recompute only on layout changes.
    var panelH = productPanel.offsetHeight;     // 100lvh, stable
    var textH = productInner.offsetHeight;      // stable
    // READ the padding, do not assume it. The panel is 100lvh and its
    // padding-bottom carries the URL-bar inset (24px + (100lvh - 100svh),
    // styles.css .panel), so the hardcoded 24 would have let the model
    // overlap the copy by the height of the bar. Static per device.
    var padBottom = parseFloat(getComputedStyle(productPanel).paddingBottom) || 24;
    // No gap term any more (Piet 2026-08-13: PNG sequence scaled up, crop at
    // the screen's top edge). The old 2% gap existed to cancel the box's 2vh
    // top offset; the box is at top:0 now, so the height runs from the screen
    // top to flush at the copy — same bottom edge as before, ~2vh more art.
    var modelH = panelH - padBottom - textH;
    modelH = Math.max(150, Math.min(modelH, Math.round(panelH * 0.72)));
    if (caseModel) caseModel.style.height = modelH + "px";
    // Clip layer runs from the screen top to the TOP OF THE DATA LINE (Piet
    // 2026-08-13: recording almost full screen, Data stays where it is). The
    // Data paragraph's own position never changes — the others are cut by the
    // covering sweep (visibility, which keeps layout) — so its offsetHeight
    // is the exact reserve.
    var clipLayer = document.querySelector(".app-clip-layer");
    var dataPara = productInner.querySelector(".panel__evidence p:last-of-type");
    if (clipLayer && dataPara) {
      clipLayer.style.height = (panelH - padBottom) + "px";
      // Data sits BELOW the recording, in the ground space under its bottom
      // edge (Piet 2026-08-14: "i actually don't mind this if the data entry
      // text could be below in the space") — seated at the panel's content
      // bottom, the original DATA-TO-THE-VERY-BOTTOM spot. The video is
      // contained at full width, top-anchored, so on tall phones the space
      // below it holds the block clear of the recording; on screens short
      // enough that the video reaches the content bottom there is no below —
      // the block sits at the bottom regardless. Signed shift, one writer.
      var target = panelH - padBottom;
      var dataBottom = productInner.offsetTop + dataPara.offsetTop + dataPara.offsetHeight;
      var shift = target - dataBottom;
      productPanel.style.setProperty("--data-shift", shift + "px");
      // The 02 corner mark lifts over the Data block during the clip stage;
      // the CSS lift reads this measured height (see the is-clip-stage rule).
      productPanel.style.setProperty("--data-h", dataPara.offsetHeight + "px");
      // FIT (Piet 2026-10-14: "make it fit right"). The recording gets the
      // space from the screen top down to the top of the lifted corner mark
      // and is CONTAINED in it (CSS --clip-space): whole, as wide as fits,
      // narrower on short phones instead of cropped. Replaces the 08-14
      // full-width rise, which on short phones both narrowed the video AND
      // pushed it past the top, and never left room for the mark. Nothing
      // here is typed in: the video's shape is left to object-fit, so a new
      // recording fits the same way.
      // The lifted mark is READ, not derived: the clip-stage lift goes on for
      // one synchronous read with its 420ms slide off (no paint happens in
      // between), then both are restored after a flush.
      var clipSpace = target - dataPara.offsetHeight - 12;
      var cornerMark = productPanel.querySelector(".section-mark--corner");
      if (cornerMark) {
        var staged = document.body.classList.contains("is-clip-stage");
        var markTransition = cornerMark.style.transition;
        cornerMark.style.transition = "none";
        document.body.classList.add("is-clip-stage");
        clipSpace = cornerMark.getBoundingClientRect().top -
                    productPanel.getBoundingClientRect().top;
        if (!staged) document.body.classList.remove("is-clip-stage");
        void cornerMark.offsetHeight;
        cornerMark.style.transition = markTransition;
      }
      clipLayer.style.setProperty("--clip-space",
        Math.max(0, Math.floor(clipSpace)) + "px");
      productClipH = panelH - padBottom;
      // The tall part mid-screen (Piet 2026-10-15: "should be center screen
      // if there is no text below"): the CSS tall box (--clip-w/--clip-h)
      // centred in the layer. setAppClip's covering cut adds it, so a line
      // still goes the frame the video's own top edge reaches it.
      var tallW = Math.min(clipLayer.clientWidth, Math.max(0, Math.floor(clipSpace)) * 1000 / 1690);
      productClipTop = Math.max(0, Math.round((productClipH - tallW * 1690 / 1000) / 2));
      clipLayer.style.setProperty("--clip-top", productClipTop + "px");
      // How far the tall video travels to leave the top, and the stacked
      // still to rise from the layer's bottom edge into the spot
      // (setAppClip): the box's height + the gap above it.
      productClipRoll = tallW * 1690 / 1000 + productClipTop;
      // The covering cut (see setAppClip): each non-Data line hides the frame
      // the video's rising top edge reaches its bottom. Offset sums, not
      // rects — transforms never move layout, and the sums are viewport-true
      // while the panel is pinned.
      productCoverEls = Array.prototype.slice.call(productPanel.querySelectorAll(
        // Data too (Piet 2026-10-15: the tall video covers all the text).
        ".eyebrow-anchor, .panel__verdict, .panel__evidence p:nth-of-type(1), .panel__evidence p:nth-of-type(2), .panel__evidence p:nth-of-type(3)"
      )).map(function (el) {
        var y = el.offsetHeight, n = el;
        while (n && n !== productPanel) { y += n.offsetTop; n = n.offsetParent; }
        return { el: el, bottom: y };
      });
    }
  }
  layoutProductCase();
  window.addEventListener("resize", layoutProductCase);
  window.addEventListener("orientationchange", layoutProductCase);
  window.addEventListener("load", layoutProductCase);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(layoutProductCase);
  }

  // 03 lift RETIRED (Piet 2026-08-17). The 08-14 overflow lift and the 08-16
  // 1:1 walk both depended on this measurement, and the measurement is what
  // broke them: half.offsetHeight reads a flex-shrunk, min-height:0 box, so
  // once 03's content was taller than a screen the lift came back short and
  // the bios painted over THE APPLICATIONS. The two halves now stack in one
  // grid cell and take the screen in turn, so there is no overrun to ride.
  // Both custom properties are zeroed here rather than deleted so a cached
  // older stylesheet cannot strand the halves mid-translate.
  var oppPanel = document.getElementById("opportunity");
  if (oppPanel) {
    oppPanel.style.setProperty("--opp-lift", "0px");
    oppPanel.style.setProperty("--opp-rise", "0");
  }

  // FACES-VS-BAND FLOOR (Piet 2026-08-17, with the held faces). The faces stay
  // up through 03b while the applications band sits at the bottom of the same
  // grid cell, so on a short phone the two can meet. The dial is the ASPECT,
  // never max-height: .panel__video's height is width / --team-pane-aspect, so
  // a height cap on it is the silently-inert trap from 08-16. This is the
  // smallest aspect (tallest faces) that still clears the measured band, and
  // it is a FLOOR — 1.35 stands wherever it fits, which is every phone tall
  // enough to have room, so the approved 03a size is untouched there.
  function layoutOpportunityFaces() {
    if (!oppPanel || !mobileLike) return;
    var oppInner = oppPanel.querySelector(".panel__inner");
    var people = oppPanel.querySelector(".panel__people");
    if (!oppInner || !people || !people.clientWidth) return;
    var cs = getComputedStyle(oppPanel);
    var box = oppPanel.clientHeight -
      (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    // The band's CONTENT height, walked child-to-child. NOT offsetHeight:
    // .panel__inner is a stretched grid item now, so its box IS the whole
    // cell and offsetHeight returns the full screen — that read collapsed
    // `avail` to the 120 floor and shrank the faces to a 2.9 aspect instead
    // of growing them. Third time this project has been bitten by measuring
    // a box the layout stretched or shrank; measure content, never the box.
    var kids = oppInner.children;
    if (!kids.length) return;
    var kFirst = kids[0], kLast = kids[kids.length - 1];
    var bandH = kLast.offsetTop + kLast.offsetHeight - kFirst.offsetTop;
    if (!(bandH > 0)) return;
    // The ONE gap under the images, shared by both stops. Read off the team
    // half's resolved row-gap so this and --opp-stack-gap can never drift.
    var half = oppPanel.querySelector(".team-half");
    var gap = (half && parseFloat(getComputedStyle(half).rowGap)) || 16;
    // Size against the TALLER of the two lower blocks. 03a's lower block is
    // the team copy, 03b's is the band; sizing to only one of them lets the
    // other overrun, and centring on each separately would make the headshots
    // jump between the stops.
    var copy = oppPanel.querySelector(".team-half__copy");
    var lower = Math.max(bandH, copy ? copy.offsetHeight : 0);
    var avail = box - lower - gap;
    var need = people.clientWidth / Math.max(120, avail);
    // Inline, on the element itself: the 720 block sets the property on
    // .panel__video, so a value written to the panel would lose to it.
    people.style.setProperty("--team-pane-aspect", Math.max(1.35, need).toFixed(3));
    // Read the height BACK after the ratio lands (this forces the reflow) and
    // publish it: .panel__inner's padding-top is stack-top + faces + gap,
    // which seats 03b directly under the headshots, not at the screen bottom.
    var clipWrap = oppPanel.querySelector(".panel__people-clip");
    var facesH = (clipWrap || people).offsetHeight;
    oppPanel.style.setProperty("--opp-faces-h", facesH + "px");
    // ONE offset for BOTH layers (Piet: "centre the whole contemt on the
    // page"). Centred on faces + gap + the taller lower block, so the
    // composition sits centred and the faces never move between the stops.
    var stackTop = Math.max(0, Math.round((box - (facesH + gap + lower)) / 2));
    oppPanel.style.setProperty("--opp-stack-top", stackTop + "px");
  }
  layoutOpportunityFaces();
  // Re-measured on the same events as the other measured layouts, and paired
  // with refreshInit so a ScrollTrigger refresh can never leave a stale ratio.
  if (window.ScrollTrigger) ScrollTrigger.addEventListener("refreshInit", layoutOpportunityFaces);
  window.addEventListener("resize", layoutOpportunityFaces);
  window.addEventListener("orientationchange", layoutOpportunityFaces);
  window.addEventListener("load", layoutOpportunityFaces);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(layoutOpportunityFaces);
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
      // Refresh re-assert (2026-08-13 audit), guarded to its own band so it
      // never fights the panel-band veil writers outside it.
      onRefresh: function (self) {
        if (self.isActive) setTextVeilOpacity(0);
      },
    });
  }

  // ===== Canopy wave timing =============================================
  // Each wave starts only after the current text has had time to sit, then
  // lands as the next text block begins. Wave 1 intentionally waits until
  // after the "forest data stack" panel instead of running from the hero.
  if (!reduced && window.bullfinchCanopy && window.bullfinchCanopy.setWaveProgress) {
    // Wearable render DELETED 2026-10-14 (client ask): the 480-frame Case_anim
    // canvas, case-animation.js and the whole device fade/playback retime are
    // gone. The recording now arrives over the band the device used to hold.
    var appClip = appClipOn ? document.getElementById("app-clip") : null;
    // PHONES (Piet 2026-10-14, "is that all the text I get?"): the recording
    // covers the copy on a phone, so it rises only when Walk has finished
    // writing — headline, Wear and Walk are read first, Data writes on below
    // it. Read from Walk's own band, so retiming the copy moves this too.
    // The rise is desktop's 0.12-of-210% distance on the 280% phone pin.
    // Desktop keeps the early arrival: there the copy sits beside it.
    var walkWritten = PRODUCT_EVIDENCE_STARTS[1] + PRODUCT_EVIDENCE_WINDOW;
    var clipInStart = mobileLike ? walkWritten : 0.1714;
    var clipSeat = mobileLike ? walkWritten + 0.12 * 210 / 280 : 0.2914;

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
    // 02 plays the PHONE part only (Piet 2026-10-15): the file cuts from the
    // tall part (0:32-0:54) to the wide part (0:55-1:37) at 22.0s, so outside
    // the wide stage the video stops on the last tall frame (21.96s) and holds
    // it. Checked every frame while it plays (timeupdate fires only about 4
    // times a second).
    var CLIP_HOLD_AT = 21.96;
    var CLIP_WIDE_AT = 22.05;  // first wide frame (the cut is at 22.0s)
    var CLIP_WINDOW_MS = 520;  // = the desktop .app-clip-layer__box clip-path transition
    var CLIP_WIPE_FROM = 0.88; // MIRRORS gapCloseTrig in teaser-dev.html: the photo's exit band
    // Each video starts playing before its absolute landing (Piet
    // 2026-10-16: "need the video to start before an absolute landing.
    // Otherwise I'm waiting for it to start and I don't know why"). The tall
    // one at 85% of its rise ("I'd even move that to 85%"; smooth01 reaches
    // 0.85 at 0.7556). The stacked one (phone) the moment the tall one is
    // fully off the top (PHONE_EXIT_TO, its still 95% in): the one video
    // element cannot leave the tall part any sooner. It rides the rest of
    // the landing while it plays.
    var CLIP_PLAY_T = 0.7556;
    var CLIP_WIDE_ZONE_FROM = mobileLike ? PHONE_EXIT_TO : PRODUCT_WIDE_FROM;
    var clipWideOn = false;
    var clipZone = "copy";
    // The video is on, or heading to, its wide part: from the moment the
    // wide stage starts until the window has shut again. The hold never
    // fires while it is set.
    var clipWidePic = false;
    var clipWideSeq = 0;
    var clipHoldLoop = false;
    // The recording layer is up (setAppClip's own opacity test), so the
    // scroll prompt never fires from a video still running off screen.
    var clipShown = false;
    function holdPhonePart() {
      if (!clipWidePic && appClipVideo.currentTime >= CLIP_HOLD_AT - 0.02) {
        appClipVideo.pause();
        appClipVideo.currentTime = CLIP_HOLD_AT;
        // End of the narrow part: prompt the scroll (Piet 2026-10-15). The
        // idle script's wake() takes it off on the first real scroll. Only
        // the play-through lands here, never the seek back from the wide stage.
        if (clipShown) document.body.classList.add("is-scroll-prompt");
      }
      if (appClipVideo.paused || appClipVideo.ended) { clipHoldLoop = false; return; }
      requestAnimationFrame(holdPhonePart);
    }
    if (appClipVideo) {
      appClipVideo.addEventListener("playing", function () {
        if (clipHoldLoop) return;
        clipHoldLoop = true;
        requestAnimationFrame(holdPhonePart);
      });
      // Phone stats (Piet 2026-10-16): the phone file ends on the map and his
      // Survey summary image (.app-clip-layer__stats) fades in over it. It
      // stays up until it has ridden off the bottom on the way up
      // (setAppClip) or the video is rewound out the top: "don't reset it
      // till it is off screen again and we come back down to it".
      appClipVideo.addEventListener("ended", function () {
        if (mobileLike) appClip.classList.add("is-stats");
      });
    }
    // WIDE STAGE (desktop): the last PRODUCT_WIDE_EXTRA of the 02 pin, after
    // the copy has un-written. In: the video jumps to its wide part, and on
    // that frame .is-wide-pic puts the whole frame on the wide picture's area
    // and .is-wide opens the window to the right over it (CSS clip-path,
    // CLIP_WINDOW_MS). Out either way: the window shuts over the wide picture
    // first, THEN the video goes back to the held phone frame and the phone
    // placement returns, so the picture never slides or zooms (Piet
    // 2026-10-15: "really weird interaction between paused video narrow and
    // into wide video, and back"). Scrolling back in replays the wide part.
    // clipWideSeq drops any step a later toggle has overtaken. Single writer
    // of .is-wide and .is-wide-pic, called from driveProductBand.
    function setWideStage(P) {
      if (!appClip || PRODUCT_COPY_SHARE >= 1) return;
      // Three zones of the 02 pin: the copy, the wide stage, past it (03).
      // Phone: "wide" runs on through 02's leave after the stage, so the
      // stacked video stays up until 02 fades (desktop: its wipe band).
      var zone = P <= CLIP_WIDE_ZONE_FROM ? "copy" : (P < 1 ? "wide" : "past");
      if (zone === clipZone) return;
      var from = clipZone;
      clipZone = zone;
      clipWideOn = zone === "wide";
      if (!appClipVideo) { appClip.classList.toggle("is-wide", zone !== "copy"); return; }
      var seq = ++clipWideSeq;
      if (zone === "past") {
        // Down into 03: the wide picture stays open and wide (the wipe has
        // taken it), only paused, so coming back up it un-wipes as it was
        // (Piet 2026-10-15: "coming back up for the crop wipe, it waits then
        // it jumps").
        appClipVideo.pause();
        return;
      }
      if (zone === "wide") {
        productCopyClear();
        appClipPlayed = true;
        clipWidePic = true;
        // Back up from 03 onto a window that never opened (a jump past the
        // stage): open it with no transition, the wipe is the reveal.
        var snap = from === "past";
        // Phone: the stats still up (ended, or riding back in before they
        // left the screen) stay as they are, nothing seeks or plays.
        var onStats = appClip.classList.contains("is-stats");
        var openWindow = function () {
          if (seq !== clipWideSeq) return;
          if (snap) appClip.classList.add("is-wide-snap");
          appClip.classList.add("is-wide-pic", "is-wide");
          if (snap) {
            void appClip.offsetWidth;
            appClip.classList.remove("is-wide-snap");
          }
          // Ended, or the stats still up: they stay (play() would restart it).
          if (!onStats && !appClipVideo.ended) {
            var resumed = appClipVideo.play();
            if (resumed && resumed.catch) resumed.catch(function () {});
          }
        };
        // Still on the wide part, or on the stats: back up from 03, or back
        // in before the stats left the screen. Only once they have ridden off
        // the bottom does coming back down play the stacked part from its
        // start (Piet 2026-10-16: "I don't want the video to reset unless I go
        // up to the previous video").
        if (onStats || appClipVideo.currentTime >= CLIP_WIDE_AT) {
          openWindow();
        } else {
          appClipVideo.pause();
          appClipVideo.addEventListener("seeked", openWindow, { once: true });
          appClipVideo.currentTime = CLIP_WIDE_AT;
        }
        return;
      }
      // Out the top with the window open: the copy waits until it has shut.
      var waitCopy = appClip.classList.contains("is-wide-pic");
      if (waitCopy) productCopyWait();
      appClip.classList.remove("is-wide");
      var settle = function () {
        if (seq !== clipWideSeq) return;
        if (waitCopy) productCopyGo();
        clipWidePic = false;
        if (appClipVideo.currentTime > CLIP_HOLD_AT) {
          // Phone: the still takes the spot at once, the seek happens off
          // screen with the rolled-up box.
          if (mobileLike) appClip.classList.remove("is-wide-pic"); // the stats, if up, ride on down (--clip-next)
          appClipVideo.pause();
          appClipVideo.addEventListener("seeked", function () {
            if (seq === clipWideSeq) appClip.classList.remove("is-wide-pic");
          }, { once: true });
          appClipVideo.currentTime = CLIP_HOLD_AT;
        } else {
          appClip.classList.remove("is-wide-pic");
        }
      };
      // Phone has no window to shut: straight back to the held tall frame.
      if (appClip.classList.contains("is-wide-pic") && !mobileLike) setTimeout(settle, CLIP_WINDOW_MS);
      else settle();
    }
    function setAppClip(p, P) {
      if (!appClip) return;
      // Phone (Piet 2026-10-15): the tall video only rises once all the text
      // is up, inside the stretch held at Data done, so there it reads the
      // whole pin; desktop reads the copy as before.
      var clipUp = mobileLike ? P > PRODUCT_HOLD_FROM : p > clipInStart;
      // Plays from 85% of the way in (CLIP_PLAY_T), not the absolute landing.
      var clipSeated = mobileLike
        ? P >= PRODUCT_HOLD_FROM + CLIP_PLAY_T * (PHONE_RISE_TO - PRODUCT_HOLD_FROM)
        : p >= clipInStart + CLIP_PLAY_T * (clipSeat - clipInStart);
      var inP = mobileLike
        ? smooth01(mapRange(P, PRODUCT_HOLD_FROM, PHONE_RISE_TO))
        : smooth01(mapRange(p, clipInStart, clipSeat));
      // The fade rides the END of the whole 02 pin (P) at its old length, so
      // with the wide stage it is the wide (phone: stacked) video that fades
      // into 03.
      var outP = smooth01(mapRange(P, 1 - 0.10 * PRODUCT_COPY_SHARE, 1.00));
      var travel = (1 - inP) * 116;
      // Desktop: the wide video CROP-WIPES out into 03 instead (Piet
      // 2026-10-15: "no FaDE out of the wide on exit, have it crop wipe ...
      // make it a vertical, not horizontal"): --clip-wipe brings the layer's
      // top edge down, title and all, on the SAME line and band as the
      // background photograph's own exit wipe (CLIP_WIPE_FROM -> 1), so the
      // two go as one. Phone the same (Piet 2026-10-15: "why does the second
      // video not crop wipe out?"), on the phone photo's own band
      // (bfProductLeaveAt; desktop it returns CLIP_WIPE_FROM as is).
      var wipeOut = PRODUCT_COPY_SHARE < 1;
      appClip.style.opacity = clipUp && P < 1 ? (wipeOut ? 1 : 1 - outP).toFixed(3) : 0;
      clipShown = clipUp && P < 1;
      if (wipeOut) appClip.style.setProperty("--clip-wipe", mapRange(P, window.bfProductLeaveAt(CLIP_WIPE_FROM), 1).toFixed(4));
      appClip.style.setProperty("--clip-y", travel.toFixed(2) + "%");
      // Phone, after the hold (PHONE_HOLD): the tall video rides the scroll
      // up and off the top (--clip-exit, straight), and from halfway the
      // stacked part's still (CSS .app-clip-layer__next) rises from the
      // bottom on its own ease-out into the same spot (--clip-next), so the
      // two never move as one. Both travel productClipRoll.
      if (mobileLike) {
        var exitT = mapRange(P, PHONE_EXIT_FROM, PHONE_EXIT_TO);
        var nextT = 1 - Math.pow(1 - mapRange(P, PHONE_NEXT_FROM, PRODUCT_WIDE_FROM), 3);
        appClip.style.setProperty("--clip-exit", (exitT * productClipRoll).toFixed(1) + "px");
        appClip.style.setProperty("--clip-next", ((1 - nextT) * productClipRoll).toFixed(1) + "px");
        // Scrolling up, the stats ride this same path down; once they are
        // fully off the bottom they go, so coming back down starts afresh.
        if (nextT <= 0) appClip.classList.remove("is-stats");
      }
      // NO FADE (Piet 2026-08-13: "the screen should just cover it except
      // for the data row"): each line is cut the frame the video's rising
      // top edge first touches it, and restored the same way scrolling back.
      // .swot rides at z4 during the stage, so the copy can't literally sit
      // under the body-level layer (stacking landmine) — the cut is what
      // reads as covering. Same single writer as the slide (onUpdate AND
      // onRefresh), so a refresh can never strand a line. productCoverEls is
      // empty on desktop.
      var edgeY = productClipH * travel / 100 + productClipTop;
      var coverOn = clipUp && p < 1;
      for (var ci = 0; ci < productCoverEls.length; ci++) {
        productCoverEls[ci].el.classList.toggle("is-covered",
          coverOn && edgeY <= productCoverEls[ci].bottom);
      }
      if (appClipVideo) {
        if (clipSeated && p < 1 && !appClipPlayed) {
          appClipPlayed = true;
          var played = appClipVideo.play();
          if (played && played.catch) played.catch(function () {});
        } else if ((mobileLike ? P < PRODUCT_HOLD_FROM : p < clipInStart) && appClipPlayed) {
          appClipVideo.pause();
          appClipVideo.currentTime = 0;
          appClipPlayed = false;
          appClip.classList.remove("is-stats");
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
        // ONE writer — onUpdate and onRefresh both call this. This trigger
        // owns the 02 device opacity, the app-clip slide AND the backdrop
        // tint, and it had no onRefresh (2026-08-13 audit): any refresh froze
        // all three mid-value until the next scroll tick. Same fault class as
        // the four from 08-12.
        onUpdate: function (self) { driveProductBand(self.progress); },
        onRefresh: function (self) { driveProductBand(self.progress || 0); },
      });
      var lastBandP = 0;
      if (PRODUCT_AUTO) productAuto.fns.push(function () { driveProductBand(lastBandP); });
      function driveProductBand(P) {
        lastBandP = P;
        // P = the whole 02 pin; pScroll = the copy's own progress (the old
        // 210% / phone 280%, held through the phone's stage); p = that lifted
        // by the desktop auto-finish, which the recording's rise reads. The
        // tint stays on the scroll.
        var pScroll = productCopyAt(P);
        var p = window.bfProductAuto.lift(pScroll);
        setAppClip(p, P);
        setWideStage(P);
        // Phone clip stage (Piet 2026-08-13: recording "almost fill the
        // screen... just the last entry data and its text stay over it").
        // Single writer: this function runs from onUpdate AND onRefresh, so
        // the class can never freeze stale. CSS fades eyebrow/verdict/Wear/
        // Walk by OPACITY only — the write-on scrub owns clip-path, opacity
        // keeps layout, so the Data line never moves. Toggled at every width
        // (2026-10-14): all is-clip-stage CSS sits in the 720px block, so it
        // follows the live width instead of the load-time one.
        // Phone (Piet 2026-10-15): off. The video now covers every line,
        // Data too, so nothing rides above it and the mark keeps its corner.
        document.body.classList.toggle("is-clip-stage",
          !mobileLike && p >= clipInStart && p < 1);
        // 02 backdrop tint: ease the scene to light green while the device
        // section holds, back to beige before 03 arrives.
        if (window.bullfinchCanopy.setProductTintProgress) {
          window.bullfinchCanopy.setProductTintProgress(
            smooth01(mapRange(pScroll, 0.0, 0.15)) * (1 - smooth01(mapRange(P, 1 - 0.15 * PRODUCT_COPY_SHARE, 1.0)))
          );
        }
      }
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
        // Piet 2026-08-11: on the phone the mark showed up and never left,
        // including on the way back. previousConvergenceProgress in the scene
        // has exactly ONE writer (the onUpdate above) and #closingMark's
        // opacity is smoothstep(0.93, 1, that value), so anything that stops
        // the scrub re-firing pins the mark on screen forever. A phone does
        // that constantly: the URL bar collapsing and expanding is a viewport
        // resize, every resize auto-refreshes ScrollTrigger, and with
        // invalidateOnRefresh the scrub is rebuilt without replaying onUpdate.
        // Same re-assert the hero, the panels and the map release all carry.
        onRefresh: function (self) {
          window.bullfinchCanopy.setConvergenceProgress(self.progress || 0);
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
        onUpdate: function (self) { setFooterLine(self.progress); },
        // Refresh re-assert (2026-08-13 audit) — same class as the rest.
        onRefresh: function (self) { setFooterLine(self.progress || 0); },
      });
      function setFooterLine(p) {
        footerLine.style.transform = "translateY(" + (12 * (1 - p)) + "px)";
      }
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
        // Refresh re-assert (2026-08-13 audit): this drives the ENTIRE canopy
        // descent. Without it a refresh froze the whole mote field at a stale
        // progress until the next scroll tick — a full-field pop on resume.
        onRefresh: function (self) {
          driver(self.progress || 0);
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
