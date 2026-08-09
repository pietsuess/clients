(function () {
  var canvas = document.getElementById("case-animation");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  // DEV opt-in (data-map-points): Piet re-rendered the case sequence at 480
  // frames (3D/Case_Anim), converted to case-anim-webp-v2. Prod keeps the
  // 288-frame folder and its loop-back tail untouched. The dev sequence has no
  // tail — swot-claude.js holds the last frame by capping the progress it
  // passes in.
  var longSeq = document.body && document.body.hasAttribute("data-map-points");
  var frameCount = longSeq ? 480 : 288;
  var tailFrameCount = longSeq ? 0 : 136;
  // v3 (Piet 2026-08-09): the Case_Anim_02 re-render, same 480 frames.
  var frameDir = longSeq ? "case-anim-webp-v3/" : "case-anim-webp/";
  var playbackFrameSlots = frameCount + tailFrameCount;
  var frames = [];
  var loaded = [];
  var pendingFrame = 0;
  var renderedFrame = -1;

  function framePath(index) {
    return frameDir + "Case_anim" + String(index).padStart(4, "0") + ".webp?v=v4-3";
  }

  // Defer fetching the sequence until the #product panel is within ~1.5
  // viewports, so the ~1.2MB of frames don't load before the user reaches
  // section 02. Falls back to immediate load where IntersectionObserver is
  // unavailable.
  function whenNear(targetSelector, cb) {
    var el = document.querySelector(targetSelector);
    if (!el || !("IntersectionObserver" in window)) {
      cb();
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            io.disconnect();
            cb();
            return;
          }
        }
      },
      { rootMargin: "150% 0px" }
    );
    io.observe(el);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function fitCanvasToBox() {
    // Match the canvas buffer to its CSS box (which scales with the available
    // space) so the art is never stretched when the box is non-square.
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = canvas.clientWidth || 720;
    var bh = canvas.clientHeight || 720;
    var tw = Math.round(bw * dpr);
    var th = Math.round(bh * dpr);
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
    }
  }

  function drawImageContained(img) {
    fitCanvasToBox();
    var cw = canvas.width;
    var ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    if (!img || !img.naturalWidth) return;

    // CONTAIN: full aspect, whole frame, no crop, no stretch. Scales with the
    // box (which scales with the available space).
    var scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    var width = img.naturalWidth * scale;
    var height = img.naturalHeight * scale;
    var x = (cw - width) / 2;
    // The sequence is top-seated in the viewport. Preserve the complete frame
    // and use every available pixel below it without cropping its top edge.
    var y = 0;
    ctx.drawImage(img, x, y, width, height);
  }

  function renderFrame(index) {
    pendingFrame = index;
    if (index === renderedFrame || !loaded[index]) return;
    drawImageContained(frames[index]);
    renderedFrame = index;
  }

  function setScrollProgress(progress) {
    var p = clamp(progress, 0, 1);
    var slot = Math.min(playbackFrameSlots - 1, Math.floor(p * playbackFrameSlots));
    renderFrame(slot < frameCount ? slot : slot - frameCount);
  }

  function loadFrames() {
    for (var i = 1; i <= frameCount; i++) {
      var img = new Image();
      var frameIndex = i - 1;
      loaded[frameIndex] = false;
      img.decoding = "async";
      img.onload = (function (index) {
        return function () {
          loaded[index] = true;
          if (index === pendingFrame) renderFrame(index);
        };
      })(frameIndex);
      img.src = framePath(i);
      frames.push(img);
    }
  }

  // The 480-frame dev prefetch must not start before window load: images
  // already in flight hold the load event hostage, and the entire intro
  // (hero arrival, pins, swot-ready) waits on load. Prod path unchanged.
  if (longSeq && document.readyState !== "complete") {
    window.addEventListener("load", function () {
      whenNear("#product", loadFrames);
    });
  } else {
    whenNear("#product", loadFrames);
  }
  renderFrame(0);
  window.addEventListener("resize", function () {
    renderedFrame = -1;            // force a redraw at the new box size
    renderFrame(pendingFrame);
  });
  window.bullfinchCaseAnimation = {
    setScrollProgress: setScrollProgress,
    setFrameProgress: setScrollProgress,
    setProgress: setScrollProgress,
  };
})();
