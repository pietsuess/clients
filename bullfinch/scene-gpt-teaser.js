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

  // Clear color: the point-cloud variant lifts the near-black base to an earthy
  // atmosphere floor (--gl-base) so the backdrop tint reads as forest, not void.
  // Falls back to --bg for the standard scene.
  var baseRaw = getComputedStyle(document.documentElement).getPropertyValue("--gl-base").trim();
  var bgColor = readCssColor(baseRaw ? "--gl-base" : "--bg");
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
    "  float disc = 1.0 - smoothstep(0.34, 0.84, length(centered));",
    "  float alpha = field * 0.72 * disc;",
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

  // Horizontal field is scaled to the viewport aspect so the network stays
  // within screen bounds on ANY device. The camera's vertical FOV is constant,
  // so the visible horizontal extent tracks aspect: narrow portrait -> narrow
  // field, wide desktop -> wider. z is kept in front of the landed camera so
  // no dot ends up too close / behind it.
  var viewAspect = window.innerWidth / Math.max(1, window.innerHeight);
  var FIELD_HALF_X = Math.max(2.2, Math.min(6.5, 4.2 * viewAspect));
  for (var i = 0; i < PARTICLE_POOL; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 2 * FIELD_HALF_X;
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
  // Park the seed in the hero headline area, around the second line of type.
  // The first line wave does not begin until after the opening data-stack
  // panel has passed.
  positions[0]   = 0.0;
  positions[1]   = 3.45;
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
  // Per-mote height gradient for the grove (like the standalone tester): 0 at
  // the base, ramping toward the accent at the canopy top. 0 for all motes
  // until the tree targets are assigned at obj load, and only visible while the
  // grove is formed (scaled by uTreeForm in the shader).
  var treeTint = new Float32Array(PARTICLE_POOL);
  partGeo.setAttribute("aTreeTint", new THREE.BufferAttribute(treeTint, 1));

  var partVertex = [
    "attribute float aAlpha;",
    "attribute float aRed;",
    "attribute float aSize;",
    "attribute float aGlow;",
    "attribute float aTreeTint;",
    "uniform float uPixelRatio;",
    "uniform float uTime;",
    "varying float vAlpha;",
    "varying float vRed;",
    "varying float vGlow;",
    "varying float vTreeTint;",
    "void main(){",
    "  vAlpha = aAlpha;",
    "  vRed   = aRed;",
    "  vTreeTint = aTreeTint;",
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
    "varying float vTreeTint;",
    "uniform vec3  uColor;",
    "uniform vec3  uAccent;",
    "uniform float uTreeForm;",
    "void main(){",
    "  vec2 c = gl_PointCoord - vec2(0.5);",
    "  float d = length(c);",
    "  // Hard-edged solid disc with 1px AA. Same for red and gray motes.",
    "  float aa = smoothstep(0.50, 0.47, d);",
    "  if (aa <= 0.0 && vGlow <= 0.01) discard;",
    "  vec3 col = mix(uColor, uAccent, vRed);",
    "  col = mix(col, uAccent, vGlow * 0.8);",
    "  // Grove height gradient: base mote color -> accent up the canopy.",
    "  col = mix(col, uAccent, clamp(vTreeTint * uTreeForm, 0.0, 1.0));",
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
      uTreeForm:    { value: 0 },
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
  redGeo.setAttribute("aTreeTint", partGeo.attributes.aTreeTint);
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
  //   Wave 6: each of those 80 draws 1 line.
  // Total: 5 + 10 + 20 + 40 + 80 + 80 = 235 lines.
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
    { wave: 5, start: 0.56, end: 0.61, fanout: 1 },   // panel 4 → 5 (single line, no split)
    { wave: 6, start: 0.68, end: 0.73, fanout: 1 },   // panel 5 → 6 (single line, no split)
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
      // Successive descent: strongly PREFER motes below the parent (4x penalty
      // for anything not clearly lower) so the network visibly descends — but
      // never EXCLUDE, since excluding dead-ends a branch and can leave no
      // terminal dots for the final convergence to the red dot.
      var yPenalty = cy < py - 0.2 ? 1.0 : 4.0;
      candidates.push({ idx: ci, score: d2 * yPenalty });
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
  // After all 6 cascade waves, the wave-6 children (the "terminal dots" at
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
  // FIXED in world space — ONE value for every device (no per-device guess).
  // The dot sits on the central focal axis at the forest floor; the camera
  // dollies in and tilts down to ARRIVE at it. Because the camera's vertical
  // FOV is constant, this projects to the same vertical screen anchor (~lower
  // third) on any aspect ratio, portrait mobile included. The closing text is
  // then composed around that landing (see .closing in styles.css).
  //   x = 0.0   (centred horizontally)
  //   y = -2.5  (forest floor — below the canopy plane, revealed by tilt-down)
  //   z = 0.0   (on the focal axis the camera looks down through)
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
        wave: 7,
        threshold: 0,
      });
    }
  }

  // Convergence "AROUND" the final dot: lay the feeder (terminal) dots in a
  // ring encircling the final red dot, so the lines collapse INWARD radially (a
  // sunburst) instead of stacking into a vertical column that reaches up and
  // back down. Ring radius is kept inside the on-screen field so it also works
  // on narrow portrait screens. Freeze the connected network so it holds this
  // shape — if these dots keep falling/drifting, the lines reach up to wherever
  // they ended up (the up-then-down ugliness).
  for (var cf = 0; cf < PARTICLE_POOL; cf++) {
    if (connectedSet[cf]) fallSpeed[cf] = 0;
  }
  var convRX = Math.min(FIELD_HALF_X * 0.85, 3.0);
  var convRY = 1.9;
  for (var tr = 0; tr < terminalDots.length; tr++) {
    var tIdx = terminalDots[tr];
    var ang = (tr / Math.max(1, terminalDots.length)) * Math.PI * 2;
    var rr = 0.6 + 0.4 * (((tr * 7) % 5) / 4);   // vary the radius a little
    positions[tIdx * 3]     = FINAL_RED_X + Math.cos(ang) * convRX * rr;
    positions[tIdx * 3 + 1] = FINAL_RED_Y + Math.sin(ang) * convRY * rr;
    positions[tIdx * 3 + 2] = FINAL_RED_Z + (((tr % 3) - 1) * 0.35);
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
  var SHOCKWAVE_DURATION = 3.0;   // slow, deliberate bloom (time-based, not scroll-bound)

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
  var waveProgress = [0, 0, 0, 0, 0, 0, 0, 0];
  var seedReveal = 1.0;            // index-0 seed scale/visibility (0..1)
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
      // Convergence lines (wave 7) finish drawing at progress 0.75, so contact
      // with the final red dot happens late in the closing scroll. The blast is
      // time-based (see SHOCKWAVE_DURATION), so a later land doesn't speed it up.
      var drawDuration = wave === 7 ? 0.75 : 1.0;

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

      var arrowVisible = wave === 7
        ? (strokeProgress > 0.001 ? 0.95 : 0.0)
        : (strokeProgress > 0.001 && strokeProgress < 0.999 ? 0.95 : 0.0);
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
      var finalFadeForLines = smoothstep(0.88, 1.0, waveProgress[7] || 0);
      var lineFloor = wave === 7 ? 1.0 : lerp(1.0, 0.25, finalFadeForLines);
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

    var thud = ctx.createOscillator();
    var thudGain = ctx.createGain();
    thud.type = "sine";
    thud.frequency.setValueAtTime(118, now);
    thud.frequency.exponentialRampToValueAtTime(58, now + 0.16);
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.exponentialRampToValueAtTime(1.25, now + 0.006);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    thud.connect(thudGain);
    thudGain.connect(out);

    var ping = ctx.createOscillator();
    var pingGain = ctx.createGain();
    var pingFilter = ctx.createBiquadFilter();
    ping.type = "sine";
    ping.frequency.setValueAtTime(1260, now);
    pingFilter.type = "bandpass";
    pingFilter.frequency.setValueAtTime(1260, now);
    pingFilter.Q.setValueAtTime(18.0, now);
    pingGain.gain.setValueAtTime(0.0001, now);
    pingGain.gain.exponentialRampToValueAtTime(0.16, now + 0.008);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    ping.connect(pingFilter);
    pingFilter.connect(pingGain);
    pingGain.connect(ctx.destination);

    sweep.start(now);
    sweep.stop(now + 1.34);
    sub.start(now);
    sub.stop(now + 1.10);
    pulse.start(now + 0.12);
    pulse.stop(now + 1.22);
    noise.start(now);
    noise.stop(now + 0.94);
    thud.start(now);
    thud.stop(now + 0.30);
    ping.start(now);
    ping.stop(now + 0.50);
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
    // Returning from a backgrounded tab / woken screen: the viewport may have
    // changed while we were hidden, leaving the WebGL buffer, ScrollTrigger pin
    // measurements, and Lenis stale (which shows as a black bar / broken scroll
    // at the bottom). Re-sync them once layout settles.
    if (visible) {
      setTimeout(function () {
        onResize();
        if (window.lenis && window.lenis.resize) window.lenis.resize();
        if (window.ScrollTrigger && window.ScrollTrigger.refresh) {
          window.ScrollTrigger.refresh();
        }
      }, 150);
    }
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
      // Connected (network) dots have fallSpeed 0, so they hold their shape and
      // the convergence ring stays put; only ambient motes drift past.
      var finalFade = smoothstep(0.88, 1.0, waveProgress[7] || 0);
      for (var i = 0; i < PARTICLE_POOL; i++) {
        var xi = i * 3;
        var yi = i * 3 + 1;
        // Index 1 = final red dot. ABSOLUTELY STATIONARY in world space — the
        // camera dollies/tilts down to arrive at it, which gives the focal
        // point real depth and parallax. Always on; it simply starts below the
        // gaze and is revealed as the camera lands. Skip all movement.
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
          positions[xi] = (Math.random() - 0.5) * 2 * FIELD_HALF_X;
        }
        // Density gate. Red seed (i=0) is always on. Second red dot (i=1) is
        // hidden until the convergence wave begins at uConnect ~ 0.84.
        var gate = smoothstep(thresholds[i], thresholds[i] + 0.05, density);
        if (i === 0) {
          // Seed fades + scales in via seedReveal (hero -> section 01).
          alphas[i] = lerp(1.0, 0.25, finalFade) * seedReveal;
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

      // Seed reveal: scale the first red dot from 0 -> full (RED_MOTE_SIZE).
      // aSize is shared with redGeo, so one needsUpdate refreshes both draws.
      var seedTargetSize = RED_MOTE_SIZE * seedReveal;
      if (sizes[0] !== seedTargetSize) {
        sizes[0] = seedTargetSize;
        partGeo.attributes.aSize.needsUpdate = true;
      }

      // Tree grove formation (index-pointcloud variant): repositions locked
      // motes and fades fill dots. Must run BEFORE the buffers upload and
      // before the lines read positions below.
      updateTreeFormation(elapsed);

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
      // Pull back over the grove formation band to take in all three trees,
      // then rejoin the scripted dolly before the closing choreography.
      dollyZ += treeZoomBump();
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

      // Contact blast: TIME-based slow bloom, armed by scroll crossing the land
      // point (see setConvergenceProgress). Plays over SHOCKWAVE_DURATION at a
      // fixed speed, so it can't be flicked past on a fast scroll. Eases out as
      // it grows and fades to nothing by the end.
      if (shockwaveAge >= 0) {
        shockwaveAge += dt;
        var shockT = Math.min(1, shockwaveAge / SHOCKWAVE_DURATION);
        var shockEase = 1 - Math.pow(1 - shockT, 2.4);
        shockwave.position.set(FINAL_RED_X, FINAL_RED_Y, FINAL_RED_Z);
        shockwave.quaternion.copy(camera.quaternion);
        shockwave.scale.setScalar(0.18 + shockEase * 7.2);
        var shockFade = 1 - smoothstep(0.7, 1.0, shockT);
        shockwaveMat.uniforms.uAlpha.value = shockFade * 0.88;
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
  // NOTE: animate() is invoked AFTER the Layer T block below (see the call
  // right before the Public API section). The first animate() call runs a
  // full frame synchronously, and that frame reads Layer T state via
  // treeZoomBump()/updateTreeFormation(). If those vars were still undefined
  // at that moment, NaN would enter the camera parallax smoother and poison
  // it permanently (NaN + anything = NaN), rendering the entire scene
  // invisible with no console error. That exact bug shipped once. Do not
  // move the animate() call back up here.

  // ---- Layer T: TREE GROVE FORMATION (index-pointcloud variant only) ----
  // The grove is built FROM the existing dot system, not layered on top:
  //   - Every ambient mote (all except the two red dots) is assigned a
  //     target point in the tree cloud. Leaving section 02 (scroll 0.30),
  //     each mote flies from wherever it currently drifts to its tree
  //     position with per-dot stagger, completing by 0.42. The cascade
  //     lines read live mote positions every frame, so the drawn network
  //     is CARRIED into the grove, edges flexing along the way.
  //   - The remaining tree points render as fill dots through the SAME
  //     particle material as the motes (identical size/color/glow
  //     language) and fade in in place as the motes arrive.
  //   - The camera bumps back during the band (see treeZoomBump in the
  //     dolly) to take in all three trees, then returns to the scripted
  //     path well before the closing convergence choreography.
  // Asset: assets/tree-pointcloud.obj holds three trees side by side
  // along X, normalized to height 1 with base at y = 0, centered on x.
  // Timing is DOM-anchored: index-pointcloud.html creates ScrollTriggers on
  // the real pinned panel ranges (leaving 02 -> settled on 03) and drives
  // setTreeProgress: 0 -> 1 as 03 arrives (form), back to 0 as 04 arrives
  // (disperse to the ambient field). No global-progress guesswork here.
  var TREE_MAX_HEIGHT = 5.0;    // world-unit clamp on grove height
  var TREE_BASE_Y = -2.5;       // legacy forest floor (grove now centers on the text)
  var TREE_CENTER_OFFSET_Y = 0; // nudge grove off screen-vertical-center (+ = up)
  var TREE_CZ = -1.5;
  var treeFormTarget = 0;       // driven by the DOM-anchored trigger (setTreeProgress)
  var treeFormP = 0;            // per-frame smoothed
  // Grove yaw: a gentle constant turn while the grove stands, ramping up
  // through the assembly + dispersal motion (like the standalone tester's
  // auto-orbit) and easing back to the slow turn once formed / dispersed.
  var treeSpinAngle = 0;        // accumulated yaw (rad), integrated per frame
  var treeSpinPrevT = 0;        // last elapsed sample, for the local dt
  var TREE_SPIN_BASE = 0.12;    // rad/s while standing (the "slow turn")
  var TREE_SPIN_BOOST = 0.85;   // rad/s added at mid-transition (peak liveliness)
  var treeReady = false;
  var treeNorm = null;          // normalized grove coords (height 1, base 0, centered)
  var fillNorm = null;
  var assetHalfW = 0.7;         // measured from the asset at load
  var moteNormIdx = new Int32Array(PARTICLE_POOL);
  var moteCapture  = new Float32Array(PARTICLE_POOL * 3);
  var moteLocked   = new Uint8Array(PARTICLE_POOL);
  var moteFormSeed = new Float32Array(PARTICLE_POOL);
  var fillAlphaAttr = null, fillPosAttr = null;
  var fillSeedArr = null, fillStartArr = null;
  var fillCount = 0;
  // Target height drives the reveal after the OBJ is assigned, so the exact
  // Point Cloud 3 grove forms from forest floor to canopy.
  for (var ms = 0; ms < PARTICLE_POOL; ms++) moteFormSeed[ms] = 0;

  function tClamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  // The grove is placed like the OTHER graphics: directly left of the text
  // column, never under it. The zone is MEASURED from the DOM (panel left
  // padding to the text block's left edge) and converted from pixels to
  // world units at grove depth every frame, so alignment holds across
  // viewports and through the camera pull-back.
  var groveZoneL = 64, groveZoneR = 480;   // px fallbacks, remeasured below
  function measureGroveZone() {
    var panel = document.getElementById("opportunity");
    var inner = panel && panel.querySelector(".panel__inner");
    if (!panel || !inner) {
      groveZoneL = window.innerWidth * 0.05;
      groveZoneR = window.innerWidth * 0.32;
      return;
    }
    var pad = parseFloat(getComputedStyle(panel).paddingLeft) || 32;
    var textLeft = inner.getBoundingClientRect().left;
    groveZoneL = pad;
    groveZoneR = Math.max(pad + 120, textLeft - 24);   // keep a gap to the text
  }
  measureGroveZone();
  window.addEventListener("resize", measureGroveZone);

  fetch("assets/tree-pointcloud.obj?v=pc8")
    .then(function (res) { return res.text(); })
    .then(function (text) {
      // Parse raw verts first, then normalize HERE from the measured bounds.
      // The asset is already normalized, but normalizing defensively at load
      // means a stale-cached asset of any scale can never fling the dots to
      // off-screen coordinates.
      var raw = [];
      var minX = Infinity, maxX = -Infinity;
      var minY = Infinity, maxY = -Infinity;
      var minZ = Infinity, maxZ = -Infinity;
      var objLines = text.split("\n");
      for (var li = 0; li < objLines.length; li++) {
        var ln = objLines[li];
        if (ln.charCodeAt(0) === 118 && ln.charCodeAt(1) === 32) {
          var parts = ln.split(" ");
          var rx = parseFloat(parts[1]);
          var ry = parseFloat(parts[2]);
          var rz = parseFloat(parts[3]);
          if (rx !== rx || ry !== ry || rz !== rz) continue;
          raw.push(rx, ry, rz);
          if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
          if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
          if (rz < minZ) minZ = rz; if (rz > maxZ) maxZ = rz;
        }
      }
      var treeCount = raw.length / 3;
      if (!treeCount) return;
      var normH = Math.max(0.0001, maxY - minY);
      var normCX = (minX + maxX) / 2;
      var normCZ = (minZ + maxZ) / 2;
      treeNorm = new Float32Array(treeCount * 3);
      for (var wi = 0; wi < treeCount; wi++) {
        treeNorm[wi * 3]     = (raw[wi * 3]     - normCX) / normH;
        treeNorm[wi * 3 + 1] = (raw[wi * 3 + 1] - minY)   / normH;
        treeNorm[wi * 3 + 2] = (raw[wi * 3 + 2] - normCZ) / normH;
      }
      assetHalfW = ((maxX - minX) / normH) / 2 || 0.7;

      // Shuffle indices; first slice becomes mote targets, rest are fill.
      var idx = new Array(treeCount);
      for (var s0 = 0; s0 < treeCount; s0++) idx[s0] = s0;
      for (var s1 = treeCount - 1; s1 > 0; s1--) {
        var s2 = (Math.random() * (s1 + 1)) | 0;
        var tmpI = idx[s1]; idx[s1] = idx[s2]; idx[s2] = tmpI;
      }
      // Include indices 0 (the bullfinch seed) and 1 (the floor convergence
      // dot) so the red motes join the grove as ordinary points instead of
      // hovering apart as separate god-dots. They ramp down to mote size while
      // formed and are restored to their canonical roles once dispersed.
      var take = 0;
      var TREE_TINT = 0.55;   // max blend toward the accent at the canopy top
      for (var mi = 0; mi < PARTICLE_POOL && take < treeCount; mi++, take++) {
        moteNormIdx[mi] = idx[take];
        moteFormSeed[mi] = treeNorm[idx[take] * 3 + 1];
        treeTint[mi] = Math.pow(treeNorm[idx[take] * 3 + 1], 2.2) * TREE_TINT;
      }
      partGeo.attributes.aTreeTint.needsUpdate = true;

      fillCount = treeCount - take;
      var fillPos  = new Float32Array(fillCount * 3);
      var fillA    = new Float32Array(fillCount);
      var fillRed  = new Float32Array(fillCount);
      var fillSize = new Float32Array(fillCount);
      var fillGlow = new Float32Array(fillCount);
      fillSeedArr  = new Float32Array(fillCount);
      fillStartArr = new Float32Array(fillCount * 3);
      fillNorm     = new Float32Array(fillCount * 3);
      var fillTint = new Float32Array(fillCount);
      for (var fi = 0; fi < fillCount; fi++) {
        var si = idx[take + fi] * 3;
        fillNorm[fi * 3]     = treeNorm[si];
        fillNorm[fi * 3 + 1] = treeNorm[si + 1];
        fillNorm[fi * 3 + 2] = treeNorm[si + 2];
        fillTint[fi] = Math.pow(treeNorm[si + 1], 2.2) * TREE_TINT;
        // Fly in from the ambient mote field volume (same distribution the
        // motes spawn in), so the whole field reads as condensing into trees.
        fillStartArr[fi * 3]     = (Math.random() - 0.5) * 2 * FIELD_HALF_X * 1.15;
        fillStartArr[fi * 3 + 1] = (Math.random() - 0.5) * 12;
        fillStartArr[fi * 3 + 2] = (Math.random() - 0.5) * 10 - 1.0;
        fillPos[fi * 3]     = fillStartArr[fi * 3];
        fillPos[fi * 3 + 1] = fillStartArr[fi * 3 + 1];
        fillPos[fi * 3 + 2] = fillStartArr[fi * 3 + 2];
        fillSize[fi] = BASE_MOTE_SIZE * (0.6 + Math.random() * 0.3);
        fillSeedArr[fi] = fillNorm[fi * 3 + 1];
      }
      var fillGeo = new THREE.BufferGeometry();
      fillGeo.setAttribute("position", new THREE.BufferAttribute(fillPos, 3));
      fillGeo.setAttribute("aAlpha",   new THREE.BufferAttribute(fillA, 1));
      fillGeo.setAttribute("aRed",     new THREE.BufferAttribute(fillRed, 1));
      fillGeo.setAttribute("aSize",    new THREE.BufferAttribute(fillSize, 1));
      fillGeo.setAttribute("aGlow",    new THREE.BufferAttribute(fillGlow, 1));
      fillGeo.setAttribute("aTreeTint", new THREE.BufferAttribute(fillTint, 1));
      fillAlphaAttr = fillGeo.attributes.aAlpha;
      fillPosAttr   = fillGeo.attributes.position;
      var fillPoints = new THREE.Points(fillGeo, partMat);
      fillPoints.renderOrder = 9;    // just beneath the ambient motes (10)
      fillPoints.frustumCulled = false;
      scene.add(fillPoints);
      treeReady = true;
    })
    .catch(function (err) {
      console.error("tree point cloud failed to load:", err);
    });

  // Camera pull-back rides the formation itself: out as the grove forms,
  // held while it stands, and back in as the dots disperse again (the 04
  // trigger drives the formation back to 0, so the camera follows for free).
  function treeZoomBump() {
    function ss(a, b, x) {
      x = tClamp01((x - a) / (b - a));
      return x * x * (3 - 2 * x);
    }
    return 2.2 * ss(0.05, 0.6, treeFormP);
  }

  // Runs every frame from the animate loop, after the organic mote update
  // and before position buffers upload / lines read them.
  function updateTreeFormation(elapsed) {
    treeFormP += (treeFormTarget - treeFormP) * 0.08;
    partMat.uniforms.uTreeForm.value = treeFormP;  // height gradient shows only while formed
    if (!treeReady) return;
    if (treeFormP < 0.001) {
      for (var r = 0; r < PARTICLE_POOL; r++) moteLocked[r] = 0;
      // Restore the fixed convergence dot to the floor and both red motes to
      // full size (the seed's size is re-applied upstream via seedReveal). This
      // guarantees the closing convergence reads the exact canonical position.
      positions[FINAL_RED_IDX * 3]     = FINAL_RED_X;
      positions[FINAL_RED_IDX * 3 + 1] = FINAL_RED_Y;
      positions[FINAL_RED_IDX * 3 + 2] = FINAL_RED_Z;
      if (sizes[FINAL_RED_IDX] !== RED_MOTE_SIZE) {
        sizes[FINAL_RED_IDX] = RED_MOTE_SIZE;
        partGeo.attributes.aSize.needsUpdate = true;
      }
      if (fillAlphaAttr && fillAlphaAttr.array[0] !== 0) {
        for (var rf = 0; rf < fillCount; rf++) fillAlphaAttr.array[rf] = 0;
        fillAlphaAttr.needsUpdate = true;
      }
      return;
    }
    var ff = smoothstep(0.88, 1.0, waveProgress[7] || 0);
    // Pixel-to-world conversion at grove depth for THIS frame's camera, so
    // the grove stays seated in the measured zone through the pull-back.
    var lt2 = uniforms.uLayerTint.value;
    var camZ = lerp(CAM_START.z, CAM_END.z, lt2) + treeZoomBump();
    var dist = Math.max(1, camZ - TREE_CZ);
    var halfW = Math.tan((camera.fov || 55) * Math.PI / 360) * dist * camera.aspect;
    var zl = ((groveZoneL / window.innerWidth) * 2 - 1) * halfW;
    var zr = ((groveZoneR / window.innerWidth) * 2 - 1) * halfW;
    var groveCX = (zl + zr) / 2;
    var S = (zr - zl) * 0.92 / (assetHalfW * 2);
    if (S > TREE_MAX_HEIGHT) S = TREE_MAX_HEIGHT;
    if (S < 0.8) S = 0.8;
    // Seat the grove's CENTER on the screen-vertical center (the middle of the
    // #opportunity text column) rather than on the forest floor. Trace the
    // camera's center ray to the grove z-plane so the center holds through the
    // dolly/tilt and the zoom pull-back. camZ (with the bump) is computed above.
    var camY2 = lerp(CAM_START.y, CAM_END.y, lt2); if (camY2 < 0.5) camY2 = 0.5;
    var lookY2 = lerp(CAM_START.y, -1.5, lt2);
    var tRay = (TREE_CZ - camZ) / (-camZ);          // camZ in [3,10]; never 0
    var groveCenterY = camY2 + tRay * (lookY2 - camY2);
    var baseY = groveCenterY - S * 0.5 + TREE_CENTER_OFFSET_Y;

    // Yaw the whole grove about its own vertical axis. Slow constant turn while
    // it stands (treeFormP ~ 0 or 1); lively through the transition (env peaks
    // at treeFormP 0.5). Time-integrated, so it keeps turning on a paused scroll
    // -- the standalone tester's continuous orbit, gated to the assembly motion.
    var dtSpin = treeSpinPrevT ? Math.min(0.05, elapsed - treeSpinPrevT) : 0;
    treeSpinPrevT = elapsed;
    var spinEnv = 4 * treeFormP * (1 - treeFormP);  // 0 at ends, 1 mid-transition
    treeSpinAngle += (TREE_SPIN_BASE + TREE_SPIN_BOOST * spinEnv) * dtSpin;
    var spinCos = Math.cos(treeSpinAngle), spinSin = Math.sin(treeSpinAngle);
    var redSizeDirty = false;
    for (var i = 0; i < PARTICLE_POOL; i++) {
      var w = tClamp01(treeFormP * 1.25 - moteFormSeed[i] * 0.25);
      if (w <= 0) { moteLocked[i] = 0; continue; }
      var xi = i * 3, yi = xi + 1, zi = xi + 2;
      if (!moteLocked[i]) {
        moteLocked[i] = 1;
        moteCapture[xi] = positions[xi];
        moteCapture[yi] = positions[yi];
        moteCapture[zi] = positions[zi];
      }
      var e = w * w * (3 - 2 * w);
      // Red motes (seed + convergence dot) shrink from god-size to mote size as
      // they join the grove, so they read as part of the cloud, not apart.
      if (isRedMote[i]) {
        var rs = lerp(RED_MOTE_SIZE, BASE_MOTE_SIZE, e);
        if (sizes[i] !== rs) { sizes[i] = rs; redSizeDirty = true; }
      }
      var sway = Math.sin(elapsed * swayRate[i] + swayPhase[i]) * 0.02 * e;
      var mt = moteNormIdx[i] * 3;
      var mlx = treeNorm[mt]     * S;   // grove-local x/z, before yaw
      var mlz = treeNorm[mt + 2] * S;
      var mtx = groveCX + mlx * spinCos - mlz * spinSin;
      var mty = treeNorm[mt + 1] * S + baseY;
      var mtz = TREE_CZ  + mlx * spinSin + mlz * spinCos;
      positions[xi] = moteCapture[xi] + (mtx - moteCapture[xi]) * e + sway;
      positions[yi] = moteCapture[yi] + (mty - moteCapture[yi]) * e;
      positions[zi] = moteCapture[zi] + (mtz - moteCapture[zi]) * e;
      var aTree = lerp(1.0 * e, 0.3, ff);   // fully opaque when formed (brighter on the earthy field)
      if (aTree > alphas[i]) alphas[i] = aTree;
    }
    if (redSizeDirty) partGeo.attributes.aSize.needsUpdate = true;
    // Fill dots FLY from the ambient field into the trees (same stagger
    // family as the motes) rather than fading in place.
    var fa = fillAlphaAttr.array;
    var fp = fillPosAttr.array;
    var fillAmp = lerp(1.0, 0.3, ff);   // fill dots fully opaque when formed
    for (var f = 0; f < fillCount; f++) {
      var wf = tClamp01(treeFormP * 1.25 - fillSeedArr[f] * 0.25);
      var ef = wf * wf * (3 - 2 * wf);
      var f3 = f * 3;
      var flx = fillNorm[f3]     * S;   // grove-local x/z, before yaw
      var flz = fillNorm[f3 + 2] * S;
      var ftx = groveCX + flx * spinCos - flz * spinSin;
      var fty = fillNorm[f3 + 1] * S + baseY;
      var ftz = TREE_CZ  + flx * spinSin + flz * spinCos;
      fp[f3]     = fillStartArr[f3]     + (ftx - fillStartArr[f3]) * ef;
      fp[f3 + 1] = fillStartArr[f3 + 1] + (fty - fillStartArr[f3 + 1]) * ef;
      fp[f3 + 2] = fillStartArr[f3 + 2] + (ftz - fillStartArr[f3 + 2]) * ef;
      // visible almost as soon as they start moving, so the flight is seen
      fa[f] = Math.min(1, ef * 3.0) * fillAmp;
    }
    fillPosAttr.needsUpdate = true;
    fillAlphaAttr.needsUpdate = true;
  }

  // Start the render loop only now that Layer T state exists (see the NOTE
  // above the Layer T block: the first frame runs synchronously).
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
    var idx = Math.max(1, Math.min(7, wave | 0));
    waveProgress[idx] = Math.max(0, Math.min(1, p));
  }
  // Seed (index 0) reveal: 0 = invisible, 1 = full. Driven by scroll from the
  // hero headline to section 01 so the first red dot scales into existence.
  function setSeedReveal(p) {
    seedReveal = Math.max(0, Math.min(1, p));
  }
  var previousConvergenceProgress = 0;
  // Lines draw over 0 -> 0.75; contact (and the time-based blast) happens late
  // in the closing scroll. Same on every viewport; the DOM trigger ends exactly
  // at closing-settled.
  var FINAL_CONVERGENCE_LAND = 0.75;
  function setConvergenceProgress(p) {
    var v = Math.max(0, Math.min(1, p));
    // Arm the slow blast when scroll first crosses the land point; disarm when
    // scrolling back below it so it re-plays on the next pass. Plays the full
    // SHOCKWAVE_DURATION regardless of scroll speed — can't be flicked past.
    if (previousConvergenceProgress < FINAL_CONVERGENCE_LAND && v >= FINAL_CONVERGENCE_LAND) {
      shockwaveAge = 0;
    } else if (v < FINAL_CONVERGENCE_LAND) {
      shockwaveAge = -1;
    }
    previousConvergenceProgress = v;
    setWaveProgress(7, v);
  }
  window.bullfinchCanopy = {
    setProgress: setProgress,
    setLayerTint: setProgress,
    setWaveProgress: setWaveProgress,
    setConvergenceProgress: setConvergenceProgress,
    setSeedReveal: setSeedReveal,
    // Tree grove formation (index-pointcloud variant): driven by the
    // DOM-anchored ScrollTriggers in index-pointcloud.html. 03 approaching
    // drives 0 -> 1 (form); 04 approaching drives 1 -> 0 (disperse).
    setTreeProgress: function (p) { treeFormTarget = tClamp01(p); },
    getLayerTint: function () { return uniforms.uLayerTint.value; },
  };
})();
