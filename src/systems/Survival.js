// Health, hunger, thirst and stamina. Rates are per second and tuned for an 8 minute day.
import { clamp } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { regionAt } from '../data/layout.js';

export const RATES = { hunger: 100 / 900, thirst: 100 / 720, starve: 1.5, staminaRun: 16, staminaRegen: 11, regen: 0.35, toxic: 6 };

export class Survival {
  constructor(game) {
    this.game = game;
    this.health = 100; this.hunger = 80; this.thirst = 75; this.stamina = 100;
    this.dead = false;
    this.toxicNow = false;
  }
  update(dt) {
    if (this.dead) return;
    const { player } = this.game;
    this.hunger = clamp(this.hunger - RATES.hunger * dt, 0, 100);
    this.thirst = clamp(this.thirst - RATES.thirst * dt, 0, 100);
    if (this.hunger <= 0) this.damage(RATES.starve * dt, 'hunger');
    if (this.thirst <= 0) this.damage(RATES.starve * dt, 'thirst');
    if (this.hunger > 50 && this.thirst > 50) this.health = clamp(this.health + RATES.regen * dt, 0, 100);
    if (player.running) this.stamina = clamp(this.stamina - RATES.staminaRun * dt, 0, 100);
    else this.stamina = clamp(this.stamina + RATES.staminaRegen * (this.thirst > 15 ? 1 : 0.4) * dt, 0, 100);
    // The Dead Stretch poisons anyone outside a vehicle.
    this.toxicNow = !player.driving && regionAt(player.x, player.z) === 'stretch';
    if (this.toxicNow) this.damage(RATES.toxic * dt, 'toxic dust');
  }
  damage(amount, cause) {
    if (this.dead) return;
    this.health = clamp(this.health - amount, 0, 100);
    if (this.health <= 0) { this.dead = true; this.game.events.emit('death', cause); }
  }
  // Eat, drink or heal with an inventory item. Returns true if it was used.
  consume(id) {
    const def = ITEMS[id], inv = this.game.inventory;
    if (!['food', 'drink', 'med'].includes(def.kind) || !inv.remove(id, 1)) return false;
    if (def.hunger) this.hunger = clamp(this.hunger + def.hunger, 0, 100);
    if (def.thirst) this.thirst = clamp(this.thirst + def.thirst, 0, 100);
    if (def.heal) this.health = clamp(this.health + def.heal, 0, 100);
    if (def.health) this.damage(-def.health, 'bad water');
    this.game.events.emit('toast', `${def.kind === 'drink' ? 'Drank' : def.kind === 'med' ? 'Used' : 'Ate'} ${def.name.toLowerCase()}`);
    return true;
  }
  toJSON() { return { health: this.health, hunger: this.hunger, thirst: this.thirst, stamina: this.stamina }; }
  load(d) { Object.assign(this, d); this.dead = false; }
}
