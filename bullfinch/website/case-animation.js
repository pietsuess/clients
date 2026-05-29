(function () {
  var canvas = document.getElementById("case-animation");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var frameCount = 72;
  var scrollLoops = 1.5;
  var frames = [];
  var loaded = [];
  var pendingFrame = 0;
  var renderedFrame = -1;

  function framePath(index) {
    return "case-anim/Case_anim" + String(index).padStart(4, "0") + ".png";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function drawImageContained(img) {
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

  function setScrollProgress(progress) {
    var p = clamp(progress, 0, 1);
    var offset = Math.floor(p * frameCount * scrollLoops);
    renderFrame(offset % frameCount);
  }

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

  renderFrame(0);
  window.bullfinchCaseAnimation = {
    setScrollProgress: setScrollProgress,
    setFrameProgress: setScrollProgress,
    setProgress: setScrollProgress,
  };
})();
