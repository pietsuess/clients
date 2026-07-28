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
  // OPT-IN, per page. With <body data-canvas-transparent> the canvas clears
  // to nothing instead of to the page colour, so a DOM layer underneath it
  // can be seen through the mote field. Only teaser-dev sets this; every
  // other page that loads this scene is byte-identical in behaviour.
  var transparentBackdrop = document.body && document.body.hasAttribute("data-canvas-transparent");
  var clearAlpha = transparentBackdrop ? 0 : 1;
  renderer.setClearColor(bgColor, clearAlpha);

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
  camera.lookAt(0, -1.0, 0);
  // unproject() is used below to place the opening field against the actual
  // viewport. Commit the camera transform first so those screen coordinates
  // do not inherit the camera's pre-lookAt matrix.
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
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
    // Keep a visible forest-floor layer on the opening frame. The remaining
    // density still follows scroll directly.
    uMoteDensity:  { value: 0.08 },
    uConnect:      { value: 0 },
    // ---- Bar WIPE (Piet) ------------------------------------------------
    // The background colour is not crossfaded. A headline bar rides up the
    // screen and the new colour exists ONLY above its top edge — a hard
    // boundary that travels with the bar. uWipeY is that edge in screen
    // space (0 = bottom, 1 = top); uCanopyTo/uUnderstoryTo are the incoming
    // colours. With no wipe running the *To pair equals the *From pair, so
    // the boundary is a no-op.
    uWipeY:        { value: 1.0 },
    uCanopyTo:     { value: readCssColor("--gl-canopy") },
    uUnderstoryTo: { value: readCssColor("--gl-understory") },
    uRes:          { value: new THREE.Vector2(1, 1) },
    // The flat page colour under everything. A clear colour can't hold a
    // boundary, so an opaque full-screen quad carries it instead.
    uBase:         { value: readCssColor(baseRaw ? "--gl-base" : "--bg") },
    uBaseTo:       { value: readCssColor(baseRaw ? "--gl-base" : "--bg") },
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
    "uniform vec3  uCanopyTo;",
    "uniform vec3  uUnderstoryTo;",
    "uniform float uWipeY;",
    "uniform vec2  uRes;",
    "varying vec2 vUv;",
    noiseGLSL,
    "void main(){",
    // Hard wipe boundary in SCREEN space (the plane's own UVs are bigger than
    // the frustum, so gl_FragCoord is the only honest measure). The bar sweeps
    // bottom -> top and leaves the new colour BEHIND it, so 1 = at or below
    // the bar's top edge = already wiped.
    "  float wipe = step(gl_FragCoord.y / uRes.y, uWipeY);",
    // Tint grade across 4 anchors:
    //   0.00–0.33  canopy            -> mix(canopy, under, 0.35)
    //   0.33–0.66  mix(c,u,0.35)     -> mix(canopy, under, 0.70)
    //   0.66–1.00  mix(c,u,0.70)     -> understory
    "  vec3 cCanopy = mix(uCanopy, uCanopyTo, wipe);",
    "  vec3 cUnder  = mix(uUnderstory, uUnderstoryTo, wipe);",
    "  vec3 a0 = cCanopy;",
    "  vec3 a1 = mix(cCanopy, cUnder, 0.35);",
    "  vec3 a2 = mix(cCanopy, cUnder, 0.70);",
    "  vec3 a3 = cUnder;",
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
      uCanopyTo:     uniforms.uCanopyTo,
      uUnderstoryTo: uniforms.uUnderstoryTo,
      uWipeY:        uniforms.uWipeY,
      uRes:          uniforms.uRes,
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

  // ---- Layer A0: the flat page colour, with the wipe boundary -----------
  // Sits behind the backdrop plane and paints the base colour opaquely, so
  // the bar's hard edge applies to the page colour itself and not just to
  // the atmospheric tint above it.
  // uBaseAlpha exists ONLY so a page can let a DOM layer show through the
  // canvas. It stays 1 everywhere unless <body data-canvas-transparent> is
  // set (teaser-dev), in which case it fades over the closing — see
  // transparentBackdrop below. transparent:true costs nothing while the
  // alpha is 1.
  uniforms.uBaseAlpha = { value: 1 };
  var baseMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    uniforms: {
      uBase:      uniforms.uBase,
      uBaseTo:    uniforms.uBaseTo,
      uWipeY:     uniforms.uWipeY,
      uRes:       uniforms.uRes,
      uBaseAlpha: uniforms.uBaseAlpha,
    },
    vertexShader: planeVertex,
    fragmentShader: [
      "uniform vec3  uBase;",
      "uniform vec3  uBaseTo;",
      "uniform float uWipeY;",
      "uniform vec2  uRes;",
      "uniform float uBaseAlpha;",
      "varying vec2 vUv;",
      "void main(){",
      "  float wipe = step(gl_FragCoord.y / uRes.y, uWipeY);",
      "  gl_FragColor = vec4(mix(uBase, uBaseTo, wipe), uBaseAlpha);",
      "}",
    ].join("\n"),
  });
  var basePlane = new THREE.Mesh(backdropGeo, baseMat);
  basePlane.position.set(0, 0, -12.5);
  basePlane.renderOrder = -20;
  camera.add(basePlane);

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

  // Tall enough that the plane's bottom edge NEVER enters the frustum — at
  // 28x18 the edge crossed the bottom of the frame and read as a crisp
  // "gradient bar" across the page bottom.
  var shaftGeo = new THREE.PlaneGeometry(28, 34, 1, 1);
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
  var BASE_MOTE_SIZE = 38.0;
  // Red mote is a solid red disc 2.2x base size, clearly larger than the rest.
  var RED_MOTE_SIZE  = 82.0;

  var positions   = new Float32Array(PARTICLE_POOL * 3);
  var swayPhase   = new Float32Array(PARTICLE_POOL);
  var swayRate    = new Float32Array(PARTICLE_POOL);
  var fallSpeed   = new Float32Array(PARTICLE_POOL);
  var thresholds  = new Float32Array(PARTICLE_POOL);
  var alphas      = new Float32Array(PARTICLE_POOL);
  var isRedMote   = new Float32Array(PARTICLE_POOL);
  var sizes       = new Float32Array(PARTICLE_POOL);
  // The teaser begins in a low forest-floor layer. starFieldHome preserves
  // the original full-volume coordinates so the closing can return to that
  // field before the existing convergence completes the journey.
  var starFieldHome = new Float32Array(PARTICLE_POOL * 3);
  var closingFieldHome = new Float32Array(PARTICLE_POOL * 3);
  var groundFieldHome = new Float32Array(PARTICLE_POOL * 3);
  var statGridHome = new Float32Array(PARTICLE_POOL * 3);
  var statAssemblyDelay = new Float32Array(PARTICLE_POOL);
  var statArcX = new Float32Array(PARTICLE_POOL);
  var statArcY = new Float32Array(PARTICLE_POOL);
  var statSlotByMote = new Int16Array(PARTICLE_POOL);
  var statRank = new Float32Array(PARTICLE_POOL);
  statSlotByMote.fill(-1);
  var openFieldP = 0;
  var statFormP = 0;
  var statFillP = 0;

  // Horizontal field is scaled to the viewport aspect so the network stays
  // within screen bounds on ANY device. The camera's vertical FOV is constant,
  // so the visible horizontal extent tracks aspect: narrow portrait -> narrow
  // field, wide desktop -> wider. z is kept in front of the landed camera so
  // no dot ends up too close / behind it.
  var viewAspect = window.innerWidth / Math.max(1, window.innerHeight);
  var FIELD_HALF_X = Math.max(2.2, Math.min(6.5, 4.2 * viewAspect));
  // Build the open volume through the camera used around section 02. This
  // removes the fixed world-space Y ceiling that projected every mote into the
  // upper part of the viewport. The Y samples are stratified across and just
  // beyond the frame, while varied ray distance preserves real 3D depth.
  var openFieldCamera = new THREE.PerspectiveCamera(55, viewAspect, 0.1, 200);
  var openCameraProgress = 0.40;
  openFieldCamera.position.set(
    lerp(CAM_START.x, CAM_END.x, openCameraProgress),
    lerp(CAM_START.y, CAM_END.y, openCameraProgress),
    lerp(CAM_START.z, CAM_END.z, openCameraProgress)
  );
  openFieldCamera.lookAt(0, lerp(-1.0, -1.5, openCameraProgress), 0);
  openFieldCamera.updateProjectionMatrix();
  openFieldCamera.updateMatrixWorld(true);
  // The LANDED (closing) camera pose — (CAM_END) gazing down to y=-1.5. The
  // closing field is distributed through THIS camera in screen space (below),
  // exactly like the 02 starfield, so it fills the frame top-to-bottom instead
  // of clumping low (a uniform WORLD volume reads bottom-heavy through a
  // down-tilted camera because the near-ground fills more of the frame).
  var closingCamera = new THREE.PerspectiveCamera(55, viewAspect, 0.1, 200);
  closingCamera.position.set(CAM_END.x, CAM_END.y, CAM_END.z);
  closingCamera.lookAt(0, -1.5, 0);
  closingCamera.updateProjectionMatrix();
  closingCamera.updateMatrixWorld(true);
  var closeProbe = new THREE.Vector3();
  var closeDir = new THREE.Vector3();
  var openProbe = new THREE.Vector3();
  var openDirection = new THREE.Vector3();
  // Per-mote ray samples are KEPT so the homes can be re-projected through
  // the LIVE camera during dispersal (see rebuildStarFieldHomes) — a one-time
  // snapshot through a frozen camera was the ping-pong: motes flew to points
  // that projected low, then "rose" as the live dolly caught up.
  var openScreenXs = new Float32Array(PARTICLE_POOL);
  var openScreenYs = new Float32Array(PARTICLE_POOL);
  var openDists = new Float32Array(PARTICLE_POOL);
  for (var i = 0; i < PARTICLE_POOL; i++) {
    var openScreenX = (Math.random() - 0.5) * 2.5;
    // RANDOM screen Y, not index-stratified: the cascade children are index
    // neighbours of the seed, and stratifying y by index parked every
    // connected mote at the same height — the ugly horizontal band of lines.
    // R7: sample the VISIBLE band evenly (NDC y beyond ~±1 is off-frame, so the
    // old -1.25..1.25 wasted ~10% of motes below the bottom edge and read as
    // bottom-clustered). -1.0..1.15 fills the frame top-to-bottom, slight upward
    // bias against the downward camera tilt at the 02 release.
    var openScreenY = -1.0 + 2.15 * Math.random();
    // Piet: we must be INSIDE the 02 mote field, not looking at it from afar.
    // Ray distances start right at the camera (big near motes sweeping past as
    // the dolly moves through) and run deep for real depth.
    var openDistance = 1.3 + Math.random() * 8.7;
    openScreenXs[i] = openScreenX;
    openScreenYs[i] = openScreenY;
    openDists[i] = openDistance;
    if (i === 0) {
      // Seed's 02 station: a fixed CAMERA-RELATIVE spot near the top so it
      // rides the view like the rest of the cloud (no world-space up-travel).
      openScreenXs[0] = 0.28;
      openScreenYs[0] = 0.55;
      openDists[0] = 4.0;
    }
    openProbe.set(openScreenX, openScreenY, 0.35).unproject(openFieldCamera);
    openDirection.copy(openProbe).sub(openFieldCamera.position).normalize();
    var fieldX = openFieldCamera.position.x + openDirection.x * openDistance;
    var fieldY = openFieldCamera.position.y + openDirection.y * openDistance;
    var fieldZ = openFieldCamera.position.z + openDirection.z * openDistance;
    starFieldHome[i * 3]     = fieldX;
    starFieldHome[i * 3 + 1] = fieldY;
    starFieldHome[i * 3 + 2] = fieldZ;
    closingFieldHome[i * 3]     = fieldX;
    closingFieldHome[i * 3 + 1] = fieldY;
    closingFieldHome[i * 3 + 2] = fieldZ;
    // A shallow, full-width forest-floor band. It extends beyond both frame
    // edges, occupies only the bottom eighth, and has very little z-depth.
    var bandT = (i + 0.5) / PARTICLE_POOL;
    var bandProbe = new THREE.Vector3((bandT * 2 - 1) * 1.16, -0.68 - Math.random() * 0.31, 0.35).unproject(camera);
    var bandDir = bandProbe.sub(camera.position).normalize();
    groundFieldHome[i * 3]     = camera.position.x + bandDir.x * 7.2;
    groundFieldHome[i * 3 + 1] = camera.position.y + bandDir.y * 7.2;
    groundFieldHome[i * 3 + 2] = camera.position.z + bandDir.z * 7.2;
    positions[i * 3]     = groundFieldHome[i * 3];
    positions[i * 3 + 1] = groundFieldHome[i * 3 + 1];
    positions[i * 3 + 2] = groundFieldHome[i * 3 + 2];
    swayPhase[i] = Math.random() * Math.PI * 2;
    swayRate[i]  = 0.2 + Math.random() * 0.35;
    fallSpeed[i] = 0.06 + Math.random() * 0.10;
    thresholds[i] = 0.0;
    alphas[i] = 0;
    isRedMote[i] = 0;
    sizes[i] = BASE_MOTE_SIZE;
    // Near-zero minimum: motes start rising the moment assembly begins
    // (Piet: populate as soon as the hero text starts disassembling).
    statAssemblyDelay[i] = 0.05 + Math.random() * 0.60;
    // Tighter assembly arc: the wide overshoot flung motes left across the 01
    // headline mid-formation. Keep the swirl subtle so the grid resolves inside
    // its own column and never crosses into the "So 19th Century" line.
    statArcX[i] = (Math.random() - 0.5) * 0.6;
    statArcY[i] = (Math.random() - 0.5) * 0.5;
  }
  // The closing is an inhabited mote volume, not a distant starfield. Keep a
  // restrained set inside the camera frustum and physically send the rest
  // outside it. No particle is hidden with opacity.
  // Claude fork: the closing should feel like a mote-field cloud we are INSIDE,
  // not a distant night sky. Keep most of the pool visible, spread it wider,
  // and bring depth CLOSE to the camera (some motes in front of the focal
  // plane) so it envelops the viewer. Only a thin remainder drifts to the far
  // ring for depth.
  var CLOSING_VISIBLE_MOTES = Math.round(PARTICLE_POOL * 0.62);
  for (var ci = 2; ci < PARTICLE_POOL; ci++) {
    if (ci < CLOSING_VISIBLE_MOTES + 2) {
      // Completely INSIDE the mote field at the close, and EVEN top-to-bottom:
      // pick a screen point (NDC) filling the frame and cast a ray of varied
      // depth through the landed camera. Even screen coverage (not even WORLD
      // coverage) is what reads as balanced; the varied ray distance keeps near
      // motes huge and far ones deep, so the volume still surrounds the viewer.
      var cScreenX = (Math.random() - 0.5) * 3.0;   // WIDER than the frame: much falls off-screen (sparser, less busy)
      var cScreenY = -1.35 + 2.7 * Math.random();   // symmetric top-to-bottom, past both edges
      var cDist = 1.4 + Math.random() * 8.6;         // right at the camera -> deep
      closeProbe.set(cScreenX, cScreenY, 0.35).unproject(closingCamera);
      closeDir.copy(closeProbe).sub(closingCamera.position).normalize();
      closingFieldHome[ci * 3]     = closingCamera.position.x + closeDir.x * cDist;
      closingFieldHome[ci * 3 + 1] = closingCamera.position.y + closeDir.y * cDist;
      closingFieldHome[ci * 3 + 2] = closingCamera.position.z + closeDir.z * cDist;
    } else {
      var closingAngle = Math.random() * Math.PI * 2;
      var closingRadius = 8 + Math.random() * 9;
      closingFieldHome[ci * 3]     = Math.cos(closingAngle) * closingRadius;
      closingFieldHome[ci * 3 + 1] = Math.sin(closingAngle) * closingRadius * 0.75;
      closingFieldHome[ci * 3 + 2] = -3.0 + Math.random() * 3.0;
    }
  }
  // Every ordinary field mote forms the exact original 10x10 statistic.
  // Multiple motes occupy each cell exactly; none are hidden or faded to fake
  // a smaller pool. The two narrative endpoints stay separate.
  var statOrder = [];
  for (var ss = 0; ss < 100; ss++) statOrder.push(ss);
  statOrder.sort(function (a, b) {
    return Math.hypot(a % 10 - 5, Math.floor(a / 10) - 5) - Math.hypot(b % 10 - 5, Math.floor(b / 10) - 5);
  });
  var rankBySlot = new Float32Array(100);
  for (var sr = 0; sr < 100; sr++) rankBySlot[statOrder[sr]] = sr / 99;
  var overlapX = [0, 0, 0, 0];
  var overlapY = [0, 0, 0, 0];
  for (var moteIndex = 2; moteIndex < PARTICLE_POOL; moteIndex++) {
    var ordinal = moteIndex - 2;
    var slot = (ordinal + 55) % 100;
    var overlap = Math.floor(ordinal / 100) % 4;
    statSlotByMote[moteIndex] = slot;
    statRank[moteIndex] = rankBySlot[slot];
    var col = slot % 10;
    var row = Math.floor(slot / 10);
    statGridHome[moteIndex * 3] = 0.8 + col * 0.34 + overlapX[overlap];
    statGridHome[moteIndex * 3 + 1] = 1.2 - row * 0.34 + overlapY[overlap];
    statGridHome[moteIndex * 3 + 2] = 0.0;
  }
  // Claude fork: the cascade SEED IS the grid's centre red cell — the single
  // measured "1%" tree. Index 0 takes the centre slot (55) and joins the grid,
  // so the network fans out FROM the centre red dot instead of a stray mote
  // parked at the top of the screen. Index 2 loses its separate red so there is
  // ONE red dot at centre, not two.
  isRedMote[2] = 0.0;               // was the duplicate centre red — now a normal grid dot
  isRedMote[0]   = 1.0;             // the seed = the measured centre cell
  sizes[0]       = RED_MOTE_SIZE;
  fallSpeed[0]   = 0.025;
  swayRate[0]    = 0.10;
  thresholds[0]  = 0.0;
  statSlotByMote[0] = 55;           // centre cell (col 5, row 5)
  statRank[0]       = rankBySlot[55];
  statGridHome[0]   = 0.8 + 5 * 0.34;   // fallback centre coords (DOM-anchored each frame)
  statGridHome[1]   = 1.2 - 5 * 0.34;
  statGridHome[2]   = 0.0;
  // The seed lives in the low central field before the grid forms, flies to
  // the grid centre with the rest, then — as the grid releases into the open
  // cloud — it stays AMONG the grouping (Piet: it must remain part of the 02
  // field, mid-frame, mid-depth) and only leaves UP and OFF the top as the
  // trees arrive (see the treeFormP rise in the position loop). One red on
  // screen at a time: grid-centre red in 01, seed riding the cloud in 02,
  // the convergence red alone at the close.
  groundFieldHome[0] = 0.0;
  groundFieldHome[1] = -0.55;
  groundFieldHome[2] = 0.4;
  starFieldHome[0] = 0.35;
  starFieldHome[1] = 1.5;   // high in the cloud, near the top — short exit at trees
  starFieldHome[2] = 1.4;
  // The seed used to seat at the grid centre FIRST with no delay and no swirl,
  // so the grid assembled around it. That is exactly what made it read as a
  // lone red dot hanging in mid-air ahead of the field (Piet). It now keeps the
  // ordinary randomised statAssemblyDelay / statArc handed out in the main
  // loop above, so it rises in the middle of the pack and simply happens to be
  // the red one. Do not re-pin it here.
  //
  // Its floor home has to be reassigned though. The ground band spreads motes
  // across the frame by INDEX — bandT = (i + 0.5) / PARTICLE_POOL — so index 0
  // samples NDC x = -1.16, which is off the left edge of the screen. Putting
  // the seed "in the floor array" with that home would have parked it out of
  // frame. Resample it just left of centre, mid-band, so it sits among the
  // motes you can actually see.
  var seedBandProbe = new THREE.Vector3(-0.12, -0.84, 0.35).unproject(camera);
  var seedBandDir = seedBandProbe.sub(camera.position).normalize();
  groundFieldHome[0] = camera.position.x + seedBandDir.x * 7.2;
  groundFieldHome[1] = camera.position.y + seedBandDir.y * 7.2;
  groundFieldHome[2] = camera.position.z + seedBandDir.z * 7.2;
  positions[0] = groundFieldHome[0];
  positions[1] = groundFieldHome[1];
  positions[2] = groundFieldHome[2];

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
  partGeo.setAttribute("aStatRank", new THREE.BufferAttribute(statRank, 1));
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
    "attribute float aStatRank;",
    "uniform float uPixelRatio;",
    "uniform float uTime;",
    "uniform float uPointScale;",
    "varying float vAlpha;",
    "varying float vRed;",
    "varying float vGlow;",
    "varying float vTreeTint;",
    "varying float vStatRank;",
    "void main(){",
    "  vAlpha = aAlpha;",
    "  vRed   = aRed;",
    "  vTreeTint = aTreeTint;",
    "  vStatRank = aStatRank;",
    "  // seed mote pulses subtly (sin time on a 2.4s period)",
    "  float seedPulse = aRed * step(70.0, aSize) * (0.65 + 0.35 * (0.5 + 0.5 * sin(uTime * 2.618)));",
    "  vGlow  = max(aGlow, seedPulse);",
    "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
    "  // halo motes get a slightly larger point so the glow ring renders",
    "  float sizeBoost = 1.0 + vGlow * 0.6;",
    "  gl_PointSize = aSize * sizeBoost * uPointScale * uPixelRatio * (1.0 / -mv.z);",
    "  gl_PointSize = clamp(gl_PointSize, 2.0, 64.0);",
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
    "varying float vStatRank;",
    "uniform vec3  uColor;",
    "uniform vec3  uAccent;",
    "uniform float uTreeForm;",
    "uniform float uStatForm;",
    "uniform float uStatFill;",
    "uniform vec3 uStatMuted;",
    "uniform float uDim;",
    "void main(){",
    "  vec2 c = gl_PointCoord - vec2(0.5);",
    "  float d = length(c);",
    "  // Hard-edged solid disc with 1px AA. Same for red and gray motes.",
    "  float aa = smoothstep(0.50, 0.47, d);",
    "  if (aa <= 0.0 && vGlow <= 0.01) discard;",
    "  float statOn = step(vStatRank, uStatFill);",
    "  // Claude fork: measured stat motes turn RED, unmeasured stay BLACK, so the",
    "  // <1% grid reads black field -> one red centre -> all red as it fills.",
    "  vec3 statCol = mix(uColor, uAccent, statOn);",
    "  vec3 col = mix(mix(uColor, statCol, uStatForm), uAccent, vRed);",
    "  col = mix(col, uAccent, vGlow * 0.8);",
    "  // Grove height gradient: base mote color -> accent up the canopy.",
    "  col = mix(col, uAccent, clamp(vTreeTint * uTreeForm, 0.0, 1.0));",
    "  // NO glow rings — Piet: never any red rings except the closing pulse",
    "  // wave. vGlow still tints the dot itself red on contact (color mix",
    "  // above), but renders no halo. This also stops the invisible",
    "  // convergence dot (alpha 0, permanent pulse) leaking a floating ring.",
    "  // Piet: loose BACKGROUND motes sit back at uDim; motes that have become",
    "  // content (the <1% grid, the grove) come back to full strength.",
    "  // vRed is exempt: the red mesh SHARES this material's uniforms, so",
    "  // without it the terminal red dot (index 1) — which the closing code",
    "  // deliberately leaves at full while every other mote settles to 25% —",
    "  // came out half strength and blotchy.",
    "  float dim = mix(uDim, 1.0, max(max(uTreeForm, uStatForm), vRed));",
    "  float alpha = vAlpha * aa * dim;",
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
      uPointScale:  { value: 0.78 },
      uTreeForm:    { value: 0 },
      uStatForm:    { value: 0 },
      uStatFill:    { value: 0 },
      uStatMuted:   { value: readCssColor("--ink-soft") },
      // Background mote strength. Piet (teaser): the loose field sits back at
      // 50% so the copy reads; grid/grove motes are exempt (see fragment).
      uDim:         { value: 0.5 },
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
  redGeo.setAttribute("aStatRank", partGeo.attributes.aStatRank);
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
  // Claude fork: the teaser has 4 sections, not the index's 6, and Piet wants a
  // RESTRAINED network — about 25 lines total, drawn continuously across the
  // whole journey (see setProgress, which drives each wave over a broad global
  // scroll band). Three cascade waves fan 4 → 8 → 8 = 20 lines; the convergence
  // adds ~5 feeders → ~25 total. Waves are no longer tied to panel transitions.
  var WAVE_BANDS = [
    { wave: 1, start: 0.00, end: 0.34, fanout: 4 },   // seed fans 4
    { wave: 2, start: 0.22, end: 0.56, fanout: 2 },   // each of 4 fans 2  (+8)
    { wave: 3, start: 0.46, end: 0.80, fanout: 1 },   // each of 8 fans 1  (+8)
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
    // Thresholds are NORMALIZED to the wave's own 0..1 progress (they used to
    // be built in old global-band units 0.0-0.8, which — with drawDuration
    // 1.0 — meant most edges could mathematically NEVER finish drawing:
    // permanent mid-line arrowheads, "pathetic" draws. Now every edge starts
    // inside the first 0.2 of its wave and completes by wave progress 1.0
    // (0.2 window + 0.8 drawDuration).
    var THRESHOLD_WINDOW = 0.2;
    var parentSpan = Math.max(0.001, THRESHOLD_WINDOW - band.fanout * SIBLING_STAGGER);
    for (var fi = 0; fi < frontier.length; fi++) {
      var parent = frontier[fi];
      var parentStart = frontier.length <= 1
        ? 0
        : parentSpan * (fi / (frontier.length - 1));
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
  // The camera ends at (0, 0.5, 3) looking at (0, -1.5, 0); a dot AT the lookAt
  // projects to the exact middle of the viewport. We seat it a touch BELOW that
  // (y = -1.9) so it lands in the open space between the closing actions row and
  // the footer, reading as centred in that gap rather than the whole viewport.
  var FINAL_RED_X = 0.0;
  var FINAL_RED_Y = -1.9;
  var FINAL_RED_Z = 0.0;
  positions[FINAL_RED_IDX * 3]     = FINAL_RED_X;
  positions[FINAL_RED_IDX * 3 + 1] = FINAL_RED_Y;
  positions[FINAL_RED_IDX * 3 + 2] = FINAL_RED_Z;
  connectedSet[FINAL_RED_IDX] = 1;

  // Terminal dots are the last frontier we computed (wave-5 children).
  // A restrained sample draws to the final red dot so the closing remains a
  // legible constellation rather than a screen of spokes.
  var fullTerminalDots = frontier;             // length up to 8 now
  var terminalDots = [];
  // Piet: the finale must be UNMISSABLE — at least 25 lines drawing into the
  // final red dot from all around, with the viewer inside the mote field.
  // Every real terminal feeds it, topped up with ordinary field motes.
  var desiredFeeders = 25;
  for (var td = 0; td < fullTerminalDots.length && terminalDots.length < desiredFeeders; td++) {
    terminalDots.push(fullTerminalDots[td]);
  }
  for (var tf = 2; tf < PARTICLE_POOL && terminalDots.length < desiredFeeders; tf++) {
    if (terminalDots.indexOf(tf) === -1) terminalDots.push(tf);
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
  // Feeders on a BIG Fibonacci sphere around the final dot — above, below,
  // beside, behind, and toward the camera, far out — so the convergence reads
  // as the whole inhabited field draining into one point from every direction
  // in X, Y and Z, not a small flat ring.
  var convRBase = 5.2;
  for (var tr = 0; tr < terminalDots.length; tr++) {
    var tIdx = terminalDots[tr];
    var fu = (tr + 0.5) / Math.max(1, terminalDots.length);
    var fy = 1 - 2 * fu;
    var frr = Math.sqrt(Math.max(0, 1 - fy * fy));
    var fphi = tr * 2.39996323;                      // golden angle
    var convR = convRBase * (0.7 + 0.6 * (((tr * 13) % 7) / 6));
    positions[tIdx * 3]     = FINAL_RED_X + Math.cos(fphi) * frr * convR * 1.25;
    positions[tIdx * 3 + 1] = FINAL_RED_Y + fy * convR * 0.85;
    positions[tIdx * 3 + 2] = Math.min(2.6, FINAL_RED_Z + Math.sin(fphi) * frr * convR);
    // These exact on-screen feeder positions are also their final star targets.
    // The later field expansion must not overwrite them with off-screen random
    // points and recreate the long lines seen in the failed closing frames.
    closingFieldHome[tIdx * 3]     = positions[tIdx * 3];
    closingFieldHome[tIdx * 3 + 1] = positions[tIdx * 3 + 1];
    closingFieldHome[tIdx * 3 + 2] = positions[tIdx * 3 + 2];
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
  // WHY THE CLOSING SHOWED ARROWHEADS AND NO LINES ON PHONES.
  // lineVerts is all zeros when lineGeo is built — the real endpoints are
  // written every frame by updateEdgePositionsAnimated. So THREE computes this
  // geometry's bounding sphere ONCE, from those zeros: a zero-radius point at
  // the world origin, and it never recomputes. Every frame after that, the
  // frustum test asks whether the origin is visible, not whether the network
  // is. On desktop the origin stays inside the wide frustum and the object
  // survives by luck. A portrait phone has camera.aspect ~0.46, so the frustum
  // is far narrower horizontally, and by the closing the camera has dollied
  // and tilted off the origin — the test fails and THREE culls the ENTIRE
  // LineSegments object. The arrowheads ride the same endpoints and the same
  // alpha gate, which is why they kept drawing: drawingArrows already sets
  // frustumCulled = false. So does every other object here that is written per
  // frame (redParticles, shockwave, clickShockwave, fillPoints). This one was
  // the omission.
  // NOTE: `particles` (the main mote field, added ~line 693) has the same
  // omission and is only saved by its initial positions being spread wide
  // enough to give it a big bounding sphere. Left alone because it demonstrably
  // works, but it is the same latent bug.
  lineSegments.frustumCulled = false;
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
    // Piet: NO lines between motes anywhere until the very last screen. The
    // cascade web used to run from 01 onward and merely taper faint through the
    // grove and the finale; now it is gated to exactly the same closing window
    // as the convergence wave, so 00-03 are motes only and the whole network —
    // cascade and convergence together — arrives with the closing.
    // The strokes still ADVANCE on their own waves behind the gate, so by the
    // time it opens the web is already drawn and simply comes up, rather than
    // scribbling itself in over the finale.
    // The CASCADE (waves 1-6) never draws. It is a branching tree, so its
    // segments share motes and meet at angles — which is what read as bent,
    // wonky lines in among the convergence. Only wave 7, the straight feeder
    // lines into the terminal red dot, is ever visible.
    // The cascade is still BUILT: it is what chooses the terminal dots and
    // their positions. It is only its rendering that is off.
    var networkTaper = 0.0;
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
      var drawDuration = wave === 7 ? 0.93 : 0.8;

      // strokeProgress follows the real DOM trigger for its wave, not a
      // guessed global scroll band. This keeps convergence out of Panel 5.
      var strokeProgress = Math.max(0, Math.min(1, (waveP - threshold) / drawDuration));
      if (strokeProgress > 0.001) {
        activeLineSet[aIdx] = 1;
      }
      if (strokeProgress >= 0.999) {
        activeLineSet[bIdx] = 1;
      }

      // Contact spark: fire only when the line reaches the target mote AND the
      // network is actually on screen. The strokes keep advancing behind the
      // gate through 00-03 so the web is already drawn when the closing opens
      // it — but that meant every landing still lit its target mote, so motes
      // were pulsing with nothing connecting them (Piet). The convergence wave
      // draws during the closing with the gate already open, so the finale
      // keeps its contact sparks.
      // Gated on the CONVERGENCE now that networkTaper is hard 0 — otherwise
      // killing the cascade's rendering would also have killed wave 7's
      // landing sparks on the red dot.
      var contactGate = wave === 7 ? smoothstep(0.72, 1.0, finalFieldP) : 0.0;
      var prev = edgePrevStroke[n];
      if (prev < 0.999 && strokeProgress >= 0.999 && contactGate > 0.01) {
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
      // Claude fork: cascade lines PERSIST through the stat grid and the tree
      // grove (no statForm/openField gating) but TAPER faint once the trees
      // and closing form (networkTaper above). Only the convergence wave stays
      // gated to the closing so it lands with the finale.
      arrowVisible *= (wave === 7 ? smoothstep(0.72, 1.0, finalFieldP) : networkTaper);
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
      var journeyGate = wave === 7 ? smoothstep(0.72, 1.0, finalFieldP) : networkTaper;
      var visible = strokeProgress > 0.001 ? journeyGate : 0.0;
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
      renderer.setClearColor(bgColor, clearAlpha);
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
    // Drawing-buffer pixels — gl_FragCoord is in that space, not CSS px.
    var dpr = renderer.getPixelRatio();
    uniforms.uRes.value.set(w * dpr, h * dpr);
  }
  window.addEventListener("resize", onResize);
  onResize();

  // ---- Visibility ------------------------------------------------------
  var visible = !document.hidden;
  var lastVisVW = window.innerWidth, lastVisVH = window.innerHeight;
  document.addEventListener("visibilitychange", function () {
    visible = !document.hidden;
    // Returning from a backgrounded tab / woken screen: ONLY re-sync if the
    // viewport actually changed while we were hidden. A plain tab-switch with
    // no resize must NOT call ScrollTrigger.refresh() — refresh re-snaps the
    // scrubbed closing field to the settled scroll position, which makes the
    // motes visibly POP to a new layout (Piet's nav-away/back glitch). The
    // resize re-sync (black bar / broken scroll) is only needed on real size
    // changes, so gate it on the dimensions.
    if (visible) {
      setTimeout(function () {
        if (window.innerWidth === lastVisVW && window.innerHeight === lastVisVH) return;
        lastVisVW = window.innerWidth;
        lastVisVH = window.innerHeight;
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
  var statProbe = new THREE.Vector3();
  var statDirection = new THREE.Vector3();
  var statWorld = new THREE.Vector3();
  function statScreenToWorld(px, py, zPlane) {
    statProbe.set(px / window.innerWidth * 2 - 1, 1 - py / window.innerHeight * 2, .5).unproject(camera);
    statDirection.copy(statProbe).sub(camera.position).normalize();
    var distance = (zPlane - camera.position.z) / statDirection.z;
    return statWorld.copy(camera.position).addScaledVector(statDirection, distance);
  }
  // MECHANISM fix for the down-then-up dispersal (Piet, round 5): while the
  // grid release is in flight, re-project every mote's 02 home through the
  // LIVE camera each frame. The spread becomes one outward motion that ends
  // exactly where the camera actually is — no frozen-snapshot correction. At
  // openFieldP = 1 the homes freeze into world space, so remaining movement
  // through 02 is plain dolly parallax. Fully reversible: scrolling back re-
  // enters the band and re-projects again. Skips 0 (seed station) and 1
  // (convergence dot).
  var statDotWorldSize = 76;
  var statBoxSizePx = 0;
  var statViewProbe = new THREE.Vector3();
  function rebuildStarFieldHomes() {
    for (var i = 0; i < PARTICLE_POOL; i++) {
      if (i === 1) continue;                     // convergence dot: not in the cloud
      openProbe.set(openScreenXs[i], openScreenYs[i], 0.35).unproject(camera);
      openDirection.copy(openProbe).sub(camera.position).normalize();
      starFieldHome[i * 3]     = camera.position.x + openDirection.x * openDists[i];
      starFieldHome[i * 3 + 1] = camera.position.y + openDirection.y * openDists[i];
      starFieldHome[i * 3 + 2] = camera.position.z + openDirection.z * openDists[i];
    }
  }

  function updateStatGridTargets() {
    // Runs EVERY frame (not just while the grid forms): the seed is pinned to
    // the DOM-anchored grid-centre cell from the very first frame, so its
    // home must be valid before statFormP ever rises.
    // Anchor to the reserved (visibility:hidden) #statGrid box so the grid sits
    // in its own column slot; flex keeps the readout to its right. Falls back to
    // the readout's left edge if the box hasn't been laid out.
    var box = document.getElementById("statGrid");
    var panel = document.getElementById("problem");
    // Match the original dark version's read: BIG dots, near-touching pitch
    // (diameter ~85% of cell pitch) so the 10x10 is one confident block.
    var dotPx = Math.max(13, Math.min(19, window.innerWidth * .014));
    var stepPx = dotPx * 1.12;
    // Reserve the grid's TRUE footprint in the DOM so the copy below sits
    // clear of the last row instead of crowding it.
    var gridPx = Math.round(stepPx * 9 + dotPx + 44);
    if (box && statBoxSizePx !== gridPx) {
      box.style.width = gridPx + "px";
      box.style.height = gridPx + "px";
      statBoxSizePx = gridPx;
    }
    // aSize is computed AFTER the grid centre is known (below) from the TRUE
    // view-space depth of the grid plane. Round 6 used camera.position.z, which
    // ignores the camera tilt, so the disc oversized past the pitch and the
    // 10x10 fused into overlapping blobs.
    var statScale = lerp(0.82, 0.76, statFormP);
    var centerX, centerY;
    var boxRect = box && box.getBoundingClientRect();
    if (boxRect && boxRect.width > 1 && panel) {
      // PIN-RELATIVE anchor (Piet): the grid's home is where the box sits
      // when 01 is PINNED (panel top at viewport top) — the exact same
      // screen spot from the very first frame to the last. The grid, and
      // the seed at its centre, NEVER ride the page in either direction.
      var panelTop = panel.getBoundingClientRect().top;
      centerX = boxRect.left + boxRect.width / 2;
      centerY = (boxRect.top - panelTop) + boxRect.height / 2;
    } else {
      var read = document.querySelector("#problem .stat-read");
      if (!read) return;
      var rect = read.getBoundingClientRect();
      var gapPx = Math.max(20, Math.min(44, window.innerWidth * .026));
      centerX = rect.left - gapPx - (dotPx * 10 + 36) / 2;
      centerY = rect.top + rect.height / 2;
    }
    // R4: land the rendered disc at a CLEAN fraction of the layout pitch so the
    // 10x10 reads as distinct dots (the dark original), not a blob. The shader's
    // size model is aSize*uPointScale*uPixelRatio / (-mv.z), so a disc of
    // targetPx CSS px needs aSize = targetPx * (-mv.z) / uPointScale. uPointScale
    // == statScale during the grid; (-mv.z) is the grid centre's real view-space
    // depth (camera.z alone breaks under the tilt).
    var STAT_DOT_PITCH_RATIO = 0.82;
    var gridCentreWorld = statScreenToWorld(centerX, centerY, 0);
    statViewProbe.set(gridCentreWorld.x, gridCentreWorld.y, gridCentreWorld.z)
                 .applyMatrix4(camera.matrixWorldInverse);
    var statViewDepth = Math.max(0.1, -statViewProbe.z);
    statDotWorldSize = (stepPx * STAT_DOT_PITCH_RATIO) * statViewDepth / Math.max(0.1, statScale);
    for (var i = 0; i < PARTICLE_POOL; i++) {
      var slot = statSlotByMote[i];
      if (slot < 0) continue;                 // index 1 (convergence dot) is not in the grid
      var col = slot % 10;
      var row = Math.floor(slot / 10);
      var cluster = i < 2 ? 0 : Math.floor((i - 2) / 100) % 4;   // guard: no negative index for the seed
      var px = centerX + (col - 4.5) * stepPx + overlapX[cluster] * 32;
      var py = centerY + (row - 4.5) * stepPx + overlapY[cluster] * 32;
      var world = statScreenToWorld(px, py, 0);
      var i3 = i * 3;
      statGridHome[i3] = world.x;
      statGridHome[i3 + 1] = world.y;
      statGridHome[i3 + 2] = world.z;
    }
  }

  // R8: LINEAR dolly + tilt across the whole scroll, driven by absolute scroll
  // (uLayerTint). Runs at the TOP of each frame so the grid anchor and the
  // camera-relative star homes are built against the current camera — fully
  // deterministic on a nav jump (no stale-camera pop).
  function positionCamera(dt) {
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

    // Flattening IN (grove formation) and releasing OUT (grove dispersal) are
    // deliberately asymmetric. Formation keeps its quick [0.05, 0.25] band on
    // treeFormP so the camera is level before the trees assemble. Release used
    // to ride the same band in reverse, which meant it only began once
    // treeFormP had already fallen under 0.25 — the last quarter of the
    // dispersal — so the camera snapped back to the scripted tilt in a fraction
    // of the scroll the spread itself takes, and read as a bump (Piet). Drive
    // the release off finalFieldP across the WHOLE dispersal band instead:
    // starts sooner, finishes later, and moves with the downward spread rather
    // than against its tail.
    var flatTreeView = Math.min(
      smoothstep(0.05, 0.25, treeFormP),
      1 - smoothstep(0.0, 1.0, finalFieldP)
    );
    camera.position.x = dollyX + camParX;
    camera.position.y = lerp(dollyY + camParY, TREE_CAMERA_Y, flatTreeView);
    camera.position.z = dollyZ;
    // LINEAR camera tilt across the entire scroll, not eased to the end.
    // At scroll 0: gaze down into the low forest-floor mote layer.
    // At scroll 1: gaze ANGLED DOWN (lookAt y = -1.5).
    var lookY = lerp(lerp(-1.0, -1.5, dollyT), TREE_CAMERA_Y, flatTreeView);
    camera.lookAt(0, lookY, 0);
  }

  function animate() {
    if (visible) {
      var elapsed = clock.getElapsedTime();
      var dt = Math.min(0.05, Math.max(0, elapsed - lastElapsed));
      lastElapsed = elapsed;
      uniforms.uTime.value = elapsed;

      // R8: position the camera FIRST, from absolute scroll (uLayerTint), so the
      // grid anchor and the camera-relative star homes below are built against
      // THIS frame's camera. Round 6 positioned the camera at the END of the
      // frame, so updateStatGridTargets/rebuildStarFieldHomes used the PREVIOUS
      // frame's camera — on a nav jump that stale camera flung the homes to
      // off-screen points for a frame (the pop-then-settle). Now deterministic.
      positionCamera(dt);

      // The opening mote ground is spatially driven by scroll, not time. This
      // makes every position fully reversible when scroll direction changes.
      var density = uniforms.uMoteDensity.value;
      partMat.uniforms.uStatForm.value = statFormP;
      partMat.uniforms.uStatFill.value = statFillP;
      updateStatGridTargets();
      // ALWAYS camera-relative while released (Piet: the cloud must never
      // travel up as the dolly descends — and never pop when nav-jumping
      // back). The cloud is rigidly attached to the live camera; the only
      // on-screen motion is the spread itself.
      if (openFieldP > 0) rebuildStarFieldHomes();
      var statSizeDirty = false;
      for (var i = 0; i < PARTICLE_POOL; i++) {
        var xi = i * 3;
        var yi = i * 3 + 1;
        // Index 1 is reserved for the closing convergence point. Keep it out
        // of the opening and middle sections; the final line pass reveals it.
        if (i === 1) {
          alphas[i] = smoothstep(0.45, 0.72, waveProgress[7] || 0);
          continue;
        }
        if (i === 0) {
          // Piet: across 00 -> 01 the seed STARTS IN THE FLOOR ARRAY and rises
          // into its centre cell with everything else — it is no longer pinned
          // to the grid centre from the first frame. It keeps
          // statAssemblyDelay[0] = 0 and zero arc, so it still leads the
          // assembly and arrives first, straight, and the grid still visibly
          // gathers around it. From the 01 leave onward its path is unchanged:
          // one glide to its station high in the 02 cloud, then out as the
          // trees form.
          if (openFieldP > 0) {
            positions[xi]     = lerp(statGridHome[0], starFieldHome[0], openFieldP);
            positions[yi]     = lerp(statGridHome[1], starFieldHome[1], openFieldP)
                              + smoothstep(0.0, 0.45, treeFormP) * 9.0;
            positions[xi + 2] = lerp(statGridHome[2], starFieldHome[2], openFieldP);
          } else {
            var seedPhase = density * Math.PI * 2;
            positions[xi]     = groundFieldHome[0] + Math.sin(seedPhase + swayPhase[0]) * density * 0.08;
            positions[yi]     = groundFieldHome[1] + Math.cos(seedPhase * 0.7 + swayPhase[0]) * density * 0.035;
            positions[xi + 2] = groundFieldHome[2] - density * 0.45;
            if (statFormP > 0) {
              // Identical to the ordinary grid path below, arc included, so the
              // seed cannot be picked out of the rising field by its motion.
              var seedMove = smoothstep(statAssemblyDelay[0], 1.0, statFormP);
              var seedArc = Math.sin(seedMove * Math.PI);
              positions[xi]     = lerp(positions[xi], statGridHome[0], seedMove) + statArcX[0] * seedArc;
              positions[yi]     = lerp(positions[yi], statGridHome[1], seedMove) + statArcY[0] * seedArc;
              positions[xi + 2] = lerp(positions[xi + 2], statGridHome[2], seedMove);
            }
          }
          alphas[i] = seedReveal;
          continue;
        }
        var scrollPhase = density * Math.PI * 2;
        var groundX = groundFieldHome[xi] + Math.sin(scrollPhase + swayPhase[i]) * density * 0.08;
        var groundY = groundFieldHome[yi] + Math.cos(scrollPhase * 0.7 + swayPhase[i]) * density * 0.035;
        var groundZ = groundFieldHome[xi + 2] - density * 0.45;
        positions[xi] = lerp(groundX, starFieldHome[xi], openFieldP);
        positions[yi] = lerp(groundY, starFieldHome[yi], openFieldP);
        positions[xi + 2] = lerp(groundZ, starFieldHome[xi + 2], openFieldP);
        var statSlot = statSlotByMote[i];
        if (statSlot >= 0) {
          if (openFieldP > 0) {
            // LEAVE (01 -> 02): glide the grid dot DIRECTLY to its 02 cloud
            // station (mirrors the seed at i=0), so the grid SPREADS in place.
            // The old path released the dot to the ground-based ambient home
            // first, so the whole grid sagged to the floor before rising —
            // Piet: "the mote field goes below instead of just spreading."
            positions[xi]     = lerp(statGridHome[xi], starFieldHome[xi], openFieldP);
            positions[yi]     = lerp(statGridHome[yi], starFieldHome[yi], openFieldP);
            positions[xi + 2] = lerp(statGridHome[xi + 2], starFieldHome[xi + 2], openFieldP);
          } else if (statFormP > 0) {
            // ENTRY / HOLD: ground -> grid assembly. Randomized late arrivals
            // prevent the grid from announcing itself too early; the same
            // per-mote delay and arc run backwards on upward scroll, so assembly
            // and disassembly stay exact physical inverses.
            var statMove = smoothstep(statAssemblyDelay[i], 1.0, statFormP);
            var statArc = Math.sin(statMove * Math.PI);
            positions[xi] = lerp(positions[xi], statGridHome[xi], statMove) + statArcX[i] * statArc;
            positions[yi] = lerp(positions[yi], statGridHome[yi], statMove) + statArcY[i] * statArc;
            positions[xi + 2] = lerp(positions[xi + 2], statGridHome[xi + 2], statMove);
          }
        }
        // Density gate. Red seed (i=0) is always on. Second red dot (i=1) is
        // hidden until the convergence wave begins at uConnect ~ 0.84.
        var gate = smoothstep(thresholds[i], thresholds[i] + 0.05, density);
        if (i === 0) {
          alphas[i] = seedReveal;
        } else if (i === 1) {
          // Final red dot is fixed at the floor. Always on — the camera
          // simply pans down to reveal it. No alpha gating.
          alphas[i] = 1.0;
        } else {
          // Ordinary field motes never fade during statistic assembly or
          // disassembly. Their positions and colors change, not their count.
          // Grid members go FULLY opaque as the stat forms (block contrast);
          // non-grid motes keep the ambient 0.9.
          alphas[i] = statSlot >= 0 ? lerp(0.9 * gate, 1.0, statFormP) : 0.9 * gate;
          var statSize = lerp(BASE_MOTE_SIZE, statDotWorldSize, statFormP);
          if (sizes[i] !== statSize) { sizes[i] = statSize; statSizeDirty = true; }
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
      if (statSizeDirty) partGeo.attributes.aSize.needsUpdate = true;
      // Final red dot is FIXED at (0, -2.5, 0) — set once at startup. The
      // camera tilts down to reveal it. NO position animation here.

      // Seed reveal: scale the first red dot from 0 -> full (RED_MOTE_SIZE).
      // aSize is shared with redGeo, so one needsUpdate refreshes both draws.
      // Seed grows from an ordinary floor mote to exactly one grid cell as the
      // grid forms, on the same lerp the other grid members use — it now
      // starts in the floor array, so arriving already cell-sized would have
      // made it the one oversized dot on the forest floor.
      var seedTargetSize = lerp(BASE_MOTE_SIZE, statDotWorldSize, statFormP) * seedReveal;
      if (sizes[0] !== seedTargetSize) {
        sizes[0] = seedTargetSize;
        partGeo.attributes.aSize.needsUpdate = true;
      }

      // Tree grove formation (index-pointcloud variant): repositions locked
      // motes and fades fill dots. Must run BEFORE the buffers upload and
      // before the lines read positions below.
      updateTreeFormation(elapsed);
      updateFinalField();
      // Preserve one point language without letting perspective turn the final
      // starfield into bubbles. Each stage uses the same motes at a controlled
      // optical scale.
      partMat.uniforms.uPointScale.value = lerp(
        lerp(0.82, 0.76, statFormP),
        lerp(0.82, 1.5, finalFieldP),    // GROW at the close so motes read near/chunky, not distant specks
        Math.max(treeFormP, finalFieldP)
      );

      partGeo.attributes.position.needsUpdate = true;
      partGeo.attributes.aAlpha.needsUpdate = true;
      partGeo.attributes.aGlow.needsUpdate = true;

      // Update line buffer (reads live positions for both endpoints).
      updateEdgePositionsAnimated(dt);

      // R8: camera dolly/tilt now runs in positionCamera(dt) at the TOP of the
      // frame (see the call above) so the grid + star homes use the current
      // camera. Nothing to do here.

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
  var TREE_MAX_HEIGHT = 4.05;   // preserve crowns and keep all trunks above the content strip
  var TREE_BASE_Y = -2.5;       // legacy forest floor (grove now centers on the text)
  var TREE_CENTER_OFFSET_Y = 0.32; // aligned bases sit above the compact audience strip
  var TREE_MOBILE_LIFT = 0.38;  // phones only — see baseY, lifts the grove out from behind 03
  var TREE_CZ = -1.5;
  var TREE_CAMERA_Y = 0.82;     // level side elevation, no upward or downward view
  var treeFormTarget = 0;       // driven by the DOM-anchored trigger (setTreeProgress)
  var treeFormP = 0;            // exact scroll-derived formation progress
  // Grove yaw: each of the three trees turns on ITS OWN vertical axis, at its
  // own rate and starting phase, so they read as three independent turntables
  // rather than one locked grove. Time-integrated, so they keep turning on a
  // paused scroll (the standalone tester's continuous orbit).
  var treeSpinAngle = [0, 0, 0]; // accumulated yaw per tree (rad), integrated per frame
  var treeMeans = null;          // the three cluster centre Xs (normalized), for DOM label anchoring
  var treeLabelVec = new THREE.Vector3();
  var treeSpinPrevT = 0;         // last elapsed sample, for the local dt
  var TREE_SPIN_BASE = 0.032;    // faster turntable motion (was 0.0175)
  var TREE_SPIN_RATE = [1.0, 1.34, 0.77]; // per-tree rate multipliers (desync)
  var TREE_SPIN_PHASE = [0.0, 2.1, 4.2];  // per-tree starting angle (rad)
  var treeSpinInit = false;      // seed the phases once
  var TREE_SPIN_BOOST = 0.0;
  var treeReady = false;
  var treeNorm = null;          // normalized grove coords (height 1, base 0, centered)
  var treeClusterCenter = null; // per-point centre of its tree, for in-place turntables
  var fillNorm = null;
  var fillClusterCenter = null;
  var assetHalfW = 0.7;         // measured from the asset at load
  var moteNormIdx = new Int32Array(PARTICLE_POOL);
  var moteTreeIdx = new Uint8Array(PARTICLE_POOL); // which of the 3 trees this mote joins
  var fillTreeIdx = null;                          // same, for the fill dots (sized at load)
  var moteCapture  = new Float32Array(PARTICLE_POOL * 3);
  var moteLocked   = new Uint8Array(PARTICLE_POOL);
  var moteFormSeed = new Float32Array(PARTICLE_POOL);
  var fillAlphaAttr = null, fillPosAttr = null;
  var fillSeedArr = null, fillStartArr = null;
  var fillCount = 0;
  var fillFinalCapture = null;
  var fillFinalLocked = false;
  var finalFieldTarget = 0;
  var finalFieldP = 0;
  var finalFieldCapture = new Float32Array(PARTICLE_POOL * 3);
  var finalFieldLocked = false;
  // Target height drives the reveal after the OBJ is assigned, so the exact
  // Point Cloud 3 grove forms from forest floor to canopy.
  for (var ms = 0; ms < PARTICLE_POOL; ms++) moteFormSeed[ms] = 0;

  function tClamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  // Centre the three-tree Point Cloud 3 grove across the viewport.
  var groveZoneL = 64, groveZoneR = 480;   // px fallbacks, remeasured below
  function measureGroveZone() {
    groveZoneL = window.innerWidth * 0.03;
    groveZoneR = window.innerWidth * 0.97;
  }
  measureGroveZone();
  window.addEventListener("resize", measureGroveZone);

  document.body.setAttribute("data-tree-pointcloud", "loading");
  fetch("assets/tree-pointcloud.obj?v=pc9")
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

      // Resolve the three tree centres from the actual OBJ x distribution.
      // Rotating every point around the entire grove made the trees orbit,
      // change scale, and drop through the content strip. Each tree now turns
      // slowly around its own trunk while its screen position stays fixed.
      var xSamples = new Array(treeCount);
      for (var xc = 0; xc < treeCount; xc++) xSamples[xc] = treeNorm[xc * 3];
      xSamples.sort(function (a, b) { return a - b; });
      var clusterMeans = [
        xSamples[Math.floor(treeCount / 6)],
        xSamples[Math.floor(treeCount / 2)],
        xSamples[Math.floor(treeCount * 5 / 6)]
      ];
      var clusterAssignment = new Uint8Array(treeCount);
      for (var kit = 0; kit < 8; kit++) {
        var sums = [0, 0, 0], counts = [0, 0, 0];
        for (var kp = 0; kp < treeCount; kp++) {
          var kx = treeNorm[kp * 3];
          var best = 0;
          if (Math.abs(kx - clusterMeans[1]) < Math.abs(kx - clusterMeans[best])) best = 1;
          if (Math.abs(kx - clusterMeans[2]) < Math.abs(kx - clusterMeans[best])) best = 2;
          clusterAssignment[kp] = best;
          sums[best] += kx;
          counts[best] += 1;
        }
        for (var kc = 0; kc < 3; kc++) if (counts[kc]) clusterMeans[kc] = sums[kc] / counts[kc];
      }
      treeClusterCenter = new Float32Array(treeCount);
      for (var ka = 0; ka < treeCount; ka++) treeClusterCenter[ka] = clusterMeans[clusterAssignment[ka]];
      treeMeans = clusterMeans;

      // Shuffle indices; first slice becomes mote targets, rest are fill.
      var idx = new Array(treeCount);
      for (var s0 = 0; s0 < treeCount; s0++) idx[s0] = s0;
      for (var s1 = treeCount - 1; s1 > 0; s1--) {
        var s2 = (Math.random() * (s1 + 1)) | 0;
        var tmpI = idx[s1]; idx[s1] = idx[s2]; idx[s2] = tmpI;
      }
      // The opening seed and closing endpoint are narrative anchors, not tree
      // material. Only the ordinary field motes join the grove.
      var take = 0;
      var TREE_TINT = 0.55;   // max blend toward the accent at the canopy top
      for (var mi = 2; mi < PARTICLE_POOL && take < treeCount; mi++, take++) {
        moteNormIdx[mi] = idx[take];
        moteTreeIdx[mi] = clusterAssignment[idx[take]];
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
      var fillStatRank = new Float32Array(fillCount);
      fillSeedArr  = new Float32Array(fillCount);
      fillStartArr = new Float32Array(fillCount * 3);
      fillNorm     = new Float32Array(fillCount * 3);
      fillClusterCenter = new Float32Array(fillCount);
      fillTreeIdx  = new Uint8Array(fillCount);
      var fillTint = new Float32Array(fillCount);
      for (var fi = 0; fi < fillCount; fi++) {
        var si = idx[take + fi] * 3;
        fillNorm[fi * 3]     = treeNorm[si];
        fillNorm[fi * 3 + 1] = treeNorm[si + 1];
        fillNorm[fi * 3 + 2] = treeNorm[si + 2];
        fillClusterCenter[fi] = treeClusterCenter[idx[take + fi]];
        fillTreeIdx[fi] = clusterAssignment[idx[take + fi]];
        fillTint[fi] = Math.pow(treeNorm[si + 1], 2.2) * TREE_TINT;
        // Closing/star target (and the open-cloud fly-in origin): distributed
        // EVENLY in screen space through the landed camera, like the main
        // closing motes, and pushed WIDE so most of it sits off-frame — a
        // sparse even backdrop of far specks, not a bottom-heavy world-space
        // ring (which read as the low clump through the down-tilted camera).
        var fScreenX = (Math.random() - 0.5) * 3.6;
        var fScreenY = -1.5 + 3.0 * Math.random();
        var fDist = 4.0 + Math.random() * 9.0;   // far -> small specks
        closeProbe.set(fScreenX, fScreenY, 0.35).unproject(closingCamera);
        closeDir.copy(closeProbe).sub(closingCamera.position).normalize();
        fillStartArr[fi * 3]     = closingCamera.position.x + closeDir.x * fDist;
        fillStartArr[fi * 3 + 1] = closingCamera.position.y + closeDir.y * fDist;
        fillStartArr[fi * 3 + 2] = closingCamera.position.z + closeDir.z * fDist;
        fillPos[fi * 3]     = fillStartArr[fi * 3];
        fillPos[fi * 3 + 1] = fillStartArr[fi * 3 + 1];
        fillPos[fi * 3 + 2] = fillStartArr[fi * 3 + 2];
        fillSize[fi] = BASE_MOTE_SIZE * (0.9 + Math.random() * 0.3);
        fillSeedArr[fi] = fillNorm[fi * 3 + 1];
        fillStatRank[fi] = 1;
      }
      fillFinalCapture = new Float32Array(fillCount * 3);
      var fillGeo = new THREE.BufferGeometry();
      fillGeo.setAttribute("position", new THREE.BufferAttribute(fillPos, 3));
      fillGeo.setAttribute("aAlpha",   new THREE.BufferAttribute(fillA, 1));
      fillGeo.setAttribute("aRed",     new THREE.BufferAttribute(fillRed, 1));
      fillGeo.setAttribute("aSize",    new THREE.BufferAttribute(fillSize, 1));
      fillGeo.setAttribute("aGlow",    new THREE.BufferAttribute(fillGlow, 1));
      fillGeo.setAttribute("aTreeTint", new THREE.BufferAttribute(fillTint, 1));
      fillGeo.setAttribute("aStatRank", new THREE.BufferAttribute(fillStatRank, 1));
      fillAlphaAttr = fillGeo.attributes.aAlpha;
      fillPosAttr   = fillGeo.attributes.position;
      var fillPoints = new THREE.Points(fillGeo, partMat);
      fillPoints.renderOrder = 9;    // just beneath the ambient motes (10)
      fillPoints.frustumCulled = false;
      scene.add(fillPoints);
      treeReady = true;
      document.body.setAttribute("data-tree-pointcloud", "ready");
    })
    .catch(function (err) {
      document.body.setAttribute("data-tree-pointcloud", "error");
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
    // Same asymmetry as flatTreeView above: the pull-IN on dispersal is a
    // 2.2-unit z move, and riding treeFormP's tail crammed it into the back
    // 60% of the spread. Release it across the whole dispersal band so the
    // zoom and the tilt travel together.
    return 2.2 * Math.min(ss(0.05, 0.6, treeFormP), 1 - ss(0.0, 1.0, finalFieldP));
  }

  // Runs every frame from the animate loop, after the organic mote update
  // and before position buffers upload / lines read them.
  function updateTreeFormation(elapsed) {
    treeFormP = treeFormTarget;
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
      if (fillAlphaAttr && finalFieldP <= 0 && fillAlphaAttr.array[0] !== 0) {
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
    // Horizontal and vertical scales are independent: the grove fills almost
    // the entire width, while height is capped so no crown is cropped. This
    // spreads the three trees apart instead of shrinking them into a cluster.
    var SX = (zr - zl) * 0.98 / (assetHalfW * 2);
    var S = Math.min(TREE_MAX_HEIGHT, SX);
    if (S < 0.8) S = 0.8;
    // Seat the grove's CENTER on the screen-vertical center (the middle of the
    // #opportunity text column) rather than on the forest floor. Trace the
    // camera's center ray to the grove z-plane so the center holds through the
    // dolly/tilt and the zoom pull-back. camZ (with the bump) is computed above.
    var treeView = smoothstep(0.05, 0.25, treeFormP);
    var camY2 = lerp(CAM_START.y, CAM_END.y, lt2); if (camY2 < 0.5) camY2 = 0.5;
    camY2 = lerp(camY2, TREE_CAMERA_Y, treeView);
    var lookY2 = lerp(lerp(-1.0, -1.5, lt2), TREE_CAMERA_Y, treeView);
    var tRay = (TREE_CZ - camZ) / (-camZ);          // camZ in [3,10]; never 0
    var groveCenterY = camY2 + tRay * (lookY2 - camY2);
    // Portrait phones make the grove SHORT: S is derived from the horizontal
    // measured zone, and a narrow viewport gives a small halfW, so the trees
    // come out well under TREE_MAX_HEIGHT and leave a band of empty sky above
    // them — while the 03 panel, which is bottom-anchored and stacks to several
    // rows at this width, climbs up over their trunks. Lift the whole grove into
    // that empty band. Proportional to S rather than a fixed world offset so it
    // tracks however tall the grove actually came out.
    var baseY = groveCenterY - S * 0.5 + TREE_CENTER_OFFSET_Y +
                (mobileLike ? S * TREE_MOBILE_LIFT : 0);

    // Publish each trunk's viewport X as a CSS var so the DOM species
    // readouts sit CENTRED over the peaks of their trees on any viewport.
    // R6a: publish as soon as the camera has FLATTENED (treeFormP >= 0.25,
    // where flatTreeView is already 1 and the projection is stable) — well
    // before the readouts write on at treeFormP 0.80. That kills the
    // fallback-to-projected POP: --tree-x is already correct on the first
    // visible frame, so no default-then-correct jump. Below 0.25 the camera
    // un-flattens, but the readouts are invisible there so it can't be seen.
    if (treeMeans && treeFormP >= 0.25) {
      for (var tlx = 0; tlx < 3; tlx++) {
        treeLabelVec.set(groveCX + treeMeans[tlx] * SX, baseY + S, TREE_CZ).project(camera);
        document.documentElement.style.setProperty(
          "--tree-x-" + tlx,
          ((treeLabelVec.x * 0.5 + 0.5) * 100).toFixed(2) + "%"
        );
      }
    }

    // Yaw the whole grove about its own vertical axis. Slow constant turn while
    // it stands (treeFormP ~ 0 or 1); lively through the transition (env peaks
    // at treeFormP 0.5). Time-integrated, so it keeps turning on a paused scroll
    // -- the standalone tester's continuous orbit, gated to the assembly motion.
    var dtSpin = treeSpinPrevT ? Math.min(0.05, elapsed - treeSpinPrevT) : 0;
    treeSpinPrevT = elapsed;
    if (!treeSpinInit) {                              // seed each tree's start phase once
      for (var sp = 0; sp < 3; sp++) treeSpinAngle[sp] = TREE_SPIN_PHASE[sp];
      treeSpinInit = true;
    }
    var spinEnv = 4 * treeFormP * (1 - treeFormP);  // 0 at ends, 1 mid-transition
    var spinCos = [0, 0, 0], spinSin = [0, 0, 0];
    for (var st = 0; st < 3; st++) {
      treeSpinAngle[st] += (TREE_SPIN_BASE * TREE_SPIN_RATE[st] + TREE_SPIN_BOOST * spinEnv) * dtSpin;
      spinCos[st] = Math.cos(treeSpinAngle[st]);
      spinSin[st] = Math.sin(treeSpinAngle[st]);
    }
    for (var i = 2; i < PARTICLE_POOL; i++) {
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
      var sway = Math.sin(treeFormP * Math.PI * 2 + swayPhase[i]) * 0.02 * e;
      var mt = moteNormIdx[i] * 3;
      var moteCenter = treeClusterCenter[moteNormIdx[i]];
      var moteTrunkX = moteCenter * SX;
      var mTree = moteTreeIdx[i];
      var mCos = spinCos[mTree], mSin = spinSin[mTree];
      var mlx = (treeNorm[mt] - moteCenter) * S;
      var mlz = treeNorm[mt + 2] * S;
      var mtx = groveCX + moteTrunkX + mlx * mCos - mlz * mSin;
      var mty = treeNorm[mt + 1] * S + baseY;
      var mtz = TREE_CZ  + mlx * mSin + mlz * mCos;
      positions[xi] = moteCapture[xi] + (mtx - moteCapture[xi]) * e + sway;
      positions[yi] = moteCapture[yi] + (mty - moteCapture[yi]) * e;
      positions[zi] = moteCapture[zi] + (mtz - moteCapture[zi]) * e;
      var aTree = 1.0;
      if (aTree > alphas[i]) alphas[i] = aTree;
    }
    // Fill dots FLY from the ambient field into the trees (same stagger
    // family as the motes) rather than fading in place.
    var fa = fillAlphaAttr.array;
    var fp = fillPosAttr.array;
    var fillAmp = lerp(1.0, 0.3, ff);   // fill dots fully opaque when formed
    for (var f = 0; f < fillCount; f++) {
      var wf = tClamp01(treeFormP * 1.25 - fillSeedArr[f] * 0.25);
      var ef = wf * wf * (3 - 2 * wf);
      var f3 = f * 3;
      var fillCenter = fillClusterCenter[f];
      var fillTrunkX = fillCenter * SX;
      var fTree = fillTreeIdx[f];
      var fCos = spinCos[fTree], fSin = spinSin[fTree];
      var flx = (fillNorm[f3] - fillCenter) * S;
      var flz = fillNorm[f3 + 2] * S;
      var ftx = groveCX + fillTrunkX + flx * fCos - flz * fSin;
      var fty = fillNorm[f3 + 1] * S + baseY;
      var ftz = TREE_CZ  + flx * fSin + flz * fCos;
      fp[f3]     = fillStartArr[f3]     + (ftx - fillStartArr[f3]) * ef;
      fp[f3 + 1] = fillStartArr[f3 + 1] + (fty - fillStartArr[f3 + 1]) * ef;
      fp[f3 + 2] = fillStartArr[f3 + 2] + (ftz - fillStartArr[f3 + 2]) * ef;
      // visible almost as soon as they start moving, so the flight is seen
      fa[f] = Math.min(1, ef * 3.0) * fillAmp;
    }
    fillPosAttr.needsUpdate = true;
    fillAlphaAttr.needsUpdate = true;
  }

  // Once the grove has done its job, the same motes leave the tree targets and
  // return to the original full-volume field. The existing final convergence
  // then draws that field into the central red point.
  function updateFinalField() {
    finalFieldP = finalFieldTarget;
    // Only on a page that asked for it: dissolve the opaque base plane over
    // the closing so whatever the page has put BEHIND the canvas shows
    // through the motes. Everywhere else uBaseAlpha stays 1 and this scene
    // renders exactly as it always has.
    if (transparentBackdrop) {
      // Do NOT go to 0. The motes and lines draw at low alpha (the closing
      // dims ordinary motes to 0.25), which reads as solid against a solid
      // backdrop but composites at a quarter strength over the DOM once
      // there is nothing behind them. BASE_FLOOR leaves a veil for them to
      // sit on — enough to keep the field and the network reading, thin
      // enough that the photograph comes through it.
      var BASE_FLOOR = 0.42;
      uniforms.uBaseAlpha.value = 1 - (1 - BASE_FLOOR) * smoothstep(0.45, 1.0, finalFieldP);
    }
    // Continuously retain the fully assembled grove while this transition is
    // at zero. Both scroll directions therefore use the same starting state.
    if (finalFieldP <= 0) {
      finalFieldCapture.set(positions);
      finalFieldLocked = false;
      if (fillFinalCapture && fillPosAttr) fillFinalCapture.set(fillPosAttr.array);
      fillFinalLocked = false;
      return;
    }
    if (finalFieldTarget > 0.001 && !finalFieldLocked) {
      finalFieldCapture.set(positions);
      finalFieldLocked = true;
    }
    if (fillFinalCapture && fillPosAttr && !fillFinalLocked) {
      fillFinalCapture.set(fillPosAttr.array);
      fillFinalLocked = true;
    }
    if (!finalFieldLocked) return;
    // Piet: at the end every ordinary mote settles to 25% opacity so the
    // terminal red mote (index 1, untouched below) and the lines (their own
    // aRevealedAlpha buffer) carry the finale. Dim eases in over the back
    // half of the settle and reverses cleanly on upward scroll.
    var closingDim = smoothstep(0.6, 1.0, finalFieldP);
    for (var i = 2; i < PARTICLE_POOL; i++) {
      var stagger = (i % 11) * 0.015;
      var w = tClamp01(finalFieldP * 1.15 - stagger);
      var e = w * w * (3 - 2 * w);
      var i3 = i * 3;
      positions[i3]     = lerp(finalFieldCapture[i3],     closingFieldHome[i3],     e);
      positions[i3 + 1] = lerp(finalFieldCapture[i3 + 1], closingFieldHome[i3 + 1], e);
      positions[i3 + 2] = lerp(finalFieldCapture[i3 + 2], closingFieldHome[i3 + 2], e);
      if (alphas[i] < 0.78 * e) alphas[i] = 0.78 * e;
      alphas[i] = lerp(alphas[i], 0.25, closingDim);
    }
    if (fillFinalLocked && fillPosAttr && fillAlphaAttr) {
      var fp = fillPosAttr.array;
      var fa = fillAlphaAttr.array;
      for (var f = 0; f < fillCount; f++) {
        var fs = (f % 13) * 0.012;
        var fw = tClamp01(finalFieldP * 1.13 - fs);
        var fe = fw * fw * (3 - 2 * fw);
        var f3 = f * 3;
        fp[f3]     = lerp(fillFinalCapture[f3],     fillStartArr[f3],     fe);
        fp[f3 + 1] = lerp(fillFinalCapture[f3 + 1], fillStartArr[f3 + 1], fe);
        fp[f3 + 2] = lerp(fillFinalCapture[f3 + 2], fillStartArr[f3 + 2], fe);
        fa[f] = lerp(1, 0.25, closingDim);
      }
      fillPosAttr.needsUpdate = true;
      fillAlphaAttr.needsUpdate = true;
    }
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
    uniforms.uMoteDensity.value = 0.08 + v * 0.92;
    uniforms.uConnect.value     = v;
    // Claude fork: drive the cascade DIRECTLY from global scroll. STRICTLY
    // SEQUENTIAL bands (Piet: a wave must not start before the previous
    // wave's lines have LANDED): wave 1 fans from the seed fast, right as
    // the <1% grid assembles (hero occupies the first ~0.10 of scroll);
    // wave 2 begins only after wave 1 completes, wave 3 after wave 2.
    // Convergence (wave 7) stays on its own DOM trigger.
    setWaveProgress(1, (v - 0.10) / 0.08);   // lands by 0.18
    setWaveProgress(2, (v - 0.19) / 0.16);   // lands by 0.35
    setWaveProgress(3, (v - 0.36) / 0.18);   // lands by 0.54
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
  // Lines draw over 0 -> 0.93; contact (and the time-based blast) fires only
  // when the closing is essentially SETTLED — Piet: contact was landing too
  // soon. Same on every viewport; the DOM trigger ends at closing-settled.
  var FINAL_CONVERGENCE_LAND = 0.93;
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
  var dayPalette = {
    canopy: readCssColor("--gl-canopy"), understory: readCssColor("--gl-understory"),
    shaft: readCssColor("--gl-light-shaft"), mote: readCssColor("--gl-mote"),
    line: readCssRgba("--gl-line"), base: readCssColor("--gl-base")
  };
  var finalPalette = {
    canopy: readCssColor("--gl-final-canopy"), understory: readCssColor("--gl-final-understory"),
    shaft: readCssColor("--gl-final-shaft"), mote: readCssColor("--gl-final-mote"),
    line: readCssRgba("--gl-final-line"), base: readCssColor("--gl-final-base")
  };
  // ---- JOURNEY COLOUR RAMP (Piet) --------------------------------------
  // The page no longer tints per-section. It walks ONE ramp, and the sliding
  // headline bars are what move it: each bar's ride carries the background
  // from one stop to the next, so the colour change is something you watch
  // arrive rather than something that crossfades on its own.
  //
  //   stop 0  day/beige         (hero + 01, where we start)
  //   stop 1  bar A (hero -> 01)    first small step off the beige
  //   stop 2  bar C (01 -> 02)      halfway to the green
  //   stop 3  bar B (02 -> 03)      the green, full strength
  //   stop 4  the trees (in 03)     halfway from the green to the night
  //   then the existing finalPalette takes it the rest of the way down.
  //
  // Green: off the yellow, but EARTHY forest rather than electric — saturation
  // pulled back and the hue held on the olive/sage side.
  var greenPalette = {
    canopy: new THREE.Color("#C4D6A4"),
    understory: new THREE.Color("#6F8F55"),
    base: new THREE.Color("#C6D6A6")
  };
  function mixStop(a, b, t) {
    return {
      canopy: a.canopy.clone().lerp(b.canopy, t),
      understory: a.understory.clone().lerp(b.understory, t),
      base: a.base.clone().lerp(b.base, t)
    };
  }
  var journeyStops = [
    { canopy: dayPalette.canopy, understory: dayPalette.understory, base: dayPalette.base },
    mixStop(dayPalette, greenPalette, 0.18),
    mixStop(dayPalette, greenPalette, 0.55),
    greenPalette,
    // Barely off the green. Piet: 03 must READ as the green section — at 0.5
    // the grove card went olive-dark and lost the colour entirely. The drop to
    // night is the closing's job, not this stop's.
    mixStop(greenPalette, finalPalette, 0.12)
  ];
  var journeyP = 0;   // 0..4, the COMMITTED position along the ramp
  var wipeStop = 0;   // >0 while a bar is mid-wipe toward that stop
  var paletteScratch = new THREE.Color();
  var tintScratch = new THREE.Color();
  var finalPaletteP = 0;
  var rampBelow = { canopy: new THREE.Color(), understory: new THREE.Color(), base: new THREE.Color() };
  var rampAbove = { canopy: new THREE.Color(), understory: new THREE.Color(), base: new THREE.Color() };
  function rampAt(v, out) {
    var seg = Math.floor(v);
    if (seg < 0) seg = 0;
    if (seg > journeyStops.length - 2) seg = journeyStops.length - 2;
    var t = v - seg;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var a = journeyStops[seg], b = journeyStops[seg + 1];
    out.canopy.lerpColors(a.canopy, b.canopy, t);
    out.understory.lerpColors(a.understory, b.understory, t);
    out.base.lerpColors(a.base, b.base, t);
  }
  function applyScenePalette() {
    // While a bar is wiping, BELOW its edge is the old stop and ABOVE is the
    // new one — no blend between them, the bar's edge is the transition. With
    // no wipe running both sides are the same committed colour. The closing
    // night palette then lerps on top of both.
    if (wipeStop > 0) {
      rampAt(wipeStop - 1, rampBelow);
      rampAt(wipeStop, rampAbove);
    } else {
      rampAt(journeyP, rampBelow);
      rampAt(journeyP, rampAbove);
    }
    uniforms.uCanopy.value.lerpColors(rampBelow.canopy, finalPalette.canopy, finalPaletteP);
    uniforms.uCanopyTo.value.lerpColors(rampAbove.canopy, finalPalette.canopy, finalPaletteP);
    uniforms.uUnderstory.value.lerpColors(rampBelow.understory, finalPalette.understory, finalPaletteP);
    uniforms.uUnderstoryTo.value.lerpColors(rampAbove.understory, finalPalette.understory, finalPaletteP);
    uniforms.uLightShaft.value.lerpColors(dayPalette.shaft, finalPalette.shaft, finalPaletteP);
    uniforms.uLine.value.lerpColors(dayPalette.line.color, finalPalette.line.color, finalPaletteP);
    uniforms.uLineAlpha.value = lerp(dayPalette.line.alpha, finalPalette.line.alpha, finalPaletteP);
    paletteScratch.lerpColors(dayPalette.mote, finalPalette.mote, finalPaletteP);
    partMat.uniforms.uColor.value.copy(paletteScratch);
    arrowMat.uniforms.uColor.value.copy(paletteScratch);
    uniforms.uBase.value.lerpColors(rampBelow.base, finalPalette.base, finalPaletteP);
    uniforms.uBaseTo.value.lerpColors(rampAbove.base, finalPalette.base, finalPaletteP);
    // The opaque base quad is what you actually see; the clear colour just
    // keeps anything outside it consistent.
    bgColor.copy(uniforms.uBase.value);
    renderer.setClearColor(bgColor, clearAlpha);
  }
  function setFinalPaletteProgress(p) {
    finalPaletteP = tClamp01(p);
    applyScenePalette();
  }
  // Committed position along the journey ramp, 0..4. Ends any wipe.
  function setJourneyProgress(v) {
    v = v < 0 ? 0 : (v > journeyStops.length - 1 ? journeyStops.length - 1 : v);
    if (v === journeyP && wipeStop === 0) return;
    journeyP = v;
    wipeStop = 0;
    uniforms.uWipeY.value = 1.0;
    applyScenePalette();
  }
  // A bar is mid-ride: everything ABOVE screen fraction y (0 bottom, 1 top)
  // is already at `stop`, everything below is still at stop - 1.
  function setJourneyWipe(stop, y) {
    wipeStop = stop;
    uniforms.uWipeY.value = y < 0 ? 0 : (y > 1 ? 1 : y);
    applyScenePalette();
  }
  // Retired: 02 no longer tints on its own (swot-claude.js still calls this on
  // the 02 pin). The green now arrives with the bar that rides 02 -> 03.
  function setProductTintProgress() {}
  function setFinalPalette(active) { setFinalPaletteProgress(active ? 1 : 0); }
  // Temporary: one-shot readout for diagnosing where the seed actually is.
  // Call bullfinchCanopy.debugSeed() in the console. Remove once settled.
  function debugSeed() {
    return {
      seedPos: [positions[0].toFixed(2), positions[1].toFixed(2), positions[2].toFixed(2)].join(", "),
      floorHome: [groundFieldHome[0].toFixed(2), groundFieldHome[1].toFixed(2), groundFieldHome[2].toFixed(2)].join(", "),
      gridHome: [statGridHome[0].toFixed(2), statGridHome[1].toFixed(2), statGridHome[2].toFixed(2)].join(", "),
      statFormP: statFormP.toFixed(3),
      openFieldP: openFieldP.toFixed(3),
      seedDelay: statAssemblyDelay[0].toFixed(3),
      seedAlpha: alphas[0].toFixed(2),
      seedSize: sizes[0].toFixed(1),
      camera: [camera.position.x.toFixed(2), camera.position.y.toFixed(2), camera.position.z.toFixed(2)].join(", ")
    };
  }
  window.bullfinchCanopy = {
    debugSeed: debugSeed,
    setProgress: setProgress,
    setLayerTint: setProgress,
    setWaveProgress: setWaveProgress,
    setConvergenceProgress: setConvergenceProgress,
    setFinalPalette: setFinalPalette,
    setFinalPaletteProgress: setFinalPaletteProgress,
    setProductTintProgress: setProductTintProgress,
    setJourneyProgress: setJourneyProgress,
    setJourneyWipe: setJourneyWipe,
    setSeedReveal: setSeedReveal,
    setStatProgress: function (p) { statFormP = tClamp01(p); },
    setStatFillProgress: function (p) { statFillP = tClamp01(p); },
    setOpenFieldProgress: function (p) { openFieldP = tClamp01(p); },
    // Tree grove formation (index-pointcloud variant): driven by the
    // DOM-anchored ScrollTriggers in index-pointcloud.html. 03 approaching
    // drives 0 -> 1 (form); 04 approaching drives 1 -> 0 (disperse).
    setTreeProgress: function (p) { treeFormTarget = tClamp01(p); },
    setFinalFieldProgress: function (p) { finalFieldTarget = tClamp01(p); },
    getLayerTint: function () { return uniforms.uLayerTint.value; },
  };
})();
