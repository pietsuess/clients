(function () {
  var canvas = document.getElementById("block-wing-model");
  if (!canvas || typeof THREE === "undefined" || !window.BLOCK_WING_OBJ) {
    return;
  }

  function parseObjGeometry(objText) {
    var sourceVertices = [];
    var vertices = [];
    objText.split(/\r?\n/).forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed || trimmed.charAt(0) === "#") return;
      var parts = trimmed.split(/\s+/);
      if (parts[0] === "v") {
        sourceVertices.push([
          parseFloat(parts[1]) || 0,
          parseFloat(parts[2]) || 0,
          parseFloat(parts[3]) || 0,
        ]);
      } else if (parts[0] === "f" && parts.length >= 4) {
        var indices = parts.slice(1).map(function (part) {
          var raw = parseInt(part.split("/")[0], 10);
          return raw < 0 ? sourceVertices.length + raw : raw - 1;
        });
        for (var i = 1; i < indices.length - 1; i++) {
          [indices[0], indices[i], indices[i + 1]].forEach(function (idx) {
            var v = sourceVertices[idx];
            if (v) vertices.push(v[0], v[1], v[2]);
          });
        }
      }
    });

    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.1, 11.5);

  var key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(3, 4, 6);
  scene.add(key);
  var fill = new THREE.DirectionalLight(0xff5560, 0.9);
  fill.position.set(-5, 1, 3);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));

  var geometry = parseObjGeometry(window.BLOCK_WING_OBJ);
  var material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.18,
    emissive: 0x120406,
    side: THREE.DoubleSide,
  });
  var model = new THREE.Mesh(geometry, material);

  var box = new THREE.Box3().setFromObject(model);
  var center = box.getCenter(new THREE.Vector3());
  var size = box.getSize(new THREE.Vector3());
  model.position.sub(center);
  model.position.y += 0.42;
  var maxDim = Math.max(size.x, size.y, size.z) || 1;
  model.scale.setScalar(4.25 / maxDim);
  var uprightZ = Math.PI / 2;
  var spinStart = -0.35;
  model.rotation.set(0, spinStart, uprightZ);
  scene.add(model);

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(1, Math.floor(rect.width));
    var height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render(time) {
    resize();
    model.rotation.x = Math.sin(time * 0.00028) * 0.025;
    model.rotation.y = spinStart + time * 0.00018;
    model.rotation.z = uprightZ;
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
})();
