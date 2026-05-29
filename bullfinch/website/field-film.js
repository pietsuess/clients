/* Bullfinch — procedural "field film" placeholder.
   Replaces the temp mp4 (which showed a green decode bar on mobile). A canvas
   has no video decoder, so no codec artifact, and it renders crisp at any width
   (full-bleed mobile included). Draws a subtle below-canopy ambiance: slow
   vertical light shafts + drifting motes, over the CSS brand gradient behind it.
   Transparent background so the gradient shows through. */
(function () {
  var canvas = document.getElementById("field-film");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var W = 0, H = 0, dpr = 1;
  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  var shafts = [];
  var motes = [];
  function seed() {
    shafts = [];
    for (var i = 0; i < 5; i++) {
      shafts.push({
        x: (i + 0.5) / 5 + (Math.random() - 0.5) * 0.08,
        w: 0.10 + Math.random() * 0.14,
        sp: 0.06 + Math.random() * 0.10,
        ph: Math.random() * Math.PI * 2,
        a: 0.04 + Math.random() * 0.04,
      });
    }
    motes = [];
    for (var j = 0; j < 30; j++) {
      motes.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.5 + Math.random() * 1.7,
        a: 0.08 + Math.random() * 0.30,
        sp: 0.012 + Math.random() * 0.040,
        dx: (Math.random() - 0.5) * 0.010,
      });
    }
  }

  var t = 0;
  function draw(dt) {
    t += dt;
    ctx.clearRect(0, 0, W, H);

    // Soft vertical light shafts (parchment), additive so they read as light.
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < shafts.length; i++) {
      var s = shafts[i];
      var cx = (s.x + Math.sin(t * s.sp + s.ph) * 0.05) * W;
      var hw = s.w * W * 0.5;
      var g = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0);
      g.addColorStop(0, "rgba(216,201,168,0)");
      g.addColorStop(0.5, "rgba(216,201,168," + s.a.toFixed(3) + ")");
      g.addColorStop(1, "rgba(216,201,168,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - hw, 0, hw * 2, H);
    }
    ctx.globalCompositeOperation = "source-over";

    // Drifting motes.
    for (var j = 0; j < motes.length; j++) {
      var m = motes[j];
      m.y += m.sp * dt;
      m.x += m.dx * dt;
      if (m.y > 1.04) { m.y = -0.04; m.x = Math.random(); }
      if (m.x < -0.05) m.x = 1.05; else if (m.x > 1.05) m.x = -0.05;
      ctx.globalAlpha = m.a;
      ctx.fillStyle = "rgba(220,208,180,1)";
      ctx.beginPath();
      ctx.arc(m.x * W, m.y * H, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  window.addEventListener("resize", resize);
  resize();
  seed();

  if (reduced) {
    draw(0); // single static frame, no animation
    return;
  }

  var last = 0;
  function loop(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    if (!document.hidden) draw(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
