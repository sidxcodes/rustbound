// Top-down follow camera. Q/E rotate in 45 degree steps, mouse wheel zooms,
// C switches to a chase camera while driving.
import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/util.js';

export class CameraRig {
  constructor(game) {
    this.game = game;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
    this.yawTarget = 0; this.yaw = 0;   // 0 = looking north (W walks toward -z)
    this.zoom = 25; this.dist = 25;
    this.target = new THREE.Vector3();
    this.chase = false;
    this.pitch = 0.98; // radians above the horizon, about 56 degrees
  }
  groundForward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }

  update(dt, snap = false) {
    if (snap) dt = 1; // with the huge rates below, one second is enough to land exactly on target
    const { input, player, vehicle } = this.game;
    if (input.hit('KeyQ')) this.yawTarget += Math.PI / 4;
    if (input.hit('KeyE') && !this.game.interaction.usesE) this.yawTarget -= Math.PI / 4;
    if (input.hit('KeyC') && player.driving) this.chase = !this.chase;
    if (input.wheel) this.zoom = clamp(this.zoom + input.wheel * 2, 11, 38);

    const driving = player.driving;
    const speed = driving ? Math.hypot(vehicle.vx, vehicle.vz) : 0;
    let tx = player.x, tz = player.z, ty = 1, wantDist = this.zoom, wantPitch = 0.98, wantYaw = this.yawTarget;
    if (driving) {
      // look ahead of the truck so there is room to react
      tx += vehicle.vx * 0.55; tz += vehicle.vz * 0.55;
      wantDist = this.zoom + 6 + speed * 0.55;
      if (this.chase) { wantYaw = vehicle.yaw - Math.PI / 2; wantPitch = 0.42; wantDist = 11 + speed * 0.25; ty = 1.6; }
    }
    const k = snap ? 1e6 : 1;
    this.yaw = dampAngle(this.yaw, wantYaw, (this.chase && driving ? 4 : 7) * k, dt);
    this.dist = damp(this.dist, wantDist, 4 * k, dt);
    this.pitch = damp(this.pitch, wantPitch, 4 * k, dt);
    this.target.set(damp(this.target.x, tx, 7 * k, dt), ty, damp(this.target.z, tz, 7 * k, dt));

    const f = this.groundForward();
    const h = Math.cos(this.pitch) * this.dist, v = Math.sin(this.pitch) * this.dist;
    this.camera.position.set(this.target.x - f.x * h, this.target.y + v, this.target.z - f.z * h);
    this.camera.lookAt(this.target);
  }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
}
