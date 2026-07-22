/* ==========================================================================
   Bullfinch Earth - Teaser point-cloud engine (scene-teaser.js)
   --------------------------------------------------------------------------
   A single particle system that IS the story. The motes and the three
   point-cloud trees are the same points; they assemble, thin, regrow,
   disperse, and converge as you scroll. Purpose-built for teaser.html and
   fully decoupled from the investor build (scene-pointcloud.js is untouched).

   Public API (driven by the scroll driver in teaser.html):
     window.bullfinchTeaser.setStory(sf)     // sf 0..1 across problem->closing
     window.bullfinchTeaser.setPointer(x, y) // -1..1 for gentle parallax
     window.bullfinchTeaser.enter()          // begin the build-from-bottom
   ========================================================================== */
(function () {
  var canvas = document.getElementById("canopy");
  if (!canvas || typeof THREE === "undefined") return;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Palette (daylight: dark-green trees on warm beige) ----------------
  function cssColor(name, fb) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return new THREE.Color(v || fb);
  }
  var BG = cssColor("--gl-base", "#E9E4D3");
  var GREEN = cssColor("--gl-tree", "#243014");
  var ACCENT = cssColor("--gl-accent", "#E23B43");

  // ---- Tunables ----------------------------------------------------------
  var COUNT = 3000;          // particle budget
  var TREE_H = 3.2;          // grove height in world units
  var LOOK_Y = 1.35;         // camera focus height (grove vertical centre)
  var BALL_R = 0.5;          // convergence sphere radius
  var KEEP_FRAC = 0.015;     // ~1.5% stay lit while the grove thins ("<1%")
  var LERP = 0.09;           // how fast points chase their target
  var LOAD_SECONDS = 1.9;    // build-from-bottom duration

  // ---- Renderer / scene --------------------------------------------------
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(BG, 1);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, LOOK_Y, 6.2);
  camera.lookAt(0, LOOK_Y, 0);

  // ---- Buffers -----------------------------------------------------------
  var cur = new Float32Array(COUNT * 3);     // live positions
  var TREES = new Float32Array(COUNT * 3);   // grove target
  var WIDE = new Float32Array(COUNT * 3);    // dispersed field target
  var BALL = new Float32Array(COUNT * 3);    // convergence sphere target
  var yN = new Float32Array(COUNT);          // normalised tree height 0..1
  var keep = new Float32Array(COUNT);        // 1 = stays lit while thinning
  var rnd = new Float32Array(COUNT);         // stable per-particle random
  var phase = new Float32Array(COUNT);       // idle-noise phase
  var aAlpha = new Float32Array(COUNT);
  var aRand = new Float32Array(COUNT);

  function rand() { return Math.random(); }

  // Fibonacci sphere for the convergence ball.
  function ballPoint(i, n) {
    var gr = Math.PI * (3 - Math.sqrt(5));
    var y = 1 - (i / (n - 1)) * 2;
    var r = Math.sqrt(Math.max(0, 1 - y * y));
    var t = gr * i;
    return [Math.cos(t) * r, y, Math.sin(t) * r];
  }

  var story = { sf: 0 };
  var canopy = 1, spread = 0, ball = 0;      // derived story params
  var loadGrow = 0, entered = false, enterT = 0;
  var pointerX = 0, pointerY = 0;
  var started = false;

  function buildTargets(verts) {
    // verts: flat [x,y,z,...] of the tree cloud, already normalised so the
    // grove stands with base y=0, centred on x/z.
    var nv = verts.length / 3;
    // Actual grove top after scaling; drives focus height + normalisation.
    var gMaxY = 0.001;
    for (var q = 1; q < verts.length; q += 3) if (verts[q] > gMaxY) gMaxY = verts[q];
    LOOK_Y = gMaxY * 0.46;
    camera.position.set(0, LOOK_Y, 6.2);
    camera.lookAt(0, LOOK_Y, 0);
    for (var i = 0; i < COUNT; i++) {
      // Tree target: sample a vertex, jitter slightly for volume.
      var vi = (Math.floor(rand() * nv)) * 3;
      var tx = verts[vi] + (rand() - 0.5) * 0.05;
      var ty = verts[vi + 1] + (rand() - 0.5) * 0.05;
      var tz = verts[vi + 2] + (rand() - 0.5) * 0.05;
      TREES[i * 3] = tx; TREES[i * 3 + 1] = ty; TREES[i * 3 + 2] = tz;
      yN[i] = Math.min(1, Math.max(0, ty / gMaxY));

      // Wide dispersed field (drifting foliage across the view).
      WIDE[i * 3] = (rand() - 0.5) * 11.5;
      WIDE[i * 3 + 1] = 0.1 + rand() * rand() * 1.5;
      WIDE[i * 3 + 2] = (rand() - 0.5) * 7.0;

      // Convergence ball centred at the grove focus.
      var b = ballPoint(i, COUNT);
      BALL[i * 3] = b[0] * BALL_R * (0.7 + rand() * 0.5);
      BALL[i * 3 + 1] = LOOK_Y + b[1] * BALL_R * (0.7 + rand() * 0.5);
      BALL[i * 3 + 2] = b[2] * BALL_R * (0.7 + rand() * 0.5);

      keep[i] = rand() < KEEP_FRAC ? 1 : 0;
      rnd[i] = rand();
      aRand[i] = 0.65 + rand() * 0.7;
      phase[i] = rand() * Math.PI * 2;

      // Start parked at the bottom of the view (build rises from here).
      cur[i * 3] = tx * 0.6 + (rand() - 0.5) * 2.0;
      cur[i * 3 + 1] = -2.4 - rand() * 1.5;
      cur[i * 3 + 2] = tz * 0.6 + (rand() - 0.5) * 1.5;
      aAlpha[i] = 0;
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(cur, 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(aAlpha, 1));
    geo.setAttribute("aY", new THREE.BufferAttribute(yN, 1));
    geo.setAttribute("aRand", new THREE.BufferAttribute(aRand, 1));

    var mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uSize: { value: reduced ? 3.4 : 3.8 },
        uScale: { value: window.innerHeight * 0.5 },
        uGreen: { value: GREEN },
        uAccent: { value: ACCENT },
        uBg: { value: BG }
      },
      vertexShader: [
        "attribute float aAlpha; attribute float aY; attribute float aRand;",
        "uniform float uSize; uniform float uScale;",
        "varying float vA; varying float vY; varying float vD;",
        "void main(){",
        "  vec4 mv = modelViewMatrix * vec4(position,1.0);",
        "  gl_Position = projectionMatrix * mv;",
        "  gl_PointSize = uSize * aRand * uScale / max(0.1, -mv.z) * 0.012;",
        "  vA = aAlpha; vY = aY; vD = -mv.z;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform vec3 uGreen; uniform vec3 uAccent; uniform vec3 uBg;",
        "varying float vA; varying float vY; varying float vD;",
        "void main(){",
        "  vec2 d = gl_PointCoord - 0.5;",
        "  float r = dot(d,d);",
        "  if(r > 0.25) discard;",
        "  float edge = smoothstep(0.25, 0.06, r);",
        "  vec3 col = mix(uGreen, uAccent, pow(vY, 2.2) * 0.22);",
        "  float haze = clamp((vD - 4.5) / 10.0, 0.0, 0.55);",
        "  col = mix(col, uBg, haze);",
        "  float a = vA * edge * (1.0 - haze * 0.45);",
        "  if(a < 0.01) discard;",
        "  gl_FragColor = vec4(col, a);",
        "}"
      ].join("\n")
    });

    var points = new THREE.Points(geo, mat);
    scene.add(points);
    window.__bfPoints = { geo: geo, mat: mat };
    started = true;
    requestAnimationFrame(animate);
  }

  // ---- Story params from scroll fraction --------------------------------
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function seg(v, a, b) { return clamp01((v - a) / (b - a)); }
  function smooth(x) { x = clamp01(x); return x * x * (3 - 2 * x); }

  function deriveParams(sf) {
    // canopy: full -> thin (problem) -> regrow (how) -> full
    var c;
    if (sf < 0.12) c = 1;
    else if (sf < 0.28) c = 1 - seg(sf, 0.12, 0.28);   // thin to ~1%
    else if (sf < 0.34) c = 0;                           // held sparse
    else if (sf < 0.50) c = seg(sf, 0.34, 0.50);         // regrow (sticking point)
    else c = 1;                                          // stands
    canopy = c;
    // spread: disperse wide across "who" and hold through "trusted"
    spread = smooth(seg(sf, 0.60, 0.74));
    // ball: converge at the close
    ball = smooth(seg(sf, 0.88, 1.0));
  }

  // ---- Per-frame update --------------------------------------------------
  var tmp = new THREE.Vector3();
  function animate(now) {
    if (!started) return;
    var t = now * 0.001;
    if (entered) loadGrow = clamp01((t - enterT) / LOAD_SECONDS);

    var pos = window.__bfPoints.geo.attributes.position.array;
    var alp = window.__bfPoints.geo.attributes.aAlpha.array;

    for (var i = 0; i < COUNT; i++) {
      var j = i * 3;
      // Bottom-up release: a particle joins the grove when the growth front
      // (loadGrow) rises past its normalised height.
      var released = loadGrow >= yN[i] * 0.96;

      var tx, ty, tz, aT;
      if (!released) {
        // stay parked low until the front reaches it
        tx = TREES[j] * 0.6; ty = -2.4; tz = TREES[j + 2] * 0.6;
        aT = 0;
      } else {
        // base grove -> wide -> ball
        var bx = TREES[j] + (WIDE[j] - TREES[j]) * spread;
        var by = TREES[j + 1] + (WIDE[j + 1] - TREES[j + 1]) * spread;
        var bz = TREES[j + 2] + (WIDE[j + 2] - TREES[j + 2]) * spread;
        tx = bx + (BALL[j] - bx) * ball;
        ty = by + (BALL[j + 1] - by) * ball;
        tz = bz + (BALL[j + 2] - bz) * ball;

        // idle life: gentle drift, stronger when dispersed
        var drift = 0.02 + spread * 0.06;
        tx += Math.sin(t * 0.5 + phase[i]) * drift;
        ty += Math.cos(t * 0.42 + phase[i] * 1.3) * drift * 0.7;
        tz += Math.sin(t * 0.37 + phase[i] * 0.7) * drift;

        // alpha: canopy thinning (top-down) with the ~1% kept lit; the
        // convergence reveals everything as it collapses to the ball.
        var gate = keep[i] > 0.5 ? 1 : clamp01((canopy - yN[i] * 0.92 + 0.06) / 0.12);
        aT = gate + (1 - gate) * ball;
      }

      pos[j] += (tx - pos[j]) * LERP;
      pos[j + 1] += (ty - pos[j + 1]) * LERP;
      pos[j + 2] += (tz - pos[j + 2]) * LERP;
      alp[i] += (aT - alp[i]) * 0.12;
    }
    window.__bfPoints.geo.attributes.position.needsUpdate = true;
    window.__bfPoints.geo.attributes.aAlpha.needsUpdate = true;

    // Gentle camera parallax + a very slow grove yaw for depth (no scroll bounce).
    var targetX = pointerX * 0.5;
    var targetY = LOOK_Y + pointerY * 0.25;
    camera.position.x += (targetX - camera.position.x) * 0.04;
    camera.position.y += (targetY - camera.position.y) * 0.04;
    scene.rotation.y = Math.sin(t * 0.05) * 0.12;
    camera.lookAt(0, LOOK_Y, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  // ---- Load the tree cloud ----------------------------------------------
  fetch("assets/tree-pointcloud.obj?v=pc8")
    .then(function (r) { return r.text(); })
    .then(function (text) {
      var lines = text.split("\n");
      var raw = [];
      var minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].charCodeAt(0) !== 118) continue; // 'v'
        var p = lines[i].split(/\s+/);
        if (p[0] !== "v") continue;
        var x = parseFloat(p[1]), y = parseFloat(p[2]), z = parseFloat(p[3]);
        if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
        raw.push(x, y, z);
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      var h = Math.max(1e-3, maxY - minY);
      var wSpan = Math.max(1e-3, maxX - minX);
      var s = Math.min(TREE_H / h, 7.6 / wSpan);   // fit both height and width
      var cxRaw = (minX + maxX) / 2, czRaw = (minZ + maxZ) / 2;
      var verts = new Float32Array(raw.length);
      for (var k = 0; k < raw.length; k += 3) {
        verts[k] = (raw[k] - cxRaw) * s;
        verts[k + 1] = (raw[k + 1] - minY) * s;   // base sits on y=0
        verts[k + 2] = (raw[k + 2] - czRaw) * s;
      }
      buildTargets(verts);
    })
    .catch(function () {
      // No OBJ: fall back to a simple three-cone stand so the page still reads.
      var verts = [];
      var centres = [-2.2, 0, 2.2];
      for (var c = 0; c < 3; c++) {
        for (var n = 0; n < 900; n++) {
          var yy = Math.pow(Math.random(), 0.7) * TREE_H;
          var rr = (1 - yy / TREE_H) * 0.9 + 0.05;
          var a = Math.random() * Math.PI * 2;
          verts.push(centres[c] + Math.cos(a) * rr * Math.random(), yy, Math.sin(a) * rr * Math.random());
        }
      }
      buildTargets(new Float32Array(verts));
    });

  // ---- Resize ------------------------------------------------------------
  window.addEventListener("resize", function () {
    var w = window.innerWidth, hh = window.innerHeight;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
    if (window.__bfPoints) window.__bfPoints.mat.uniforms.uScale.value = hh * 0.5;
  });

  // ---- Public API --------------------------------------------------------
  window.bullfinchTeaser = {
    setStory: function (sf) { story.sf = sf; deriveParams(clamp01(sf)); },
    setPointer: function (x, y) { pointerX = x; pointerY = y; },
    enter: function () {
      if (entered) return;
      entered = true;
      enterT = performance.now() * 0.001;
    }
  };
  // If the splash is skipped/absent, the driver calls enter() itself; also
  // auto-enter after a beat so the grove never stays parked at the bottom.
  setTimeout(function () { if (!entered) window.bullfinchTeaser.enter(); }, 2600);
})();
