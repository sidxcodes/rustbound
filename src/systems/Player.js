// The survivor: walking, running, melee, getting in and out of the truck.
import { clamp, dampAngle } from '../core/util.js';
import { buildCharacter, buildWeapon, animateWalk } from '../models/models.js';
import { ITEMS } from '../data/items.js';
import { PLAYER_START, MAP } from '../data/layout.js';

const WALK = 3.9, RUN = 6.6, RADIUS = 0.38;

export class Player {
  constructor(game) {
    this.game = game;
    this.model = buildCharacter();
    game.scene.add(this.model.root);
    this.weaponMesh = null;
    this.reset();
  }
  reset() {
    this.x = PLAYER_START.x; this.z = PLAYER_START.z; this.yaw = 0;
    this.driving = false; this.running = false; this.moving = false;
    this.equipped = null; this.attackT = -1; this.attackHit = false; this.walkPhase = 0;
    this.showWeapon();
  }
  equip(id) {
    this.equipped = this.equipped === id ? null : id;
    this.showWeapon();
    this.game.events.emit('toast', this.equipped ? `Equipped ${ITEMS[id].name.toLowerCase()}` : 'Put away weapon');
  }
  showWeapon() {
    if (this.model.pack) { this.model.setWeapon(this.equipped); return; }
    if (this.weaponMesh) this.model.hand.remove(this.weaponMesh);
    this.weaponMesh = this.equipped ? buildWeapon(this.equipped) : null;
    if (this.weaponMesh) this.model.hand.add(this.weaponMesh);
  }
  damageValue() { return this.equipped ? ITEMS[this.equipped].damage : 8; }

  update(dt) {
    const { input, cameraRig, physics, inventory, survival, vehicle } = this.game;
    if (this.equipped && !inventory.has(this.equipped)) { this.equipped = null; this.showWeapon(); }
    if (this.driving) {
      this.x = vehicle.x; this.z = vehicle.z;
      this.model.root.visible = false;
      this.running = false;
      return;
    }
    this.model.root.visible = true;

    // movement relative to the camera
    let ix = 0, iz = 0;
    if (input.held('KeyW', 'ArrowUp')) iz += 1;
    if (input.held('KeyS', 'ArrowDown')) iz -= 1;
    if (input.held('KeyD', 'ArrowRight')) ix += 1;
    if (input.held('KeyA', 'ArrowLeft')) ix -= 1;
    const fwd = cameraRig.groundForward(), right = { x: -fwd.z, z: fwd.x };
    let mx = fwd.x * iz + right.x * ix, mz = fwd.z * iz + right.z * ix;
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.01 && !survival.dead;
    const overloaded = inventory.weight() > inventory.maxWeight;
    this.running = this.moving && input.held('ShiftLeft', 'ShiftRight') && survival.stamina > 1 && !overloaded;
    if (this.moving) {
      mx /= len; mz /= len;
      const speed = (this.running ? RUN : WALK) * (overloaded ? 0.55 : 1) * (this.attackT >= 0 ? 0.5 : 1);
      this.x += mx * speed * dt; this.z += mz * speed * dt;
      if (this.attackT < 0) this.yaw = dampAngle(this.yaw, Math.atan2(-mz, mx), 14, dt);
      this.walkPhase += dt * (this.running ? 13 : 9);
      if (this.running && Math.random() < dt * 9) this.game.particles?.emit(this.x, 0.1, this.z, { color: 0x8f7d5c, size: 0.5, life: 0.6, alpha: 0.3, vy: 0.4 });
    }

    // melee: left click or Space, aimed at the mouse
    if (this.attackT < 0 && !survival.dead && (input.mouse.clicked || input.hit('Space'))) {
      const aim = this.game.mouseGround();
      if (aim && input.mouse.clicked) this.yaw = Math.atan2(-(aim.z - this.z), aim.x - this.x);
      this.attackT = 0; this.attackHit = false;
      if (this.model.pack) this.model.play(this.equipped ? 'Slash' : 'Punch', { once: true, duration: 0.5, restart: true, fade: 0.06 });
      this.game.events.emit('sfx', 'swing');
    }
    if (this.attackT >= 0) {
      this.attackT += dt;
      if (!this.attackHit && this.attackT > 0.14) { this.attackHit = true; this.game.enemies.meleeHit(this.x, this.z, this.yaw, 2.2, this.damageValue()); }
      if (this.attackT > 0.48) this.attackT = -1;
    }

    // collide with the world and the parked truck
    const p = physics.resolve({ x: this.x, z: this.z }, RADIUS);
    for (const c of vehicle.circles()) {
      const dx = p.x - c.x, dz = p.z - c.z, rr = RADIUS + c.r, d = Math.hypot(dx, dz);
      if (d < rr && d > 0.0001) { p.x += (dx / d) * (rr - d); p.z += (dz / d) * (rr - d); }
    }
    this.x = clamp(p.x, MAP.minX, MAP.maxX); this.z = clamp(p.z, MAP.minZ, MAP.maxZ);

    const m = this.model;
    m.root.position.set(this.x, 0, this.z);
    m.root.rotation.y = this.yaw;
    if (m.pack) {
      // hand-made model: pick the animation clip that matches what the player is doing
      if (survival.dead) m.play('Death', { once: true });
      else if (this.attackT < 0) m.play(this.moving ? (this.running ? 'Run' : 'Walk') : 'Idle');
      m.update(dt);
      return;
    }
    animateWalk(m, this.walkPhase, this.moving ? 1 : 0);
    const swing = this.attackT >= 0 ? Math.sin(Math.min(1, this.attackT / 0.3) * Math.PI) : 0;
    m.armR.rotation.z = this.equipped || swing ? 0.5 + swing * 1.6 : this.moving ? Math.sin(this.walkPhase) * 0.5 : 0;
    m.armR.rotation.y = swing * -0.9;
    if (survival.dead) { m.root.rotation.z = Math.PI / 2; m.root.position.y = 0.2; } else m.root.rotation.z = 0;
  }

  nearVehicle(range = 1.5) {
    return this.game.vehicle.circles().some((c) => Math.hypot(c.x - this.x, c.z - this.z) < c.r + range);
  }
  enterVehicle() {
    if (this.driving || !this.nearVehicle()) return false;
    this.driving = true;
    this.game.vehicle.tryStart();
    if (!this.game.flags.driveTip) { this.game.flags.driveTip = true; this.game.events.emit('toast', 'W/S drive and brake, A/D steer, Space handbrake, F get out'); }
    return true;
  }
  exitVehicle() {
    const { vehicle, physics } = this.game;
    if (!this.driving) return false;
    if (Math.abs(vehicle.speed()) > 3) { this.game.events.emit('toast', 'Slow down first'); return false; }
    const f = vehicle.forward(), left = { x: -Math.sin(vehicle.yaw), z: -Math.cos(vehicle.yaw) };
    const spots = [[left.x * 1.9, left.z * 1.9], [-left.x * 1.9, -left.z * 1.9], [-f.x * 3.4, -f.z * 3.4], [f.x * 3.6, f.z * 3.6]];
    const spot = spots.find(([dx, dz]) => !physics.blocked(vehicle.x + dx, vehicle.z + dz, RADIUS)) || spots[0];
    this.x = vehicle.x + spot[0]; this.z = vehicle.z + spot[1];
    this.driving = false;
    vehicle.engineOn = false;
    this.game.events.emit('sfx', 'stop');
    return true;
  }
  toJSON() { return { x: this.x, z: this.z, yaw: this.yaw, equipped: this.equipped, driving: this.driving }; }
  load(d) { this.x = d.x; this.z = d.z; this.yaw = d.yaw; this.equipped = d.equipped; this.driving = !!d.driving; this.attackT = -1; this.showWeapon(); }
}
