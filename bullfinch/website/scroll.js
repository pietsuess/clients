/* Bullfinch Pitch - smooth scroll
   - Initializes Lenis (skipped under prefers-reduced-motion).
   - Calls ScrollTrigger.update() each frame so scrubs stay in sync with smooth scroll.
   - Exposes window.lenis for downstream scripts.
*/
(function () {
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    window.lenis = null;
    return;
  }

  if (typeof Lenis === "undefined") {
    console.warn("[bullfinch] Lenis failed to load; native scroll only.");
    window.lenis = null;
    return;
  }

  var lenis = new Lenis({
    duration: 1.1,
    smoothWheel: true,
  });
  window.lenis = lenis;

  function raf(time) {
    lenis.raf(time);
    if (typeof ScrollTrigger !== "undefined" && ScrollTrigger.update) {
      ScrollTrigger.update();
    }
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
})();
