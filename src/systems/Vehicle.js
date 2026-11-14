// The truck: modular parts, derived stats, driving physics, fuel, heat and damage.
//
// Driving model: a single rigid body on flat ground (position, yaw, velocity, yaw rate)
// with a two-axle tyre model. Each axle makes a sideways friction force that tries to cancel
// its sideways slip, limited by grip x load. That limit is what makes the truck understeer,
// slide on worn tyres and drift with the handbrake.
import { clamp, damp } from '../core/util.js';
import { ITEMS, VEHICLE_SLOTS } from '../data/items.js';
import { buildTruck, WHEEL_POS } from '../models/models.js';
import { onRoad, TRUCK_START } from '../data/layout.js';
import { Inventory } from './Inventory.js';
import { Physics } from './Physics.js';

const MASS = 1250, INERTIA = 2100, AXLE = 1.38, G = 9.81;
const ENGINE_FORCE = 5600, BRAKE_FORCE = 9000, DRAG = 8, ROLL = 30;
const BODY_CIRCLES = [-1.45, 0, 1.45], BODY_R = 0.98;
export const MIN_ENGINE_COND = 25;

export class Vehicle {
  constructor(game) {
    this.game = game;
    this.model = buildTruck();
    game.scene.add(this.model.root);
    this.reset();
  }

  reset() {
    this.x = TRUCK_START.x; this.z = TRUCK_START.z; this.yaw = TRUCK_START.yaw;
    this.vx = 0; this.vz = 0; this.w = 0; this.steer = 0;
    this.slots = {
      engine: { id: 'engine_i4', cond: 12 }, battery: null, radiator: null, tank: { id: 'fuel_tank', cond: 70 },
      wheelFL: { id: 'wheel_worn', cond: 45 }, wheelFR: null, wheelRL: null, wheelRR: { id: 'wheel_worn', cond: 50 },
      bumper: null, lights: { id: 'headlights', cond: 60 }, rack: null,
    };
    this.fuel = 0; this.temp = 25; this.chassis = 100;
    this.engineOn = false; this.throttle = 0; this.odometer = 0;
    this.trunk = new Inventory(30);
    this.roll = 0; this.pitch = 0; this.wheelSpin = 0; this.hood = 0;
    this.overheatWarned = false;
    this.syncParts();
  }

  // ---------- parts ----------
  part(slot) { return this.slots[slot]; }
  def(slot) { return this.slots[slot] ? ITEMS[this.slots[slot].id] : null; }
  wheelsFitted() { return ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'].filter((s) => this.slots[s]).length; }

  // Why the truck will not start, in the player's words. Empty array means ready.
  startBlockers() {
    const out = [];
    const e = this.slots.engine;
    if (!e) out.push('No engine');
    else if (e.cond < MIN_ENGINE_COND) out.push(`Engine is seized (${Math.round(e.cond)}%). Repair it to ${MIN_ENGINE_COND}% or more`);
    if (!this.slots.battery) out.push('No battery');
    const missing = 4 - this.wheelsFitted();
    if (missing) out.push(`${missing} wheel${missing > 1 ? 's' : ''} missing`);
    if (!this.slots.tank) out.push('No fuel tank');
    else if (this.fuel <= 0.01) out.push('Fuel tank is empty');
    if (this.chassis <= 0) out.push('Chassis is wrecked. Patch it with a repair kit');
    if (this.temp >= 125) out.push('Engine is too hot. Let it cool');
    return out;
  }

  stats() {
    const e = this.slots.engine;
    const power = e && e.cond >= MIN_ENGINE_COND ? ITEMS[e.id].power * (0.35 + 0.65 * (e.cond / 100)) : 0;
    let grip = 0, offroad = 0, n = 0;
    for (const s of ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR']) {
      const p = this.slots[s];
      if (!p) continue;
      grip += ITEMS[p.id].grip * (0.6 + 0.4 * (p.cond / 100)); offroad += ITEMS[p.id].offroad; n++;
    }
    grip = n ? grip / n : 0; offroad = n ? offroad / n : 0;
    const force = ENGINE_FORCE * power;
    const topSpeed = (-ROLL + Math.sqrt(ROLL * ROLL + 4 * DRAG * force)) / (2 * DRAG); // m/s on the road
    const capacity = this.slots.tank ? ITEMS[this.slots.tank.id].capacity : 0;
    const storage = 30 + (this.slots.rack ? ITEMS[this.slots.rack.id].storage : 0);
    return { power, grip, offroad, topSpeed, capacity, storage, cooling: this.slots.radiator ? 0.045 + 0.03 * (this.slots.radiator.cond / 100) : 0.02, ram: !!this.slots.bumper };
  }

  canInstall(slotId, entry) {
    const slot = VEHICLE_SLOTS.find((s) => s.id === slotId);
    return !!slot && !this.slots[slotId] && ITEMS[entry.id].slot === slot.accepts;
  }
  // Fit a part from the backpack. Needs the wrench.
  install(slotId, entry) {
    const { inventory, events } = this.game;
    if (!inventory.has('wrench')) { events.emit('toast', 'You need a pipe wrench to fit parts'); return false; }
    if (!this.canInstall(slotId, entry) || !inventory.items.includes(entry)) return false;
    inventory.removeEntry(entry);
    this.slots[slotId] = { id: entry.id, cond: entry.cond ?? 100 };
    this.syncParts();
    events.emit('toast', `Fitted ${ITEMS[entry.id].name.toLowerCase()}`);
    events.emit('sfx', 'fit');
    return true;
  }
  removePart(slotId) {
    const { inventory, events } = this.game, p = this.slots[slotId];
    if (!p) return false;
    if (ITEMS[p.id].fixed) { events.emit('toast', `${ITEMS[p.id].name} is too heavy to remove by hand`); return false; }
    if (!inventory.has('wrench')) { events.emit('toast', 'You need a pipe wrench to remove parts'); return false; }
    if (!inventory.add({ id: p.id, qty: 1, cond: p.cond })) { events.emit('toast', 'Too heavy to carry'); return false; }
    this.slots[slotId] = null;
    if (this.startBlockers().length) this.engineOn = false;
    this.syncParts();
    events.emit('toast', `Removed ${ITEMS[p.id].name.toLowerCase()}`);
    events.emit('sfx', 'fit');
    return true;
  }
  // Spend one repair kit on a part, or on the chassis with slotId 'chassis'.
  repair(slotId) {
    const { inventory, events } = this.game;
    const target = slotId === 'chassis' ? null : this.slots[slotId];
    if (slotId !== 'chassis' && !target) return false;
    const current = target ? target.cond : this.chassis;
    if (current >= 100) { events.emit('toast', 'Already in perfect condition'); return false; }
    if (!inventory.remove('repair_kit', 1)) { events.emit('toast', 'You need a repair kit (3 scrap + 1 tape)'); return false; }
    const next = clamp(current + ITEMS.repair_kit.repair, 0, 100);
    if (target) target.cond = next; else this.chassis = next;
    events.emit('toast', `Repaired to ${Math.round(next)}%`);
    events.emit('sfx', 'fit');
    return true;
  }
  // Pour one fuel can into the tank.
  refuel() {
    const { inventory, events } = this.game, cap = this.stats().capacity;
    if (!cap) return false;
    if (this.fuel >= cap - 0.05) { events.emit('toast', 'Tank is full'); return false; }
    if (!inventory.remove('fuel_can', 1)) { events.emit('toast', 'No fuel cans in your backpack'); return false; }
    this.fuel = clamp(this.fuel + ITEMS.fuel_can.litres, 0, cap);
    inventory.add({ id: 'empty_can', qty: 1 });
    events.emit('toast', `Fuel: ${this.fuel.toFixed(1)} L`);
    events.emit('sfx', 'pour');
    return true;
  }

  syncParts() {
    const m = this.model, s = this.slots;
    for (const id of Object.keys(WHEEL_POS)) m.setWheel(id, s[id] ? s[id].id : null);
    m.engine.visible = !!s.engine; m.battery.visible = !!s.battery; m.radiator.visible = !!s.radiator;
    m.bullbar.visible = !!s.bumper; m.stockBumper.visible = !s.bumper;
    m.rack.visible = !!s.rack; m.lamps.visible = !!s.lights;
    this.trunk.maxWeight = this.stats().storage;
  }

  // ---------- driving ----------
  forward() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }
  speed() { const f = this.forward(); return this.vx * f.x + this.vz * f.z; }
  circles() {
    const f = this.forward();
    return BODY_CIRCLES.map((o) => ({ x: this.x + f.x * o, z: this.z + f.z * o, r: BODY_R, o }));
  }
  tryStart() {
    const blockers = this.startBlockers();
    if (blockers.length) { this.game.events.emit('toast', `Won't start: ${blockers[0]}`); this.game.events.emit('sfx', 'fail'); return false; }
    this.engineOn = true;
    this.game.events.emit('sfx', 'start');
    return true;
  }

  // controls: { throttle: -1..1, steer: -1..1 (left positive), handbrake: bool } or null when nobody is driving
  update(dt, controls) {
    if (!(dt > 0)) { this.syncMesh(0); return; } // a zero-length frame must not reach the physics (it divides by dt)
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h, controls);
    this.updateEngine(dt, controls);
    this.syncMesh(dt);
  }

  step(h, controls) {
    const st = this.stats();
    const road = onRoad(this.x, this.z);
    const surface = road ? 1 : 0.5 + 0.5 * st.offroad;
    const mu = 1.05 * st.grip * surface;
    const f = this.forward(), r = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    let vf = this.vx * f.x + this.vz * f.z, vr = this.vx * r.x + this.vz * r.z;

    let throttle = 0, steerIn = 0, handbrake = !controls;
    if (controls) { throttle = controls.throttle; steerIn = controls.steer; handbrake = controls.handbrake; }
    this.braking = !!controls && (handbrake || (throttle < 0 && vf > 0.6) || (throttle > 0 && vf < -0.6));
    const steerMax = 0.62 / (1 + Math.abs(vf) / 9);
    this.steer = damp(this.steer, steerIn * steerMax, 9, h);
    const d = this.steer, cd = Math.cos(d), sd = Math.sin(d);

    // longitudinal force at the rear axle
    const running = this.engineOn && st.power > 0;
    const overheat = this.temp >= 110 ? 0.5 : 1;
    let Fx = 0;
    this.throttle = 0;
    if (running && throttle > 0) { Fx = ENGINE_FORCE * st.power * overheat * throttle; this.throttle = throttle; }
    else if (throttle < 0) {
      if (vf > 0.6) Fx = -BRAKE_FORCE; // S brakes first
      else if (running) { Fx = -ENGINE_FORCE * st.power * overheat * 0.55 * (vf > -7 ? 1 : 0); this.throttle = 0.5; }
    }
    if (controls && throttle > 0 && vf < -0.6) Fx = BRAKE_FORCE;
    const load = (MASS * G) / 2;
    Fx = clamp(Fx, -mu * load * 1.6, mu * load * 1.6);
    if (handbrake && Math.abs(vf) > 0.05) Fx += -Math.sign(vf) * Math.min(mu * load * 0.9, (Math.abs(vf) * MASS) / h);
    // resistance: rolling (higher off the road) and air
    const roll = ROLL * (road ? 1 : 3.2 - 1.4 * st.offroad);
    Fx += -vf * roll - DRAG * (road ? 1 : 2.4 - st.offroad) * vf * Math.abs(vf);
    if (!running && !handbrake) Fx += -Math.sign(vf) * Math.min(900, (Math.abs(vf) * MASS) / h); // engine braking when off

    // lateral tyre forces: cancel the sideways slip of each axle, up to the grip limit
    const latF = vf * sd + (vr - this.w * AXLE) * cd;
    const latR = vr + this.w * AXLE;
    const want = (lat) => (-lat * (MASS / 2)) / h * 0.5;
    const Ff = clamp(want(latF), -mu * load, mu * load);
    const rearGrip = mu * load * (handbrake && controls ? 0.4 : 1) * (1 - 0.35 * Math.min(1, Math.abs(Fx) / (mu * load * 1.6 + 1)));
    const Fr = clamp(want(latR), -rearGrip, rearGrip);

    // sum forces in the truck frame (f, r) and the yaw torque
    const aF = (Fx + Ff * sd) / MASS;
    const aR = (Ff * cd + Fr) / MASS;
    const alpha = (-AXLE * Ff * cd + AXLE * Fr) / INERTIA;
    vf += aF * h; vr += aR * h;
    this.w += alpha * h;
    this.w *= 1 - Math.min(1, 1.2 * h);
    if (Math.abs(vf) < 0.03 && Math.abs(vr) < 0.03 && !this.throttle) { vf = 0; vr = 0; this.w *= 0.8; }
    this.vx = f.x * vf + r.x * vr; this.vz = f.z * vf + r.z * vr;
    this.x += this.vx * h; this.z += this.vz * h;
    this.yaw += this.w * h;
    this.accF = aF; this.accR = aR;
    this.odometer += Math.abs(vf) * h;
    this.wheelSpin += (vf / 0.43) * h;

    // tyre wear
    const wear = Math.abs(vf) * h * (road ? 0.002 : 0.005);
    for (const s of ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR']) if (this.slots[s]) this.slots[s].cond = Math.max(5, this.slots[s].cond - wear);

    this.collide(st);
  }

  collide(st) {
    const { physics, world, events } = this.game;
    for (const o of BODY_CIRCLES) {
      const f = this.forward(), r = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
      const px = this.x + f.x * o, pz = this.z + f.z * o;
      for (const c of physics.statics) {
        const hit = Physics.contact(c, px, pz, BODY_R);
        if (!hit) continue;
        // velocity of the contact point, and its part along the normal
        const pvx = this.vx - o * this.w * r.x, pvz = this.vz - o * this.w * r.z;
        const vn = pvx * hit.nx + pvz * hit.nz;
        if (c.tag === 'barricade' && vn < -7.5 && st.ram && o > 0) {
          world.breakBarricade(Math.sign(this.vx) || 1);
          this.vx *= 0.72; this.vz *= 0.72;
          this.damageChassis(4);
          events.emit('toast', 'The bull bar smashes through the barricade');
          events.emit('sfx', 'crash');
          return;
        }
        this.x += hit.nx * hit.depth; this.z += hit.nz * hit.depth;
        if (vn < 0) {
          const nr = hit.nx * r.x + hit.nz * r.z;
          const k = 1 / MASS + (o * nr) * (o * nr) / INERTIA;
          const j = (-(1 + 0.15) * vn) / k;
          this.vx += (j * hit.nx) / MASS; this.vz += (j * hit.nz) / MASS;
          this.w += (-o * j * nr) / INERTIA;
          if (vn < -5) {
            this.damageChassis((-vn - 5) * 1.5 * (st.ram && o > 0 ? 0.4 : 1));
            this.game.particles?.burst(px, 0.8, pz, 10, { color: 0x8a8070, speed: 3, size: 1, life: 0.7 });
            events.emit('sfx', 'crash');
            if (c.tag === 'barricade') events.emit('toast', st.ram ? 'Hit it faster to break through' : 'The barricade holds. A bull bar would break it');
          }
        }
      }
    }
  }

  damageChassis(amount) {
    this.chassis = clamp(this.chassis - amount, 0, 100);
    if (this.chassis <= 0 && this.engineOn) { this.engineOn = false; this.game.events.emit('toast', 'The chassis is wrecked. Patch it with a repair kit'); }
  }

  updateEngine(dt, controls) {
    const st = this.stats(), { events } = this.game;
    if (this.engineOn) {
      this.fuel = Math.max(0, this.fuel - (0.008 + 0.2 * this.throttle * (0.6 + 0.4 * st.power)) * dt);
      this.temp += (0.4 + 3.2 * this.throttle) * dt;
      if (this.fuel <= 0) { this.engineOn = false; events.emit('toast', 'Out of fuel'); events.emit('sfx', 'fail'); }
    }
    this.temp -= (this.engineOn ? st.cooling : Math.max(st.cooling, 0.05)) * (this.temp - 25) * dt;
    if (this.temp >= 110 && this.engineOn) {
      if (this.slots.engine) this.slots.engine.cond = Math.max(0, this.slots.engine.cond - 2.5 * dt);
      if (!this.overheatWarned) { this.overheatWarned = true; events.emit('toast', this.slots.radiator ? 'Engine overheating. Ease off' : 'Engine overheating. It needs a radiator'); }
      if (this.temp >= 125 || (this.slots.engine && this.slots.engine.cond < MIN_ENGINE_COND)) { this.engineOn = false; events.emit('toast', 'The engine cuts out'); events.emit('sfx', 'fail'); }
    }
    if (this.temp < 100) this.overheatWarned = false;
    if (!controls) this.throttle = 0;
  }

  syncMesh(dt) {
    const m = this.model;
    m.root.position.set(this.x, 0, this.z);
    m.root.rotation.y = this.yaw;
    this.roll = damp(this.roll, clamp(-(this.accR || 0) * 0.012, -0.09, 0.09), 6, dt);
    this.pitch = damp(this.pitch, clamp((this.accF || 0) * 0.008, -0.05, 0.05), 6, dt);
    m.body.rotation.x = this.roll; m.body.rotation.z = this.pitch;
    const missing = 4 - this.wheelsFitted();
    m.body.position.y = damp(m.body.position.y, missing ? -0.1 : 0, 6, dt);
    for (const id of Object.keys(WHEEL_POS)) {
      const w = m.wheels[id];
      if (id.startsWith('wheelF')) w.pivot.rotation.y = this.steer;
      if (w.spin) w.spin.rotation.z = -this.wheelSpin;
    }
    const open = this.game.ui && this.game.ui.panel === 'vehicle' ? 1 : 0;
    this.hood = damp(this.hood, open, 7, dt);
    m.hoodPivot.rotation.z = this.hood * 1.05;
    const lit = this.engineOn && this.slots.lights && this.slots.battery && this.game.env.darkness > 0.35;
    m.lampMat.emissiveIntensity = lit ? 3 : 0;
    m.beam.intensity = lit ? 300 : 0;
    m.tailMat.emissiveIntensity = this.braking ? 3 : lit ? 0.8 : 0;
    this.emitParticles(dt);
  }

  emitParticles(dt) {
    const ps = this.game.particles;
    if (!ps) return;
    const f = this.forward(), r = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const speed = Math.hypot(this.vx, this.vz), slide = Math.abs(this.vx * r.x + this.vz * r.z);
    const road = onRoad(this.x, this.z);
    this.dustT = (this.dustT || 0) + dt * (road ? (slide > 2.5 ? slide * 5 : 0) : speed * 2.2 + slide * 5);
    while (this.dustT > 1) {
      this.dustT -= 1;
      const side = Math.random() < 0.5 ? -0.9 : 0.9;
      ps.emit(this.x - f.x * 1.4 + r.x * side, 0.25, this.z - f.z * 1.4 + r.z * side, { vx: -this.vx * 0.15 + (Math.random() - 0.5), vz: -this.vz * 0.15 + (Math.random() - 0.5), vy: 0.8, color: road ? 0x8a8a88 : this.x > 290 ? 0xc2a878 : 0x8f7d5c, size: 1.3 + Math.random(), life: 1.1, alpha: road ? 0.28 : 0.42, grow: 2 });
    }
    if (this.engineOn) {
      this.smokeT = (this.smokeT || 0) + dt * (5 + this.throttle * 14 + (this.temp > 105 ? 20 : 0));
      while (this.smokeT > 1) {
        this.smokeT -= 1;
        const hot = this.temp > 105 && Math.random() < 0.6;
        if (hot) ps.emit(this.x + f.x * 1.6, 1.2, this.z + f.z * 1.6, { vy: 1.6, color: 0xd8d8d8, size: 1.1, life: 1.4, alpha: 0.4, grow: 2.2 });
        else ps.emit(this.x - f.x * 2.35 + r.x * 0.62, 0.42, this.z - f.z * 2.35 + r.z * 0.62, { vx: -f.x * 1.5, vz: -f.z * 1.5, vy: 0.5, color: 0x3c3c3e, size: 0.5, life: 0.8, alpha: 0.3 + this.throttle * 0.15, grow: 2.4 });
      }
    }
  }

  toJSON() {
    return { x: this.x, z: this.z, yaw: this.yaw, slots: JSON.parse(JSON.stringify(this.slots)), fuel: this.fuel, temp: this.temp, chassis: this.chassis, trunk: this.trunk.toJSON(), odometer: this.odometer };
  }
  load(d) {
    this.x = d.x; this.z = d.z; this.yaw = d.yaw; this.vx = this.vz = this.w = 0;
    this.slots = d.slots; this.fuel = d.fuel; this.temp = d.temp; this.chassis = d.chassis; this.odometer = d.odometer || 0;
    this.trunk = new Inventory(30, d.trunk || []);
    this.engineOn = false;
    this.syncParts();
  }
}
