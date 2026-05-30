(function () {
  var canvas = document.getElementById("case-animation");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var frameCount = 72;
  var tailFrameCount = 34;
  var playbackFrameSlots = frameCount + tailFrameCount;
  var frames = [];
  var loaded = [];
  var pendingFrame = 0;
  var renderedFrame = -1;

  function framePath(index) {
    return "case-anim-webp/Case_anim" + String(index).padStart(4, "0") + ".webp";
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
    var y = (ch - height) / 2;
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

  whenNear("#product", loadFrames);
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
