/* Bullfinch — quiet canopy scene (spec v9, rebuilt)
   The canvas is restrained. The type carries the page. The canvas exists
   to give the type air and signal descent through scroll.

   v9 LOCKED RULES (override anything stale in the spec file):
     1. CAMERA. y clamped to [0.5, 4.0]. NEVER crosses zero. lookAt CONSTANT
        (0, 0, 0). Dolly progress 0.0 → 0.90: position lerps from
        (0, 4.0, 8.0) to (0, 0.5, 3.0). Progress 0.90 → 1.0: HOLD at
        (0, 0.5, 3.0). The camera lands and stops.
     2. LAYER A. ONE backdrop plane parented to the camera at z = -12, so
        the camera can never cross it. Shader tint grades across four
        anchor colors driven by uLayerTint. No spatial walls.
     3. LAYER D. WAVE-BASED NETWORK GROWTH. Each mote caches its 1st..5th
        nearest neighbors (under 6.0 units) at startup. Five waves on the
        uConnect timeline, one per panel band. Lines track LIVE mote
        positions every frame, forever. Lines DO NOT freeze. uConnect runs
        linearly 0.02 → 1.00. No hold zone.
     4. LAYER E REMOVED. No convergence, no collapse, no final unification
        disc. End state IS the network: motes drifting, lines flexing, red
        bullfinch still in the field with its own ≤5 connections.
     5. Cursor parallax fades out as the camera lands so the landing stays
        still.

   Public API:
     window.bullfinchCanopy.setProgress(p)    // 0..1, drives all uniforms
     window.bullfinchCanopy.setLayerTint(p)   // alias of setProgress
     window.bullfinchCanopy.getLayerTint()
*/
(function () {
  var canvas = document.getElementById("canopy");
  if (!canvas) return;

  var reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion || typeof THREE === "undefined") {
    document.body.classList.add("is-fallback");
    window.bullfinchCanopy = {
      setProgress: function () {},
      setLayerTint: function () {},
      getLayerTint: function () { return 0; },
    };
    return;
  }

  function readCssColor(name) {
    var raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return new THREE.Color(raw || "#000000");
  }

  // Parse rgba(...) -> { color: THREE.Color, alpha: number }
  function readCssRgba(name) {
    var raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    var m = raw.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      var parts = m[1].split(",").map(function (s) { return parseFloat(s.trim()); });
      var r = (parts[0] || 0) / 255;
      var g = (parts[1] || 0) / 255;
      var b = (parts[2] || 0) / 255;
      var a = parts.length >= 4 ? parts[3] : 1;
      return { color: new THREE.Color(r, g, b), alpha: a };
    }
    return { color: readCssColor(name), alpha: 1 };
  }

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  var mobileLike =
    window.innerWidth < 720 ||
    (window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobileLike ? 1.35 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  var bgColor = readCssColor("--bg");
  renderer.setClearColor(bgColor, 1);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );

  // v9 Camera path. Constant lookAt at origin. y CLAMPED [0.5, 4.0].
  var CAM_START = new THREE.Vector3(0, 4.0, 8.0);
  var CAM_END   = new THREE.Vector3(0, 0.5, 3.0);
  var DOLLY_END_PROGRESS = 0.90;  // camera lands at this point and holds
  camera.position.copy(CAM_START);
  camera.lookAt(0, 0, 0);
  scene.add(camera); // required so child of camera renders

  // ---- Shared uniforms -------------------------------------------------
  var lineRgba = readCssRgba("--gl-line");
  var uniforms = {
    uTime:         { value: 0 },
    uCanopy:       { value: readCssColor("--gl-canopy") },
    uUnderstory:   { value: readCssColor("--gl-understory") },
    uLightShaft:   { value: readCssColor("--gl-light-shaft") },
    uLine:         { value: lineRgba.color.clone() },
    uLineAlpha:    { value: lineRgba.alpha },
    uAccent:       { value: readCssColor("--gl-accent") },
    uLayerTint:    { value: 0 },
    uShaftFade:    { value: 1 },
    uMoteDensity:  { value: 0 },
    uConnect:      { value: 0 },
  };

  var noiseGLSL = [
    "float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
    "float vnoise(vec2 p){",
    "  vec2 i=floor(p); vec2 f=fract(p);",
    "  float a=hash21(i); float b=hash21(i+vec2(1.0,0.0));",
    "  float c=hash21(i+vec2(0.0,1.0)); float d=hash21(i+vec2(1.0,1.0));",
    "  vec2 u=f*f*(3.0-2.0*f);",
    "  return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;",
    "}",
    "float fbm(vec2 p){",
    "  float v=0.0; float amp=0.5;",
    "  for(int i=0;i<5;i++){ v+=amp*vnoise(p); p*=2.02; amp*=0.5; }",
    "  return v;",
    "}",
  ].join("\n");

  var planeVertex = [
    "varying vec2 vUv;",
    "void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  ].join("\n");

  // ---- Layer A: ONE backdrop plane parented behind the camera ---------
  // Shader tint grades through four anchor colors as uLayerTint advances.
  // No other depth planes. Descent is felt through camera dolly + density
  // + line draw + tint grade. No walls to crash.
  var backdropFragment = [
    "uniform float uTime;",
    "uniform float uLayerTint;",
    "uniform vec3  uCanopy;",
    "uniform vec3  uUnderstory;",
    "varying vec2 vUv;",
    noiseGLSL,
    "void main(){",
    // Tint grade across 4 anchors:
    //   0.00–0.33  canopy            -> mix(canopy, under, 0.35)
    //   0.33–0.66  mix(c,u,0.35)     -> mix(canopy, under, 0.70)
    //   0.66–1.00  mix(c,u,0.70)     -> understory
    "  vec3 a0 = uCanopy;",
    "  vec3 a1 = mix(uCanopy, uUnderstory, 0.35);",
    "  vec3 a2 = mix(uCanopy, uUnderstory, 0.70);",
    "  vec3 a3 = uUnderstory;",
    "  float t = clamp(uLayerTint, 0.0, 1.0);",
    "  vec3 tinted;",
    "  if (t < 0.3333) {",
    "    tinted = mix(a0, a1, t / 0.3333);",
    "  } else if (t < 0.6666) {",
    "    tinted = mix(a1, a2, (t - 0.3333) / 0.3333);",
    "  } else {",
    "    tinted = mix(a2, a3, (t - 0.6666) / 0.3334);",
    "  }",
    // FBM noise becomes a slow volume we descend through: scroll moves the
    // sample window downward while time drifts layers against each other.
    "  vec2 uv = vUv;",
    "  float descent = uLayerTint * 1.75;",
    "  vec2 drift1 = vec2(sin(uTime * 0.035) * 0.16, -descent + uTime * 0.018);",
    "  vec2 drift2 = vec2(cos(uTime * 0.027) * 0.12, -descent * 1.45 - uTime * 0.012);",
    "  float n1 = fbm(uv * 2.4 + drift1 + 3.1);",
    "  float n2 = fbm(uv * 5.8 + drift2 + 17.0);",
    "  float field = smoothstep(0.28, 0.78, n1 * 0.68 + n2 * 0.32);",
    "  float depthShade = smoothstep(0.15, 1.0, uLayerTint);",
    "  tinted = mix(tinted, uUnderstory, depthShade * 0.38);",
    // Soft vignette so the canvas reads as atmosphere.
    "  vec2 centered = vUv - 0.5;",
    "  float disc = 1.0 - smoothstep(0.28, 0.62, length(centered));",
    "  float alpha = field * 0.55 * disc;",
    "  gl_FragColor = vec4(tinted, alpha);",
    "}",
  ].join("\n");

  // Plane sized to cover FOV at distance 12 with margin.
  // tan(27.5deg) * 12 ≈ 6.25 half-height; 36h covers wide aspects.
  var backdropGeo = new THREE.PlaneGeometry(60, 36, 1, 1);
  var backdropMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime:       uniforms.uTime,
      uLayerTint:  uniforms.uLayerTint,
      uCanopy:     uniforms.uCanopy,
      uUnderstory: uniforms.uUnderstory,
    },
    vertexShader: planeVertex,
    fragmentShader: backdropFragment,
  });
  var backdrop = new THREE.Mesh(backdropGeo, backdropMat);
  // Parent to camera so the plane always sits at a fixed offset behind
  // the camera. Geometrically impossible to cross.
  backdrop.position.set(0, 0, -12);
  backdrop.renderOrder = -10;
  camera.add(backdrop);

  // ---- Layer B: three diagonal light shafts (additive) -----------------
  var shaftFragment = [
    "uniform float uTime;",
    "uniform float uShaftFade;",
    "uniform vec3  uLightShaft;",
    "varying vec2 vUv;",
    noiseGLSL,
    "void main(){",
    "  vec2 uv = vUv;",
    "  float d1 = uv.x * 0.55 + uv.y * 0.95;",
    "  float d2 = (1.0 - uv.x) * 0.50 + uv.y * 0.90;",
    "  float d3 = uv.x * 0.78 + uv.y * 0.62;",
    "  float b1 = smoothstep(0.0, 1.0, 1.0 - abs(d1 - 0.82) * 3.4);",
    "  float b2 = smoothstep(0.0, 1.0, 1.0 - abs(d2 - 0.66) * 4.4);",
    "  float b3 = smoothstep(0.0, 1.0, 1.0 - abs(d3 - 0.55) * 5.2);",
    "  float n  = fbm(vec2(uv.x * 4.0, uv.y * 2.6 - uTime * 0.04));",
    "  float n2 = fbm(vec2(uv.x * 6.5 + 11.0, uv.y * 2.1 - uTime * 0.03));",
    "  b1 *= 0.55 + 0.55 * n;",
    "  b2 *= 0.45 + 0.55 * n2;",
    "  b3 *= 0.50 + 0.55 * n;",
    "  float topFade = pow(clamp(1.0 - uv.y * 0.55, 0.0, 1.0), 0.85);",
    "  topFade = max(topFade, 0.35);",
    "  float intensity = (b1 + b2 * 0.85 + b3 * 0.70) * topFade;",
    "  float peak = mix(0.02, 0.32, uShaftFade);",
    "  gl_FragColor = vec4(uLightShaft, clamp(intensity, 0.0, 1.0) * peak);",
    "}",
  ].join("\n");

  var shaftGeo = new THREE.PlaneGeometry(28, 18, 1, 1);
  var shaftMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime:       uniforms.uTime,
      uLightShaft: uniforms.uLightShaft,
      uShaftFade:  uniforms.uShaftFade,
    },
    vertexShader: planeVertex,
    fragmentShader: shaftFragment,
  });
  var shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.position.set(0, 2.0, 0.4);
  scene.add(shaft);

  // ---- Layer C: particle mote pool -------------------------------------
  // Index 0 is the red bullfinch mote (always visible, 2.4x size, accent).
  // Half the pool is always on so the canopy reads populated at progress 0.
  var PARTICLE_POOL = mobileLike ? 260 : 400;
  var BASE_MOTE_SIZE = 44.0;
  // Red mote is a solid red disc 2.2x base size, clearly larger than the rest.
  var RED_MOTE_SIZE  = 96.0;

  var positions   = new Float32Array(PARTICLE_POOL * 3);
  var swayPhase   = new Float32Array(PARTICLE_POOL);
  var swayRate    = new Float32Array(PARTICLE_POOL);
  var fallSpeed   = new Float32Array(PARTICLE_POOL);
  var thresholds  = new Float32Array(PARTICLE_POOL);
  var alphas      = new Float32Array(PARTICLE_POOL);
  var isRedMote   = new Float32Array(PARTICLE_POOL);
  var sizes       = new Float32Array(PARTICLE_POOL);

  for (var i = 0; i < PARTICLE_POOL; i++) {
    // Seed roughly within x∈[-10,10], y∈[-6,6], z∈[-6,4]
    positions[i * 3]     = (Math.random() - 0.5) * 20;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 1.0;
    swayPhase[i] = Math.random() * Math.PI * 2;
    swayRate[i]  = 0.2 + Math.random() * 0.35;
    fallSpeed[i] = 0.06 + Math.random() * 0.10;
    // Half the pool always on so >=200 motes are visible at progress 0.
    if (i < PARTICLE_POOL * 0.50) {
      thresholds[i] = 0.0;
    } else {
      thresholds[i] = (i - PARTICLE_POOL * 0.50) / (PARTICLE_POOL * 0.50);
    }
    alphas[i] = 0;
    isRedMote[i] = 0;
    sizes[i] = BASE_MOTE_SIZE;
  }
  // index 0 is the bullfinch: always on, 2.4x size, drifts slower
  isRedMote[0]   = 1.0;
  sizes[0]       = RED_MOTE_SIZE;
  fallSpeed[0]   = 0.025;
  swayRate[0]    = 0.10;
  thresholds[0]  = 0.0;
  // Park ABOVE the hero headline at scroll 0. Camera starts at
  // (0, 4.0, 8.0) looking at (0, 0, 0). Headline is vertically centered.
  // To put the seed in the upper third of screen, well clear of the text:
  //   y = 2.6  (above lookAt origin by 2.6 world units)
  //   z = 3.0  (between origin and camera so it renders large)
  // Camera at scroll 0: position (0, 4, 8), looks at (0, 4, 0) — horizontal.
  // Headline sits at screen center (gaze target). Seed needs to sit ABOVE
  // the gaze axis but not so far up it leaves the viewport. y=4.9 places
  // the seed just above the headline (about 30% from the top of the screen).
  positions[0]   = 0.0;
  positions[1]   = 4.9;
  positions[2]   = 4.5;

  // aGlow: per-mote electricity. 1.0 = full rim-glow, decays to 0 over 1.2s
  // after a mote becomes "connected" in the cascade. The seed mote sits at
  // a permanent low-level glow (set via partial seed-glow uniform below).
  var glows = new Float32Array(PARTICLE_POOL);
  var glowDecayRate = 1 / 1.2; // 1.2s decay

  var partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  partGeo.setAttribute("aAlpha",   new THREE.BufferAttribute(alphas, 1));
  partGeo.setAttribute("aRed",     new THREE.BufferAttribute(isRedMote, 1));
  partGeo.setAttribute("aSize",    new THREE.BufferAttribute(sizes, 1));
  partGeo.setAttribute("aGlow",    new THREE.BufferAttribute(glows, 1));

  var partVertex = [
    "attribute float aAlpha;",
    "attribute float aRed;",
    "attribute float aSize;",
    "attribute float aGlow;",
    "uniform float uPixelRatio;",
    "uniform float uTime;",
    "varying float vAlpha;",
    "varying float vRed;",
    "varying float vGlow;",
    "void main(){",
    "  vAlpha = aAlpha;",
    "  vRed   = aRed;",
    "  // seed mote pulses subtly (sin time on a 2.4s period)",
    "  float seedPulse = aRed * (0.65 + 0.35 * (0.5 + 0.5 * sin(uTime * 2.618)));",
    "  vGlow  = max(aGlow, seedPulse);",
    "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
    "  // halo motes get a slightly larger point so the glow ring renders",
    "  float sizeBoost = 1.0 + vGlow * 0.6;",
    "  gl_PointSize = aSize * sizeBoost * uPixelRatio * (1.0 / -mv.z);",
    "  gl_PointSize = clamp(gl_PointSize, 4.0, 128.0);",
    "  gl_Position = projectionMatrix * mv;",
    "}",
  ].join("\n");
  // Red seed dots render as SOLID red discs (no texture). The bullfinch
  // bird mark exists only as the HTML logo at the top/bottom of the page.
  // Texture-loading from file:// was unreliable and the seed went invisible.

  var partFragment = [
    "varying float vAlpha;",
    "varying float vRed;",
    "varying float vGlow;",
    "uniform vec3  uColor;",
    "uniform vec3  uAccent;",
    "void main(){",
    "  vec2 c = gl_PointCoord - vec2(0.5);",
    "  float d = length(c);",
    "  // Hard-edged solid disc with 1px AA. Same for red and gray motes.",
    "  float aa = smoothstep(0.50, 0.47, d);",
    "  if (aa <= 0.0 && vGlow <= 0.01) discard;",
    "  vec3 col = mix(uColor, uAccent, vRed);",
    "  col = mix(col, uAccent, vGlow * 0.8);",
    "  // Outer red glow ring when newly connected (or always on the seed via",
    "  // the seed-pulse contribution to vGlow from the vertex shader).",
    "  float ringMask = smoothstep(0.55, 0.32, d) - smoothstep(0.32, 0.18, d);",
    "  float haloAlpha = vGlow * ringMask * 0.65;",
    "  float coreAlpha = vAlpha * aa;",
    "  float alpha = max(coreAlpha, haloAlpha);",
    "  gl_FragColor = vec4(col, alpha);",
    "}",
  ].join("\n");
  var partMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor:       { value: readCssColor("--gl-mote") },
      uAccent:      uniforms.uAccent,
      uPixelRatio:  { value: renderer.getPixelRatio() },
      uTime:        uniforms.uTime,
    },
    vertexShader: partVertex,
    fragmentShader: partFragment,
  });
  var particles = new THREE.Points(partGeo, partMat);
  particles.renderOrder = 10;          // gray motes above lines
  scene.add(particles);

  // ----- SEPARATE Points mesh for the TWO red motes (indices 0 + 1) -----
  // Lives at renderOrder = 100 so it draws AFTER (on top of) everything
  // else in the scene. No other dot can occlude the red ones.
  var redGeo = new THREE.BufferGeometry();
  // Share the SAME buffers (positions, attributes) as the main mesh — we
  // just restrict the draw range to indices 0..1 (the two red motes).
  redGeo.setAttribute("position", partGeo.attributes.position);
  redGeo.setAttribute("aAlpha",   partGeo.attributes.aAlpha);
  redGeo.setAttribute("aRed",     partGeo.attributes.aRed);
  redGeo.setAttribute("aSize",    partGeo.attributes.aSize);
  redGeo.setAttribute("aGlow",    partGeo.attributes.aGlow);
  redGeo.setDrawRange(0, 2);        // first 2 vertices only
  var redMat = partMat.clone();
  redMat.depthTest = false;         // never occluded by anything
  redMat.uniforms = partMat.uniforms;
  var redParticles = new THREE.Points(redGeo, redMat);
  redParticles.renderOrder = 100;
  redParticles.frustumCulled = false;
  scene.add(redParticles);

  // ---- Layer D: WAVE-BASED NETWORK GROWTH (v9) -------------------------
  // ====== CASCADE PROPAGATION FROM RED SEED (v10) =======================
  // Network grows outward from index 0 (the red bullfinch).
  //   Wave 1: seed draws 5 lines to its 5 nearest unconnected motes.
  //   Wave 2: each of those 5 draws 2 lines to their 2 nearest unconnected motes.
  //   Wave 3: each of those 10 draws 2 lines.
  //   Wave 4: each of those 20 draws 2 lines.
  //   Wave 5: each of those 40 draws 2 lines.
  // Total: 5 + 10 + 20 + 40 + 80 = 155 lines. 156 connected motes.
  //
  // Each wave is scheduled across one global-scroll band. Within a wave,
  // lines stagger by parent so the cascade visibly fans outward.
  // ======================================================================

  var MAX_NEIGHBOR_DIST = 8.0;            // wider reach so the cascade can find children
  var MAX_NEIGHBOR_DIST_SQ = MAX_NEIGHBOR_DIST * MAX_NEIGHBOR_DIST;

  // Lines draw ONLY during the transitions between text blocks. While the
  // user sits on a panel, the wave is FULLY drawn (no animation). When they
  // start scrolling to the next panel, the next wave begins drawing.
  //
  // Page scroll structure (approx):
  //   Hero        0.00 – 0.10
  //   Panel 1     0.10 – 0.22   (transition into panel 1 = 0.05 – 0.10)
  //   Panel 2     0.22 – 0.34   (transition = 0.20 – 0.25)
  //   Panel 3     0.34 – 0.46   (transition = 0.32 – 0.37)
  //   Panel 4     0.46 – 0.58   (transition = 0.44 – 0.49)
  //   Panel 5     0.58 – 0.72   (transition = 0.56 – 0.61)
  //   Closing     0.72 – 0.92   (transition = 0.68 – 0.74)
  //   Footer      0.92 – 1.00
  //
  // Each wave fires in a TIGHT band at its transition. By the time the user
  // settles on a panel, the wave is complete. They read the panel in a stable
  // state. When they scroll on, the next wave fires.
  var WAVE_BANDS = [
    { wave: 1, start: 0.05, end: 0.10, fanout: 5 },   // hero → panel 1
    { wave: 2, start: 0.20, end: 0.25, fanout: 2 },   // panel 1 → 2
    { wave: 3, start: 0.32, end: 0.37, fanout: 2 },   // panel 2 → 3
    { wave: 4, start: 0.44, end: 0.49, fanout: 2 },   // panel 3 → 4
    { wave: 5, start: 0.56, end: 0.61, fanout: 2 },   // panel 4 → 5
  ];

  // Helper: find K nearest unconnected motes to a parent, preferring motes
  // whose y is at or below the parent (so the cascade visibly radiates DOWN).
  function findUnconnectedChildren(parentIdx, k, connectedSet) {
    var px = positions[parentIdx * 3];
    var py = positions[parentIdx * 3 + 1];
    var pz = positions[parentIdx * 3 + 2];
    var candidates = [];
    for (var ci = 0; ci < PARTICLE_POOL; ci++) {
      if (ci === parentIdx) continue;
      if (connectedSet[ci]) continue;
      var cx = positions[ci * 3];
      var cy = positions[ci * 3 + 1];
      var cz = positions[ci * 3 + 2];
      var dx = px - cx;
      var dy = py - cy;
      var dz = pz - cz;
      var d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > MAX_NEIGHBOR_DIST_SQ) continue;
      // Downward bias: motes below parent get a small distance bonus.
      var yBonus = cy < py ? 0.85 : 1.0;
      candidates.push({ idx: ci, score: d2 * yBonus });
    }
    candidates.sort(function (a, b) { return a.score - b.score; });
    var out = [];
    for (var oi = 0; oi < candidates.length && out.length < k; oi++) {
      out.push(candidates[oi].idx);
    }
    return out;
  }

  // Build the cascade. Track wave membership; each wave's frontier becomes
  // the parent set for the next wave.
  var SEED_IDX = 0;                       // index 0 is the red bullfinch
  var connectedSet = new Uint8Array(PARTICLE_POOL);
  connectedSet[SEED_IDX] = 1;
  // CRITICAL: also reserve the final red dot (index 1) BEFORE the wave loop
  // runs, so the cascade NEVER picks it as a child. The final dot is only
  // approached via the dedicated convergence band at scroll ~0.68–0.74.
  connectedSet[1] = 1;
  var finalEdges = [];
  var frontier = [SEED_IDX];              // Wave 1 parents
  var waveFrontiers = [];                 // store per-wave children

  for (var w = 0; w < WAVE_BANDS.length; w++) {
    var band = WAVE_BANDS[w];
    var nextFrontier = [];
    // We schedule thresholds parent-by-parent within the band so that
    // Scheduling per wave: each PARENT fans its children out in a tight
    // near-simultaneous burst (sibling stagger 0.001 uConnect units). Then
    // ALL parents in this wave fire across the wave band (parent stagger
    // spread evenly). Effect: when a parent activates, you see 5 (or 2)
    // lines fan out from it like a flower opening, not a slow drift.
    var SIBLING_STAGGER = 0.001;
    var parentSpan = Math.max(0.001, band.end - band.start - band.fanout * SIBLING_STAGGER);
    for (var fi = 0; fi < frontier.length; fi++) {
      var parent = frontier[fi];
      var parentStart = frontier.length <= 1
        ? band.start
        : band.start + parentSpan * (fi / (frontier.length - 1));
      var children = findUnconnectedChildren(parent, band.fanout, connectedSet);
      for (var ki = 0; ki < children.length; ki++) {
        var child = children[ki];
        connectedSet[child] = 1;
        nextFrontier.push(child);
        // Force every cascade-touched mote to be always-visible (density 0).
        // Prevents the "line draws to a non-existent dot" bug where the
        // child's density gate kept it invisible at the moment of connection.
        thresholds[child] = 0.0;
        // Bump cascade-touched motes to a larger render size so the network
        // reads cleanly (not specks).
        sizes[child] = BASE_MOTE_SIZE * 1.5;
        var threshold = parentStart + ki * SIBLING_STAGGER;
        finalEdges.push({
          a: parent,
          b: child,
          wave: band.wave,
          threshold: 0,
        });
      }
    }
    waveFrontiers.push(nextFrontier);
    frontier = nextFrontier;
    if (frontier.length === 0) break;     // ran out of reachable motes
  }

  // ====== CONVERGENCE WAVE: terminal dots → second red center dot =======
  // After all 5 cascade waves, the wave-5 children (the "terminal dots" at
  // the end of every chain) draw one more line each — to a SECOND red mote
  // placed at world origin (0, 0, 0). This pulls the whole network into a
  // visible focal resolution at the very end of scroll.
  // ======================================================================
  var FINAL_RED_IDX = 1;                       // second red mote, index 1
  isRedMote[FINAL_RED_IDX] = 1.0;
  sizes[FINAL_RED_IDX]     = RED_MOTE_SIZE;
  fallSpeed[FINAL_RED_IDX] = 0.0;              // does not fall
  swayRate[FINAL_RED_IDX]  = 0.0;              // does not sway
  thresholds[FINAL_RED_IDX] = 0.0;
  // FIXED POSITION at the forest floor. NEVER moves. Hidden at scroll 0 by
  // the camera looking ABOVE it; revealed by camera tilt-down as you descend.
  //   x = 0.0   (centered horizontally)
  //   y = -2.5  (forest floor — well below the canopy plane)
  //   z = 0.0   (on the central focal axis the camera looks down through)
  var FINAL_RED_X = 0.0;
  var FINAL_RED_Y = -2.5;
  var FINAL_RED_Z = 0.0;
  positions[FINAL_RED_IDX * 3]     = FINAL_RED_X;
  positions[FINAL_RED_IDX * 3 + 1] = FINAL_RED_Y;
  positions[FINAL_RED_IDX * 3 + 2] = FINAL_RED_Z;
  connectedSet[FINAL_RED_IDX] = 1;

  // Terminal dots are the last frontier we computed (wave-5 children).
  // Only HALF of them draw a line to the final red dot — keeps the
  // convergence focused (~40 lines, half the prior 80).
  var fullTerminalDots = frontier;             // length up to 80
  var terminalDots = [];
  for (var td = 0; td < fullTerminalDots.length; td += 2) {
    terminalDots.push(fullTerminalDots[td]);   // pick every other one
  }
  if (terminalDots.length > 0) {
    // Convergence band pulled inward. uConnect tracks scroll progress 1:1.
    // With DRAW_DURATION 0.03, the LAST convergence line starts at convEnd
    // and finishes at convEnd + 0.03. We want every line finished well
    // before the page reaches the footer (scroll 0.95+). Setting
    // convEnd = 0.86 means the last line finishes at uConnect 0.89 — long
    // before the closing section ends. Zero partial lines at the bottom.
    // Convergence fires ONLY after Panel 5 has scrolled off and the closing
    // headline is arriving. Pushed back to 0.78–0.84.
    for (var ti = 0; ti < terminalDots.length; ti++) {
      finalEdges.push({
        a: terminalDots[ti],
        b: FINAL_RED_IDX,
        wave: 6,
        threshold: 0,
      });
    }
  }

  var EDGE_COUNT = finalEdges.length;
  // 0.03 in uConnect units — short enough that even the last edge (threshold
  // ~0.95) finishes drawing well before scroll 1.0. Prevents partial lines
  // at the bottom of the page.
  var DRAW_DURATION = 0.03;
  var lineVerts = new Float32Array(EDGE_COUNT * 2 * 3);
  var lineEnd   = new Float32Array(EDGE_COUNT * 2);
  var lineThr   = new Float32Array(EDGE_COUNT * 2);
  var lineAlphaA = new Float32Array(EDGE_COUNT * 2);
  var edgeA     = new Int32Array(EDGE_COUNT);
  var edgeB     = new Int32Array(EDGE_COUNT);
  var edgeWave  = new Int32Array(EDGE_COUNT);

  for (var en = 0; en < EDGE_COUNT; en++) {
    var edge = finalEdges[en];
    edgeA[en] = edge.a;
    edgeB[en] = edge.b;
    edgeWave[en] = edge.wave;
    lineThr[en * 2]     = edge.threshold;
    lineThr[en * 2 + 1] = edge.threshold;
    lineEnd[en * 2]     = 0;
    lineEnd[en * 2 + 1] = 1;
    lineAlphaA[en * 2]     = 0;
    lineAlphaA[en * 2 + 1] = 0;
  }

  // aSpark: per-vertex flash decay (set to 1.0 on the frame an edge latches,
  // decays each frame). Drives a brief alpha + tint spike when a line lands.
  var lineSpark = new Float32Array(EDGE_COUNT * 2);

  var lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position",       new THREE.BufferAttribute(lineVerts, 3));
  lineGeo.setAttribute("aEndpoint",      new THREE.BufferAttribute(lineEnd, 1));
  lineGeo.setAttribute("aThreshold",     new THREE.BufferAttribute(lineThr, 1));
  lineGeo.setAttribute("aRevealedAlpha", new THREE.BufferAttribute(lineAlphaA, 1));
  lineGeo.setAttribute("aSpark",         new THREE.BufferAttribute(lineSpark, 1));

  // Vertex shader passes aEndpoint and aSpark to the fragment for the
  // parent-side red tint and the just-landed spark.
  var lineVertex = [
    "attribute float aEndpoint;",
    "attribute float aThreshold;",
    "attribute float aRevealedAlpha;",
    "attribute float aSpark;",
    "varying float vAlpha;",
    "varying float vEndpoint;",
    "varying float vSpark;",
    "void main(){",
    "  vAlpha = aRevealedAlpha;",
    "  vEndpoint = aEndpoint;",
    "  vSpark = aSpark;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}",
  ].join("\n");

  // Fragment shader:
  //   - Tint red near the parent end (aEndpoint=0). Fades to neutral toward child.
  //   - Spark briefly boosts alpha + tint when an edge first lands.
  var lineFragment = [
    "varying float vAlpha;",
    "varying float vEndpoint;",
    "varying float vSpark;",
    "uniform vec3  uLine;",
    "uniform vec3  uAccent;",
    "uniform float uLineAlpha;",
    "void main(){",
    // Tint factor: 0.35 at parent end (aEndpoint=0), 0.0 at child end.
    "  float parentTint = (1.0 - vEndpoint) * 0.35;",
    "  vec3 col = mix(uLine, uAccent, parentTint + vSpark * 0.45);",
    "  float alpha = vAlpha * uLineAlpha * (1.0 + vSpark * 0.6);",
    "  if (alpha <= 0.002) discard;",
    "  gl_FragColor = vec4(col, alpha);",
    "}",
  ].join("\n");

  var lineMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uLine:        uniforms.uLine,
      uAccent:      uniforms.uAccent,
      uLineAlpha:   uniforms.uLineAlpha,
    },
    vertexShader: lineVertex,
    fragmentShader: lineFragment,
  });
  var lineSegments = new THREE.LineSegments(lineGeo, lineMat);
  lineSegments.renderOrder = 5;        // lines under dots, above backdrop
  scene.add(lineSegments);

  // Arrowheads ride at the live drawing endpoint. The line grows toward the
  // next mote, and the arrow shows direction without leaving a naked endpoint.
  var arrowVerts = new Float32Array(EDGE_COUNT * 3 * 3);
  var arrowAlpha = new Float32Array(EDGE_COUNT * 3);
  var arrowGeo = new THREE.BufferGeometry();
  arrowGeo.setAttribute("position", new THREE.BufferAttribute(arrowVerts, 3));
  arrowGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arrowAlpha, 1));
  var arrowVertex = [
    "attribute float aAlpha;",
    "varying float vAlpha;",
    "void main(){",
    "  vAlpha = aAlpha;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}",
  ].join("\n");
  var arrowFragment = [
    "varying float vAlpha;",
    "uniform vec3 uColor;",
    "void main(){",
    "  if (vAlpha <= 0.0) discard;",
    "  gl_FragColor = vec4(uColor, vAlpha);",
    "}",
  ].join("\n");
  var arrowMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: readCssColor("--gl-mote") },
    },
    vertexShader: arrowVertex,
    fragmentShader: arrowFragment,
    side: THREE.DoubleSide,
  });
  var drawingArrows = new THREE.Mesh(arrowGeo, arrowMat);
  drawingArrows.renderOrder = 20;
  drawingArrows.frustumCulled = false;
  scene.add(drawingArrows);

  // Final contact shockwave. Triggered when convergence reaches the final
  // red mote, then expands outward as a thin red ring.
  var shockwaveGeo = new THREE.RingGeometry(0.92, 1.0, 96);
  var shockwaveMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uColor: uniforms.uAccent,
      uAlpha: { value: 0 },
    },
    vertexShader: [
      "void main(){",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform vec3 uColor;",
      "uniform float uAlpha;",
      "void main(){",
      "  if (uAlpha <= 0.001) discard;",
      "  gl_FragColor = vec4(uColor, uAlpha);",
      "}",
    ].join("\n"),
    side: THREE.DoubleSide,
  });
  var shockwave = new THREE.Mesh(shockwaveGeo, shockwaveMat);
  shockwave.position.set(FINAL_RED_X, FINAL_RED_Y, FINAL_RED_Z);
  shockwave.scale.setScalar(0.01);
  shockwave.renderOrder = 60;
  shockwave.frustumCulled = false;
  scene.add(shockwave);
  var shockwaveAge = -1;
  var SHOCKWAVE_DURATION = 1.55;

  var clickShockwaveMat = shockwaveMat.clone();
  clickShockwaveMat.uniforms = {
    uColor: uniforms.uAccent,
    uAlpha: { value: 0 },
  };
  var clickShockwave = new THREE.Mesh(shockwaveGeo, clickShockwaveMat);
  clickShockwave.scale.setScalar(0.01);
  clickShockwave.renderOrder = 61;
  clickShockwave.frustumCulled = false;
  scene.add(clickShockwave);
  var clickShockwaveAge = -1;
  var CLICK_SHOCKWAVE_DURATION = 0.72;

  // Per-edge "once drawn, stay drawn" latch. Prevents flicker when
  // No permanent latch — lines reverse with scroll. To kill micro-jitter
  // flicker, we track the previous strokeProgress per edge and only fire
  // the spark+glow once on rising edge through 0.5. Smoothstep eases the
  // soft entry/exit so brief reversals do not snap.
  var edgePrevStroke = new Float32Array(EDGE_COUNT);
  var activeLineSet = new Uint8Array(PARTICLE_POOL);

  // Spark decay rate — full bright → 0 over 0.4s.
  var SPARK_DECAY = 1 / 0.4;
  var waveProgress = [0, 0, 0, 0, 0, 0, 0];
  var tmpDir = new THREE.Vector3();
  var tmpCamDir = new THREE.Vector3();
  var tmpSide = new THREE.Vector3();

  function updateEdgePositionsAnimated(dtIn) {
    var posAttr   = lineGeo.attributes.position;
    var alphaAttr = lineGeo.attributes.aRevealedAlpha;
    var sparkAttr = lineGeo.attributes.aSpark;
    var arrowPosAttr = arrowGeo.attributes.position;
    var arrowAlphaAttr = arrowGeo.attributes.aAlpha;
    var dt = dtIn || 0;
    camera.getWorldDirection(tmpCamDir);
    activeLineSet.fill(0);
    for (var n = 0; n < EDGE_COUNT; n++) {
      var aIdx = edgeA[n];
      var bIdx = edgeB[n];
      var vA = n * 2 * 3;
      var vB = (n * 2 + 1) * 3;
      var ax = positions[aIdx * 3];
      var ay = positions[aIdx * 3 + 1];
      var az = positions[aIdx * 3 + 2];
      var bx = positions[bIdx * 3];
      var by = positions[bIdx * 3 + 1];
      var bz = positions[bIdx * 3 + 2];
      var threshold = lineThr[n * 2];
      var wave = edgeWave[n];
      var waveP = waveProgress[wave] || 0;
      var drawDuration = 1.0;

      // strokeProgress follows the real DOM trigger for its wave, not a
      // guessed global scroll band. This keeps convergence out of Panel 5.
      var strokeProgress = Math.max(0, Math.min(1, (waveP - threshold) / drawDuration));
      if (strokeProgress > 0.001) {
        activeLineSet[aIdx] = 1;
      }
      if (strokeProgress >= 0.999) {
        activeLineSet[bIdx] = 1;
      }

      // Contact spark: fire only when the line reaches the target mote.
      var prev = edgePrevStroke[n];
      if (prev < 0.999 && strokeProgress >= 0.999) {
        glows[bIdx] = 1.0;
        lineSpark[n * 2]     = 1.0;
        lineSpark[n * 2 + 1] = 1.0;
      }
      edgePrevStroke[n] = strokeProgress;

      // Decay any active spark on this edge.
      if (lineSpark[n * 2] > 0) {
        var newSpark = lineSpark[n * 2] - SPARK_DECAY * dt;
        if (newSpark < 0) newSpark = 0;
        lineSpark[n * 2]     = newSpark;
        lineSpark[n * 2 + 1] = newSpark;
      }

      // A endpoint always sits at live A position.
      lineVerts[vA]     = ax;
      lineVerts[vA + 1] = ay;
      lineVerts[vA + 2] = az;
      // B endpoint grows from source dot to target dot. An arrowhead rides
      // at this endpoint so the line is visibly drawing toward the next mote.
      var hx = ax + (bx - ax) * strokeProgress;
      var hy = ay + (by - ay) * strokeProgress;
      var hz = az + (bz - az) * strokeProgress;
      lineVerts[vB]     = hx;
      lineVerts[vB + 1] = hy;
      lineVerts[vB + 2] = hz;

      var arrowVisible = strokeProgress > 0.001 && strokeProgress < 0.999 ? 0.95 : 0.0;
      var av = n * 9;
      tmpDir.set(bx - ax, by - ay, bz - az);
      if (tmpDir.lengthSq() < 0.000001) tmpDir.set(0, 1, 0);
      tmpDir.normalize();
      tmpSide.crossVectors(tmpDir, tmpCamDir);
      if (tmpSide.lengthSq() < 0.000001) tmpSide.set(1, 0, 0);
      tmpSide.normalize();

      var arrowLen = 0.055;
      var arrowWidth = 0.026;
      var baseX = hx - tmpDir.x * arrowLen;
      var baseY = hy - tmpDir.y * arrowLen;
      var baseZ = hz - tmpDir.z * arrowLen;
      arrowVerts[av]     = hx;
      arrowVerts[av + 1] = hy;
      arrowVerts[av + 2] = hz;
      arrowVerts[av + 3] = baseX + tmpSide.x * arrowWidth;
      arrowVerts[av + 4] = baseY + tmpSide.y * arrowWidth;
      arrowVerts[av + 5] = baseZ + tmpSide.z * arrowWidth;
      arrowVerts[av + 6] = baseX - tmpSide.x * arrowWidth;
      arrowVerts[av + 7] = baseY - tmpSide.y * arrowWidth;
      arrowVerts[av + 8] = baseZ - tmpSide.z * arrowWidth;
      var aa = n * 3;
      arrowAlpha[aa] = arrowVisible;
      arrowAlpha[aa + 1] = arrowVisible;
      arrowAlpha[aa + 2] = arrowVisible;

      // Geometry does the drawing. Alpha is simply on while the segment has
      // length, avoiding the previous fade-in behavior.
      var finalFadeForLines = smoothstep(0.88, 1.0, waveProgress[6] || 0);
      var lineFloor = wave === 6 ? 1.0 : lerp(1.0, 0.25, finalFadeForLines);
      var visible = strokeProgress > 0.001 ? lineFloor : 0.0;
      lineAlphaA[n * 2]     = visible;
      lineAlphaA[n * 2 + 1] = visible;
    }
    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    sparkAttr.needsUpdate = true;
    arrowPosAttr.needsUpdate = true;
    arrowAlphaAttr.needsUpdate = true;
  }

  // ---- Cursor parallax (fine-pointer only) -----------------------------
  var hasFinePointer = !(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  var mouseNX = 0;
  var mouseNY = 0;
  var camParX = 0;
  var camParY = 0;
  var hoveredMoteIdx = -1;
  var hoverVec = new THREE.Vector3();

  function clearHoveredMote() {
    hoveredMoteIdx = -1;
    document.body.classList.remove("is-mote-hovering");
  }

  function findHoveredMote(clientX, clientY) {
    var nearestIdx = -1;
    var nearestDistSq = Infinity;
    var hitRadius = mobileLike ? 30 : 22;
    var hitRadiusSq = hitRadius * hitRadius;
    for (var hi = 0; hi < PARTICLE_POOL; hi++) {
      if (!activeLineSet[hi] || alphas[hi] < 0.12) continue;
      var pi = hi * 3;
      hoverVec.set(positions[pi], positions[pi + 1], positions[pi + 2]).project(camera);
      if (hoverVec.z < -1 || hoverVec.z > 1) continue;
      var sx = (hoverVec.x * 0.5 + 0.5) * window.innerWidth;
      var sy = (-hoverVec.y * 0.5 + 0.5) * window.innerHeight;
      var dx = sx - clientX;
      var dy = sy - clientY;
      var distSq = dx * dx + dy * dy;
      if (distSq <= hitRadiusSq && distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearestIdx = hi;
      }
    }
    return nearestIdx;
  }

  function updateHoveredMote(clientX, clientY) {
    var idx = findHoveredMote(clientX, clientY);
    hoveredMoteIdx = idx;
    if (idx >= 0) {
      document.body.classList.add("is-mote-hovering");
    } else {
      clearHoveredMote();
    }
  }

  function triggerMoteShockwave(idx) {
    if (idx < 0) return;
    var pi = idx * 3;
    clickShockwave.position.set(positions[pi], positions[pi + 1], positions[pi + 2]);
    clickShockwaveAge = 0;
    glows[idx] = 1.0;
  }

  var audioCtx = null;
  function getAudioContext() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!audioCtx) {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtor();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playMotePressSound() {
    var ctx = getAudioContext();
    if (!ctx) return;
    var now = ctx.currentTime;
    var end = now + 1.48;
    var out = ctx.createGain();
    var cannonFilter = ctx.createBiquadFilter();
    var compressor = ctx.createDynamicsCompressor();
    cannonFilter.type = "lowpass";
    cannonFilter.frequency.setValueAtTime(720, now);
    cannonFilter.frequency.exponentialRampToValueAtTime(120, now + 1.20);
    cannonFilter.Q.setValueAtTime(0.9, now);
    compressor.threshold.setValueAtTime(-18, now);
    compressor.knee.setValueAtTime(24, now);
    compressor.ratio.setValueAtTime(5, now);
    compressor.attack.setValueAtTime(0.006, now);
    compressor.release.setValueAtTime(0.28, now);
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.36, now + 0.018);
    out.gain.exponentialRampToValueAtTime(0.25, now + 0.26);
    out.gain.exponentialRampToValueAtTime(0.12, now + 0.92);
    out.gain.exponentialRampToValueAtTime(0.0001, end);
    out.connect(cannonFilter);
    cannonFilter.connect(compressor);
    compressor.connect(ctx.destination);

    var sweep = ctx.createOscillator();
    var sweepGain = ctx.createGain();
    var sweepFilter = ctx.createBiquadFilter();
    sweep.type = "sawtooth";
    sweep.frequency.setValueAtTime(210, now);
    sweep.frequency.exponentialRampToValueAtTime(27, now + 1.10);
    sweepFilter.type = "lowpass";
    sweepFilter.frequency.setValueAtTime(560, now);
    sweepFilter.frequency.exponentialRampToValueAtTime(82, now + 1.12);
    sweepFilter.Q.setValueAtTime(2.2, now);
    sweepFilter.Q.exponentialRampToValueAtTime(0.8, now + 1.12);
    sweepGain.gain.setValueAtTime(0.0001, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.42, now + 0.035);
    sweepGain.gain.exponentialRampToValueAtTime(0.30, now + 0.38);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.28);
    sweep.connect(sweepFilter);
    sweepFilter.connect(sweepGain);
    sweepGain.connect(out);

    var sub = ctx.createOscillator();
    var subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(46, now);
    sub.frequency.exponentialRampToValueAtTime(18, now + 0.82);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.92, now + 0.024);
    subGain.gain.exponentialRampToValueAtTime(0.44, now + 0.28);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.06);
    sub.connect(subGain);
    subGain.connect(out);

    var pulse = ctx.createOscillator();
    var pulseGain = ctx.createGain();
    pulse.type = "sine";
    pulse.frequency.setValueAtTime(32, now + 0.18);
    pulse.frequency.exponentialRampToValueAtTime(21, now + 1.04);
    pulseGain.gain.setValueAtTime(0.0001, now + 0.12);
    pulseGain.gain.exponentialRampToValueAtTime(0.62, now + 0.22);
    pulseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.18);
    pulse.connect(pulseGain);
    pulseGain.connect(out);

    var noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.72)), ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var ni = 0; ni < data.length; ni++) {
      var nFade = 1 - ni / data.length;
      data[ni] = (Math.random() * 2 - 1) * nFade * nFade;
    }
    var noise = ctx.createBufferSource();
    var noiseFilter = ctx.createBiquadFilter();
    var noiseGain = ctx.createGain();
    noise.buffer = noiseBuffer;
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(420, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(70, now + 0.84);
    noiseFilter.Q.setValueAtTime(1.1, now);
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.16, now + 0.018);
    noiseGain.gain.exponentialRampToValueAtTime(0.07, now + 0.34);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.90);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(out);

    sweep.start(now);
    sweep.stop(now + 1.34);
    sub.start(now);
    sub.stop(now + 1.10);
    pulse.start(now + 0.12);
    pulse.stop(now + 1.22);
    noise.start(now);
    noise.stop(now + 0.94);
  }

  if (hasFinePointer) {
    window.addEventListener("mousemove", function (e) {
      mouseNX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseNY = (e.clientY / window.innerHeight) * 2 - 1;
      updateHoveredMote(e.clientX, e.clientY);
    }, { passive: true });
    window.addEventListener("mouseleave", clearHoveredMote, { passive: true });
  }
  window.addEventListener("pointerdown", function (e) {
    updateHoveredMote(e.clientX, e.clientY);
    if (hoveredMoteIdx >= 0) {
      triggerMoteShockwave(hoveredMoteIdx);
      playMotePressSound();
    }
  }, { passive: true });

  // ---- Theme change: lerp gl-* uniforms + clear color over 400ms -------
  function refreshLineColor() {
    return readCssRgba("--gl-line");
  }

  window.addEventListener("bullfinch:themechange", function () {
    var duration = 400;
    var start = performance.now();
    var initial = {
      canopy: uniforms.uCanopy.value.clone(),
      under:  uniforms.uUnderstory.value.clone(),
      shaft:  uniforms.uLightShaft.value.clone(),
      part:   partMat.uniforms.uColor.value.clone(),
      arrow:  arrowMat.uniforms.uColor.value.clone(),
      accent: uniforms.uAccent.value.clone(),
      line:   uniforms.uLine.value.clone(),
      lineA:  uniforms.uLineAlpha.value,
      bg:     bgColor.clone(),
    };
    var targetLine = refreshLineColor();
    var target = {
      canopy: readCssColor("--gl-canopy"),
      under:  readCssColor("--gl-understory"),
      shaft:  readCssColor("--gl-light-shaft"),
      part:   readCssColor("--gl-mote"),
      arrow:  readCssColor("--gl-mote"),
      accent: readCssColor("--gl-accent"),
      line:   targetLine.color,
      lineA:  targetLine.alpha,
      bg:     readCssColor("--bg"),
    };
    function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = t * t * (3 - 2 * t);
      uniforms.uCanopy.value.lerpColors(initial.canopy, target.canopy, eased);
      uniforms.uUnderstory.value.lerpColors(initial.under, target.under, eased);
      uniforms.uLightShaft.value.lerpColors(initial.shaft, target.shaft, eased);
      uniforms.uAccent.value.lerpColors(initial.accent, target.accent, eased);
      uniforms.uLine.value.lerpColors(initial.line, target.line, eased);
      uniforms.uLineAlpha.value = initial.lineA + (target.lineA - initial.lineA) * eased;
      partMat.uniforms.uColor.value.lerpColors(initial.part, target.part, eased);
      arrowMat.uniforms.uColor.value.lerpColors(initial.arrow, target.arrow, eased);
      bgColor.lerpColors(initial.bg, target.bg, eased);
      renderer.setClearColor(bgColor, 1);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  // ---- Resize ----------------------------------------------------------
  function onResize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    partMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  window.addEventListener("resize", onResize);

  // ---- Visibility ------------------------------------------------------
  var visible = !document.hidden;
  document.addEventListener("visibilitychange", function () {
    visible = !document.hidden;
  });

  // ---- Animation loop --------------------------------------------------
  var clock = new THREE.Clock();
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  var lastElapsed = 0;

  function animate() {
    if (visible) {
      var elapsed = clock.getElapsedTime();
      var dt = Math.min(0.05, Math.max(0, elapsed - lastElapsed));
      lastElapsed = elapsed;
      uniforms.uTime.value = elapsed;

      // Motes drift (gentle, downward). No convergence math — lines
      // simply track wherever the motes go.
      var density = uniforms.uMoteDensity.value;
      var fallScale = lerp(1.0, 0.55, density);
      var finalFade = smoothstep(0.88, 1.0, waveProgress[6] || 0);
      for (var i = 0; i < PARTICLE_POOL; i++) {
        var xi = i * 3;
        var yi = i * 3 + 1;
        // Index 1 = final red dot. ABSOLUTELY STATIONARY. Skip all movement.
        if (i === 1) {
          alphas[i] = 1.0;
          continue;
        }
        positions[yi] -= fallSpeed[i] * 0.0020 * fallScale;
        if (i === 0) {
          positions[xi] += Math.sin(elapsed * swayRate[i] + swayPhase[i]) * 0.0008;
        } else {
          positions[xi] += Math.sin(elapsed * swayRate[i] + swayPhase[i]) * 0.0010;
        }
        if (positions[yi] < -7.0) {
          positions[yi] = 7.0;
          positions[xi] = (Math.random() - 0.5) * 20;
        }
        // Density gate. Red seed (i=0) is always on. Second red dot (i=1) is
        // hidden until the convergence wave begins at uConnect ~ 0.84.
        var gate = smoothstep(thresholds[i], thresholds[i] + 0.05, density);
        if (i === 0) {
          alphas[i] = lerp(1.0, 0.25, finalFade);
        } else if (i === 1) {
          // Final red dot is fixed at the floor. Always on — the camera
          // simply pans down to reveal it. No alpha gating.
          alphas[i] = 1.0;
        } else {
          alphas[i] = lerp(0.9 * gate, 0.25, finalFade);
        }
        // Decay rim-glow at 1/1.2s. Glow values are set to 1.0 by the line
        // latch logic when a child mote first gets connected.
        if (glows[i] > 0) {
          glows[i] -= glowDecayRate * dt;
          if (glows[i] < 0) glows[i] = 0;
        }
      }
      if (hoveredMoteIdx >= 0) {
        glows[hoveredMoteIdx] = Math.max(glows[hoveredMoteIdx], 0.95);
      }
      // Final red dot is FIXED at (0, -2.5, 0) — set once at startup. The
      // camera tilts down to reveal it. NO position animation here.


      partGeo.attributes.position.needsUpdate = true;
      partGeo.attributes.aAlpha.needsUpdate = true;
      partGeo.attributes.aGlow.needsUpdate = true;

      // Update line buffer (reads live positions for both endpoints).
      updateEdgePositionsAnimated(dt);

      // LINEAR dolly across the ENTIRE scroll (no easing, no early hold).
      // The user wanted a slow continuous camera pan over the whole journey.
      // Removing smoothstep + tightening to 0..1 means it never finishes early.
      var lt = uniforms.uLayerTint.value;
      var dollyT = lt;                              // raw scroll progress, linear
      var dollyX = lerp(CAM_START.x, CAM_END.x, dollyT);
      var dollyY = lerp(CAM_START.y, CAM_END.y, dollyT);
      var dollyZ = lerp(CAM_START.z, CAM_END.z, dollyT);
      // Clamp defensively (must never cross 0.5).
      if (dollyY < 0.5) dollyY = 0.5;

      // Cursor parallax — fades out as the camera lands so the
      // landing stays still. Effectively zero past progress 0.90.
      var parallaxAttenuation = hasFinePointer ? (1.0 - smoothstep(0.85, 1.0, lt)) : 0.0;
      if (hasFinePointer) {
        var halfH = Math.tan((55 * Math.PI / 180) / 2) * Math.max(0.5, Math.abs(dollyZ));
        var halfW = halfH * camera.aspect;
        var maxX = (18 / window.innerWidth) * halfW * 2 * parallaxAttenuation;
        var maxY = (10 / window.innerHeight) * halfH * 2 * parallaxAttenuation;
        var targetX = mouseNX * maxX;
        var targetY = -mouseNY * maxY;
        camParX += (targetX - camParX) * 0.05;
        camParY += (targetY - camParY) * 0.05;
      } else {
        camParX = 0;
        camParY = 0;
      }

      camera.position.x = dollyX + camParX;
      camera.position.y = dollyY + camParY;
      camera.position.z = dollyZ;
      // LINEAR camera tilt across the entire scroll, not eased to the end.
      // At scroll 0: gaze HORIZONTAL (lookAt y = camera y = 4.0).
      // At scroll 1: gaze ANGLED DOWN (lookAt y = -1.5).
      // Drives a slow, continuous downward pan over the whole journey.
      var rawProgress = uniforms.uLayerTint.value;   // 0..1 raw scroll progress
      var lookY = lerp(CAM_START.y, -1.5, rawProgress);
      camera.lookAt(0, lookY, 0);

      if (shockwaveAge >= 0) {
        shockwaveAge += dt;
        var shockT = Math.min(1, shockwaveAge / SHOCKWAVE_DURATION);
        var shockEase = 1 - Math.pow(1 - shockT, 3);
        shockwave.position.set(FINAL_RED_X, FINAL_RED_Y, FINAL_RED_Z);
        shockwave.quaternion.copy(camera.quaternion);
        shockwave.scale.setScalar(0.18 + shockEase * 7.2);
        var shockFade = 1 - smoothstep(0.82, 1.0, shockT);
        shockwaveMat.uniforms.uAlpha.value = shockFade * 0.88;
        if (shockT >= 1) {
          shockwaveAge = -1;
          shockwaveMat.uniforms.uAlpha.value = 0;
        }
      } else {
        shockwaveMat.uniforms.uAlpha.value = 0;
      }

      if (clickShockwaveAge >= 0) {
        clickShockwaveAge += dt;
        var clickT = Math.min(1, clickShockwaveAge / CLICK_SHOCKWAVE_DURATION);
        var clickEase = 1 - Math.pow(1 - clickT, 3);
        clickShockwave.quaternion.copy(camera.quaternion);
        clickShockwave.scale.setScalar(0.06 + clickEase * 1.35);
        clickShockwaveMat.uniforms.uAlpha.value = (1 - smoothstep(0.62, 1.0, clickT)) * 0.78;
        if (clickT >= 1) {
          clickShockwaveAge = -1;
          clickShockwaveMat.uniforms.uAlpha.value = 0;
        }
      } else {
        clickShockwaveMat.uniforms.uAlpha.value = 0;
      }

      renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
  }
  animate();

  // ---- Public API ------------------------------------------------------
  // uConnect runs linearly 0.02 → 1.00. No hold. No convergence.
  function setProgress(p) {
    var v = Math.max(0, Math.min(1, p));
    uniforms.uLayerTint.value   = v;
    uniforms.uShaftFade.value   = 1.0 - v;
    uniforms.uMoteDensity.value = v;
    uniforms.uConnect.value     = v;
  }
  function setWaveProgress(wave, p) {
    var idx = Math.max(1, Math.min(6, wave | 0));
    waveProgress[idx] = Math.max(0, Math.min(1, p));
  }
  var previousConvergenceProgress = 0;
  function setConvergenceProgress(p) {
    var v = Math.max(0, Math.min(1, p));
    if (previousConvergenceProgress < 0.999 && v >= 0.999) {
      shockwaveAge = 0;
    }
    previousConvergenceProgress = v;
    setWaveProgress(6, v);
  }
  window.bullfinchCanopy = {
    setProgress: setProgress,
    setLayerTint: setProgress,
    setWaveProgress: setWaveProgress,
    setConvergenceProgress: setConvergenceProgress,
    getLayerTint: function () { return uniforms.uLayerTint.value; },
  };
})();
