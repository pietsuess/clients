(function () {
  var canvas = document.getElementById("ui-animation");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var frameCount = 209;
  var temporaryFrameCount = 72;
  var scrollTargetFrame = 20;
  var autoplayEndFrame = 190;
  var autoplayFps = 24;
  var scrollPhaseEnd = 0.22;
  var frames = [];
  var loaded = [];
  var hasSequence = false;
  var triedSequence = false;
  var pendingFrame = 0;
  var renderedFrame = -1;
  var hasAutoplayed = false;
  var autoplayFrame = null;
  var lastScrollProgress = 0;

  function framePath(index) {
    return "ui-anim/UI_anim_" + String(index).padStart(5, "0") + ".png";
  }

  function temporaryFramePath(index) {
    var caseIndex = (index % temporaryFrameCount) + 1;
    return "case-anim/Case_anim" + String(caseIndex).padStart(4, "0") + ".png";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function fitCanvasToBox() {
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

  function playToEnd() {
    if (hasAutoplayed) return;
    hasAutoplayed = true;

    var startFrame = Math.max(pendingFrame, Math.min(scrollTargetFrame, frameCount - 1));
    var endFrame = Math.min(autoplayEndFrame, frameCount - 1);
    if (startFrame >= endFrame) {
      renderFrame(endFrame);
      return;
    }

    var currentFrame = startFrame;
    var lastStep = 0;
    var frameDuration = 1000 / autoplayFps;
    function tick(now) {
      if (!lastStep) lastStep = now;
      if (now - lastStep >= frameDuration) {
        var nextFrame = Math.min(endFrame, currentFrame + 1);
        if (loaded[nextFrame]) {
          currentFrame = nextFrame;
          renderFrame(currentFrame);
          lastStep = now;
        }
      }
      if (currentFrame < endFrame) {
        autoplayFrame = requestAnimationFrame(tick);
      }
    }
    if (autoplayFrame) cancelAnimationFrame(autoplayFrame);
    autoplayFrame = requestAnimationFrame(tick);
  }

  function setScrollProgress(progress) {
    if (progress < lastScrollProgress - 0.01) {
      if (autoplayFrame) cancelAnimationFrame(autoplayFrame);
      autoplayFrame = null;
      hasAutoplayed = false;
    }
    lastScrollProgress = progress;
    if (hasAutoplayed) return;
    var p = clamp(progress / scrollPhaseEnd, 0, 1);
    var maxScrollIndex = Math.min(scrollTargetFrame, frameCount - 1);
    var frame = Math.min(maxScrollIndex, Math.floor(p * scrollTargetFrame));
    renderFrame(frame);
    if (frame >= maxScrollIndex) playToEnd();
  }

  function loadSequence() {
    if (triedSequence) return;
    triedSequence = true;

    var first = new Image();
    first.decoding = "async";
    first.onload = function () {
      hasSequence = true;
      frames[0] = first;
      loaded[0] = true;
      for (var i = 1; i < frameCount; i++) {
        var img = new Image();
        var frameIndex = i;
        loaded[frameIndex] = false;
        img.decoding = "async";
        img.onload = (function (index) {
          return function () {
            loaded[index] = true;
            if (index === pendingFrame) renderFrame(index);
          };
        })(frameIndex);
        img.src = framePath(frameIndex);
        frames[frameIndex] = img;
      }
      renderFrame(pendingFrame);
    };
    first.onerror = loadTemporarySequence;
    first.src = framePath(0);
  }

  function loadTemporarySequence() {
    hasSequence = true;
    for (var i = 0; i < frameCount; i++) {
      var img = new Image();
      var frameIndex = i;
      loaded[frameIndex] = false;
      img.decoding = "async";
      img.onload = (function (index) {
        return function () {
          loaded[index] = true;
          if (index === pendingFrame) renderFrame(index);
        };
      })(frameIndex);
      img.src = temporaryFramePath(i);
      frames[frameIndex] = img;
    }
  }

  loadSequence();
  window.addEventListener("resize", function () {
    renderedFrame = -1;
    renderFrame(pendingFrame);
  });
  window.bullfinchUiAnimation = {
    setScrollProgress: setScrollProgress,
    setFrameProgress: setScrollProgress,
    setProgress: setScrollProgress,
  };
})();
