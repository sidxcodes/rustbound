// Screen effects for the High graphics setting: ambient occlusion (soft contact shadows),
// a little bloom on lights, colour grading and a vignette.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Colour grade for a worn, natural look: colours pulled toward grey (more so at night), a slight
// olive cast in the mid-tones, cool shadows and warm light, gentle contrast and a vignette.
// Runs on the linear image before tone mapping (OutputPass).
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uWarm: { value: 1 }, uNight: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uWarm, uNight; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, mix(0.8, 0.55, uNight));                // muted, and greyer by moonlight
      c.rgb *= mix(vec3(1.0), vec3(1.0, 1.02, 0.95), smoothstep(0.02, 0.2, l) * (1.0 - smoothstep(0.3, 0.8, l))); // olive mid-tones
      vec3 tone = mix(vec3(0.94, 0.99, 1.06), vec3(1.05, 1.0, 0.93), smoothstep(0.0, 0.45, l)); // cool shadows, warm light
      c.rgb *= mix(vec3(1.0), tone, uWarm);
      c.rgb = max((c.rgb - 0.18) * 1.08 + 0.18, 0.0);                     // gentle contrast around mid grey
      c.rgb += vec3(0.004, 0.005, 0.006) * (1.0 - smoothstep(0.0, 0.06, l)); // lift the blacks a touch, like film
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - smoothstep(0.42, 0.98, d) * 0.45;                    // vignette
      gl_FragColor = c;
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new GTAOPass(scene, camera, 4, 4);
    this.ao.blendIntensity = 1.0;
    this.ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.4, scale: 1.15, samples: 8 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
    // things that must not count as solid surfaces for occlusion (grass cards, mesh fences, sprites)
    this.aoHidden = [];
    const render = this.ao.render.bind(this.ao);
    this.ao.render = (...args) => {
      const was = this.aoHidden.map((o) => o.visible);
      this.aoHidden.forEach((o) => (o.visible = false));
      render(...args);
      this.aoHidden.forEach((o, i) => (o.visible = was[i]));
    };
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.24, 0.55, 0.95); // only lamps and lit glass really glow
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }
  resize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }
  render(dt) { this.composer.render(dt); }
}
