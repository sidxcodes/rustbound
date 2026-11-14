// The goal chain for the first playable. Each step is a check on real game state,
// so it does not matter in which order the player does things.
import { OUTPOST, STATION } from '../data/layout.js';
import { MIN_ENGINE_COND } from './Vehicle.js';

export const OBJECTIVES = [
  { id: 'wrench', text: 'Find a pipe wrench in the garage', done: (g) => g.inventory.has('wrench') || g.vehicle.trunk.has('wrench') || g.flags.hadWrench },
  { id: 'wheels', text: 'Fit the two missing wheels', done: (g) => g.vehicle.wheelsFitted() === 4 },
  { id: 'engine', text: `Repair the engine to ${MIN_ENGINE_COND}% or more`, hint: 'Craft a repair kit: 3 scrap + 1 tape', done: (g) => g.vehicle.slots.engine && g.vehicle.slots.engine.cond >= MIN_ENGINE_COND },
  { id: 'battery', text: 'Find a battery and fit it', hint: 'Follow the dirt path north to the forest cabin', done: (g) => !!g.vehicle.slots.battery },
  { id: 'fuel', text: 'Put fuel in the tank', done: (g) => g.vehicle.fuel > 0.5 || g.flags.drove },
  { id: 'station', text: 'Drive east to the fuel station', done: (g) => g.flags.reachedStation },
  { id: 'upgrade', text: 'Find a radiator and a bull bar in Harlow and fit them', hint: 'The town workshop is past the fuel station', done: (g) => !!g.vehicle.slots.radiator && !!g.vehicle.slots.bumper },
  { id: 'barricade', text: 'Ram through the barricade east of town', done: (g) => g.world.barricade.broken },
  { id: 'outpost', text: 'Cross the Dead Stretch to Ridge Outpost', hint: 'Stay in the truck. The dust kills on foot', done: (g) => g.flags.won },
];

export class Objectives {
  constructor(game) { this.game = game; this.state = {}; }
  update() {
    const g = this.game, { player, vehicle } = g;
    if (g.inventory.has('wrench')) g.flags.hadWrench = true;
    if (player.driving && Math.abs(vehicle.speed()) > 3) g.flags.drove = true;
    if (player.driving && Math.hypot(vehicle.x - STATION.x, vehicle.z - STATION.z) < STATION.r) g.flags.reachedStation = true;
    if (!g.flags.won && Math.hypot(player.x - OUTPOST.x, player.z - OUTPOST.z) < OUTPOST.r) { g.flags.won = true; g.events.emit('win'); }
    for (const o of OBJECTIVES) {
      const now = !!o.done(g);
      if (now && !this.state[o.id]) { this.state[o.id] = true; g.events.emit('objective', o); }
    }
  }
  list() { return OBJECTIVES.map((o) => ({ ...o, complete: !!this.state[o.id] })); }
  current() { return OBJECTIVES.find((o) => !this.state[o.id]) || null; }
}
