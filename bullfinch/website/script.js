(function () {
  var canvas = document.getElementById("field");
  var ctx = canvas && canvas.getContext("2d");
  if (!ctx) return;

  var motes = [];
  var width = 0;
  var height = 0;
  var dpr = 1;
  var scrollT = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = width < 720 ? 70 : 130;
    motes = [];
    for (var i = 0; i < count; i++) {
      motes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.7 + Math.random() * 1.7,
        a: 0.12 + Math.random() * 0.34,
        s: 0.08 + Math.random() * 0.24,
      });
    }
  }

  function updateScroll() {
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollT = window.scrollY / max;
    document.body.classList.toggle("has-scrolled", window.scrollY > 8);
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    var shade = Math.min(1, scrollT * 1.2);
    var grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "rgba(" + Math.floor(58 - 48 * shade) + "," + Math.floor(58 - 52 * shade) + "," + Math.floor(54 - 50 * shade) + ",0.50)");
    grad.addColorStop(1, "rgba(0,0,0,0.84)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(200,194,181,1)";
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.y += m.s;
      m.x += Math.sin((m.y + i * 17) * 0.01) * 0.09;
      if (m.y > height + 12) {
        m.y = -12;
        m.x = Math.random() * width;
      }
      ctx.globalAlpha = m.a * (0.72 - shade * 0.22);
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("scroll", updateScroll, { passive: true });
  resize();
  updateScroll();
  draw();
})();
