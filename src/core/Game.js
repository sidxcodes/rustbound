// Owns every system and runs the frame loop. Systems talk through `game.*` and the event bus.
import * as THREE from 'three';
import { Events } from './util.js';
import { Input } from './Input.js';
import { Physics } from '../systems/Physics.js';
import { World } from '../systems/World.js';
import { Environment } from '../systems/Environment.js';
import { CameraRig } from '../systems/CameraRig.js';
import { Vehicle } from '../systems/Vehicle.js';
import { Player } from '../systems/Player.js';
import { Inventory } from '../systems/Inventory.js';
import { Survival } from '../systems/Survival.js';
import { Crafting } from '../systems/Crafting.js';
import { Enemies } from '../systems/Enemies.js';
import { Interaction } from '../systems/Interaction.js';
import { Objectives } from '../systems/Objectives.js';
import { SaveLoad } from '../systems/SaveLoad.js';
import { Audio } from '../systems/Audio.js';
import { UI } from '../ui/UI.js';
import { PostFX } from '../gfx/PostFX.js';
import { Particles } from '../gfx/Particles.js';
import { setLowTextures } from '../gfx/pbr.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // with shadow.radius for soft edges
    // Neutral tone mapping keeps colours natural and a little muted (ACES pushes them harder)
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();

    this.state = 'title'; // title | playing | dead | won
    this.autoRun = true;  // the automated test turns this off and steps the game itself
    this.flags = {}; this.kills = 0; this.playTime = 0;
    this.events = new Events();
    this.input = new Input(canvas);
    this.physics = new Physics();
    this.inventory = new Inventory(40);
    this.env = new Environment(this);
    this.cameraRig = new CameraRig(this);
    this.world = new World(this);
    this.vehicle = new Vehicle(this);
    this.player = new Player(this);
    this.survival = new Survival(this);
    this.crafting = new Crafting(this);
    this.enemies = new Enemies(this);
    this.interaction = new Interaction(this);
    this.objectives = new Objectives(this);
    this.saves = new SaveLoad(this);
    this.audio = new Audio(this);
    this.ui = new UI(this);
    this.particles = new Particles(this);
    // graphics quality: High adds screen effects; Low is plain rendering for slower machines
    this.fx = null; this.quality = 'high'; this.fpsT = 0; this.fpsN = 0; this.qualityLocked = false;
    try { this.fx = new PostFX(this.renderer, this.scene, this.cameraRig.camera); this.fx.aoHidden.push(this.world.grass, this.particles.points, this.world.ring, ...this.world.aoHidden); } catch (e) { console.warn('Screen effects unavailable', e); }
    let saved = null;
    try { saved = localStorage.getItem('rustbound.gfx'); } catch { /* storage blocked */ }
    if (saved) this.qualityLocked = true;
    this.setQuality(saved === 'low' || !this.fx ? 'low' : 'high');

    this.events.on('kill', () => this.kills++);
    this.events.on('death', (cause) => { this.state = 'dead'; this.ui.close(); this.ui.showDeath(cause); });
    this.events.on('win', () => { this.saves.save(true); this.state = 'won'; this.ui.close(); this.ui.showWin(); });

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmpV = new THREE.Vector3();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    this.cameraRig.update(0, true);
    this.ui.showTitle();
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  resize() {
    const w = this.canvas.parentElement.clientWidth || 1, h = this.canvas.parentElement.clientHeight || 1;
    this.viewH = h;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.fx) this.fx.resize(w, h, pr);
    this.cameraRig.resize(w, h);
  }
  // 'high' or 'low'. remember = the player chose it, so stop adjusting automatically.
  setQuality(q, remember = false) {
    this.quality = q === 'high' && this.fx ? 'high' : 'low';
    this.world.setQuality(this.quality === 'high');
    setLowTextures(this.quality === 'low');
    this.env.sun.shadow.mapSize.setScalar(this.quality === 'high' ? 2048 : 1024);
    this.env.sun.shadow.radius = this.quality === 'high' ? 3 : 1.5;
    this.env.setSky(this.quality === 'high');
    // Low: a smaller shadow area around the player, so fewer things are drawn into the shadow map
    const sc = this.env.sun.shadow.camera, half = this.quality === 'high' ? 46 : 34;
    sc.left = sc.bottom = -half; sc.right = sc.top = half; sc.updateProjectionMatrix();
    if (this.env.sun.shadow.map) { this.env.sun.shadow.map.dispose(); this.env.sun.shadow.map = null; }
    if (remember) { this.qualityLocked = true; try { localStorage.setItem('rustbound.gfx', this.quality); } catch { /* storage blocked */ } }
    if (this.viewH) this.resize();
  }
  focusPoint() { return this.player.driving ? this.vehicle : this.player; }
  mouseGround() {
    this.raycaster.setFromCamera({ x: this.input.mouse.nx, y: this.input.mouse.ny }, this.cameraRig.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpV);
  }

  newGame() {
    this.saves.clear();
    this.world.reset();
    this.inventory.items = [];
    this.vehicle.reset(); this.player.reset(); this.enemies.reset();
    this.survival.load({ health: 100, hunger: 80, thirst: 75, stamina: 100 });
    this.flags = {}; this.objectives.state = {}; this.kills = 0; this.playTime = 0;
    this.env.time = 0.3; this.env.day = 1;
    this.resume();
    this.cameraRig.update(0, true);
    this.events.emit('toast', 'Search the garage. The truck needs parts before it will start');
  }
  loadGame() {
    if (!this.saves.load()) { this.events.emit('toast', 'No save found'); return false; }
    this.resume();
    this.cameraRig.update(0, true);
    return true;
  }
  resume() { this.state = 'playing'; this.ui.hideScreen(); this.audio.start(); this.cameraRig.yawTarget = 0; }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.autoRun) {
      this.tick(dt);
      // if High runs badly on this machine, drop to Low once
      if (this.state === 'playing' && this.quality === 'high' && !this.qualityLocked) {
        this.fpsT += (now - (this.prevNow || now)) / 1000; this.fpsN++;
        if (this.fpsT > 4) { if (this.fpsN / this.fpsT < 26) { this.setQuality('low'); this.qualityLocked = true; this.events.emit('toast', 'Graphics set to Low for smoother play. Change it in the Esc menu'); } this.fpsT = 0; this.fpsN = 0; }
      }
    }
    this.prevNow = now;
    requestAnimationFrame(this.frame);
  }
  // One simulation step. Also called directly by the automated test with a fixed dt.
  tick(dt) {
    const { input, player, vehicle } = this;
    if (this.state === 'playing') {
      this.playTime += dt;
      input.enabled = !this.ui.panel;
      this.ui.update(dt);
      this.interaction.update();
      player.update(dt);
      const controls = player.driving
        ? { throttle: (input.held('KeyW', 'ArrowUp') ? 1 : 0) - (input.held('KeyS', 'ArrowDown') ? 1 : 0), steer: (input.held('KeyA', 'ArrowLeft') ? 1 : 0) - (input.held('KeyD', 'ArrowRight') ? 1 : 0), handbrake: input.held('Space') }
        : null;
      vehicle.update(dt, controls);
      this.enemies.update(dt);
      this.survival.update(dt);
      this.objectives.update();
      this.saves.update(dt);
    } else {
      input.enabled = false;
      vehicle.update(dt, null);
      if (this.state === 'title') this.cameraRig.yawTarget += dt * 0.04;
    }
    this.world.update(dt);
    this.env.update(this.state === 'playing' ? dt : 0);
    this.audio.update();
    this.cameraRig.update(dt);
    this.particles.update(dt, this.viewH || 720);
    if (this.quality === 'high' && this.fx) { this.fx.grade.uniforms.uWarm.value = 1 - this.env.darkness * 0.7; this.fx.grade.uniforms.uNight.value = this.env.darkness; this.fx.render(dt); }
    else this.renderer.render(this.scene, this.cameraRig.camera);
    input.endFrame();
  }
}
