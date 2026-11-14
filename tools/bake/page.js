// Runs inside a browser page (bundled by tools/bake-impostors.mjs). Loads a high-poly model and renders
// orthographic pictures of each listed node: two side views (0 and 90 degrees) and one from above.
// Light comes from straight above with shadows, so the inside of a canopy is darker than its outside.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

window.bakeImpostors = async (url, names, { px = 1024, clear = 0x3c4630 } = {}) => {
  const gltf = await new GLTFLoader().loadAsync(url);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(clear, 0); // foliage-coloured but transparent, so soft edges do not go black
  document.body.appendChild(renderer.domElement);
  const out = [];
  for (const name of names) {
    const src = gltf.scene.getObjectByName(name);
    if (!src) { out.push({ name, error: 'missing node' }); continue; }
    const scene = new THREE.Scene();
    const obj = src.clone(true);
    obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); obj.updateMatrixWorld(true);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, -box.min.y, -c.z); // trunk base at the origin
    obj.updateMatrixWorld(true);
    box.setFromObject(obj);
    const h = box.max.y, r = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z); // half width that fits every view
    scene.add(new THREE.HemisphereLight(0xe6eef8, 0x4a4234, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(r * 0.15, h * 2 + 10, r * 0.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -r * 1.2, right: r * 1.2, top: r * 1.2, bottom: -r * 1.2, near: 0.1, far: h * 3 + 20 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    const shot = (w, hh, cam) => { renderer.setSize(w, hh, false); renderer.render(scene, cam); return renderer.domElement.toDataURL('image/png'); };
    // side views: px tall, as wide as the tree needs
    const sideW = Math.max(16, Math.round((px * (2 * r)) / h / 4) * 4);
    const side = (angle) => {
      const cam = new THREE.OrthographicCamera(-r, r, h, 0, 0.1, r * 4 + 10);
      cam.position.set(Math.sin(angle) * (r * 2 + 2), 0, Math.cos(angle) * (r * 2 + 2));
      cam.lookAt(0, 0, 0); cam.position.y = 0; cam.updateMatrixWorld();
      return shot(sideW, px, cam);
    };
    const top = (() => {
      const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.1, h + 20);
      cam.position.set(0, h + 10, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
      return shot(px, px, cam);
    })();
    out.push({ name, height: h, radius: r, side0: side(0), side90: side(Math.PI / 2), top });
  }
  renderer.dispose();
  return out;
};
