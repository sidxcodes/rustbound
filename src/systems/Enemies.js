// Husks: wander near home, chase what they notice, hit the player or the truck.
import * as THREE from 'three';
import { dampAngle } from '../core/util.js';
import { buildCharacter, animateWalk } from '../models/models.js';
import { ENEMY_SPAWNS } from '../data/layout.js';

const RADIUS = 0.4;

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.reset();
  }
  reset(saved) {
    for (const e of this.list) this.game.scene.remove(e.model.root);
    this.list = ENEMY_SPAWNS.map((s, i) => {
      const model = buildCharacter({ shirt: s.fast ? 0x8a7a55 : 0x5d6b52, pants: 0x3a3530, skin: s.fast ? 0xb3a078 : 0x8fa088, pack: false, husk: true, fast: !!s.fast });
      this.game.scene.add(model.root);
      // health bar: shown once the husk has been hurt
      const bar = new THREE.Group();
      const back = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x14171a, depthTest: false, fog: false })); back.scale.set(0.96, 0.12, 1);
      const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xdf5a44, depthTest: false, fog: false })); fill.scale.set(0.9, 0.07, 1);
      back.renderOrder = 5; fill.renderOrder = 6;
      bar.add(back, fill); bar.position.y = 2.15; bar.visible = false;
      model.root.add(bar);
      const d = saved ? saved[i] : null;
      const e = { id: i, x: d ? d.x : s.x, z: d ? d.z : s.z, hx: s.x, hz: s.z, yaw: Math.random() * 6, hp: d ? d.hp : s.fast ? 55 : 40, maxHp: s.fast ? 55 : 40, bar, fill, fast: !!s.fast, state: 'idle', cd: 0, wanderT: Math.random() * 4, tx: s.x, tz: s.z, phase: Math.random() * 6, deadT: 0, hurtT: 0, model };
      model.root.position.set(e.x, 0, e.z); model.root.rotation.y = e.yaw;
      if (e.hp <= 0) { e.state = 'dead'; e.deadT = 99; model.root.visible = false; }
      return e;
    });
  }
  alive() { return this.list.filter((e) => e.state !== 'dead'); }

  // Player melee: hits every husk inside a cone in front of the player.
  meleeHit(x, z, yaw, range, damage) {
    let any = false;
    for (const e of this.list) {
      if (e.state === 'dead') continue;
      const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz);
      if (d > range) continue;
      const ang = Math.atan2(-dz, dx);
      let diff = Math.abs(((ang - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d > 0.8 && diff > 1.15) continue;
      this.hurt(e, damage, dx / (d || 1), dz / (d || 1));
      any = true;
    }
    if (any) this.game.events.emit('sfx', 'hit');
  }
  hurt(e, damage, kx = 0, kz = 0) {
    e.hp -= damage; e.hurtT = 0.2; e.state = e.hp > 0 ? 'chase' : 'dead';
    e.x += kx * 0.5; e.z += kz * 0.5;
    e.bar.visible = e.hp > 0; e.fill.scale.x = 0.9 * Math.max(0, e.hp / e.maxHp);
    this.game.particles?.burst(e.x, 1.2, e.z, 7, { color: 0x4a2a22, speed: 2.2, size: 0.55, life: 0.5, alpha: 0.7 });
    if (e.hp <= 0) { e.deadT = 0; this.game.events.emit('kill', e); }
  }

  update(dt) {
    const { player, vehicle, physics, survival, env } = this.game;
    const tx = player.x, tz = player.z;
    const notice = (player.driving ? 17 : 12) + env.darkness * 6;
    const carCircles = vehicle.circles(), carSpeed = Math.hypot(vehicle.vx, vehicle.vz);
    for (const e of this.list) {
      const dx = tx - e.x, dz = tz - e.z, dist = Math.hypot(dx, dz);
      if (dist > 90) continue; // too far away to matter
      const m = e.model;
      if (e.state === 'dead') {
        e.deadT += dt;
        if (m.pack) { m.play('Death', { once: true }); m.update(dt); m.root.position.set(e.x, 0, e.z); e.bar.visible = false; }
        else { m.root.rotation.z = Math.min(Math.PI / 2, e.deadT * 6); m.root.position.set(e.x, 0.15, e.z); }
        if (e.deadT > 25) m.root.visible = false;
        continue;
      }
      if (e.state === 'idle' && dist < notice && !survival.dead) e.state = 'chase';
      if (e.state === 'chase' && (dist > 34 || survival.dead)) e.state = 'idle';

      let speed = 0, gx = e.x, gz = e.z;
      if (e.state === 'chase') { gx = tx; gz = tz; speed = e.fast ? 5.4 : 3.3; }
      else {
        e.wanderT -= dt;
        if (e.wanderT <= 0) { e.wanderT = 3 + Math.random() * 5; e.tx = e.hx + (Math.random() - 0.5) * 12; e.tz = e.hz + (Math.random() - 0.5) * 12; }
        gx = e.tx; gz = e.tz; speed = 1.0;
      }
      const gdx = gx - e.x, gdz = gz - e.z, gd = Math.hypot(gdx, gdz);
      const reach = player.driving ? 2.4 : 1.25;
      let moving = false;
      const px = e.x, pz = e.z;
      if (gd > (e.state === 'chase' ? reach * 0.85 : 0.6)) {
        // walk at the goal; while a detour is active, walk sideways around whatever blocked the way
        let dirX = gdx / gd, dirZ = gdz / gd;
        if (e.detourT > 0) { e.detourT -= dt; const s = e.detourSide; [dirX, dirZ] = [dirX * 0.25 - dirZ * s, dirZ * 0.25 + dirX * s]; }
        e.x += dirX * speed * dt; e.z += dirZ * speed * dt;
        e.yaw = dampAngle(e.yaw, Math.atan2(-dirZ, dirX), 8, dt);
        moving = true;
      }
      // attack
      e.cd -= dt;
      if (e.state === 'chase' && dist < reach + 0.2 && e.cd <= 0) {
        e.cd = 1.15;
        e.hurtT = -0.25; // reuse as a lunge timer
        if (m.pack) m.play('Punch', { once: true, duration: 0.55, restart: true, fade: 0.06 });
        if (player.driving) vehicle.damageChassis(1.5); else survival.damage(e.fast ? 12 : 9, 'a husk');
        this.game.events.emit('sfx', 'bite');
      }
      // keep apart from each other
      for (const o of this.list) {
        if (o === e || o.state === 'dead') continue;
        const sx = e.x - o.x, sz = e.z - o.z, sd = Math.hypot(sx, sz);
        if (sd < 0.9 && sd > 0.001) { e.x += (sx / sd) * (0.9 - sd) * 0.5; e.z += (sz / sd) * (0.9 - sd) * 0.5; }
      }
      // the truck: run over at speed, otherwise a solid obstacle
      for (const c of carCircles) {
        const cx = e.x - c.x, cz = e.z - c.z, cd = Math.hypot(cx, cz), rr = RADIUS + c.r;
        if (cd >= rr) continue;
        if (carSpeed > 4.5) {
          this.hurt(e, 999, cx / (cd || 1), cz / (cd || 1));
          vehicle.vx *= 0.93; vehicle.vz *= 0.93;
          vehicle.damageChassis(vehicle.slots.bumper ? 0.5 : 2.5);
          this.game.events.emit('sfx', 'crash');
          break;
        }
        e.x += (cx / (cd || 1)) * (rr - cd); e.z += (cz / (cd || 1)) * (rr - cd);
      }
      if (e.state === 'dead') continue;
      const p = physics.resolve({ x: e.x, z: e.z }, RADIUS);
      e.x = p.x; e.z = p.z;
      // stuck check: if a wall ate most of this step for a while, start a sideways detour
      if (moving && Math.hypot(e.x - px, e.z - pz) < speed * dt * 0.35) {
        e.stuckT = (e.stuckT || 0) + dt;
        if (e.stuckT > 0.3 && !(e.detourT > 0)) { e.detourT = 0.9 + Math.random() * 0.6; e.detourSide = -(e.detourSide || (Math.random() < 0.5 ? 1 : -1)); e.stuckT = 0; }
      } else e.stuckT = 0;

      e.phase += dt * (e.state === 'chase' ? 10 : 5);
      m.root.position.set(e.x, 0, e.z);
      m.root.rotation.y = e.yaw;
      if (e.hurtT > 0) e.hurtT -= dt; else if (e.hurtT < 0) e.hurtT = Math.min(0, e.hurtT + dt);
      if (m.pack) {
        e.attackAnim = Math.max(0, (e.attackAnim || 0) - dt);
        if (e.hurtT < 0) e.attackAnim = 0.5; // let the punch finish before walking again
        if (e.hurtT > 0) m.play('HitReact', { fade: 0.05 });
        else if (e.attackAnim <= 0) m.play(moving ? (e.state === 'chase' ? (e.fast ? 'Run' : 'Run_Arms') : 'Walk') : 'Idle');
        m.update(dt);
      } else {
        animateWalk(m, e.phase, moving ? 1 : 0);
        m.body.rotation.z = -0.18 + (e.hurtT > 0 ? 0.5 : e.hurtT < 0 ? -0.45 : 0);
      }
    }
  }
  toJSON() { return this.list.map((e) => ({ x: e.x, z: e.z, hp: e.hp })); }
}
