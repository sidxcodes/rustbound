// Item storage used by the player backpack, the truck trunk and loot containers.
// An entry is { id, qty } for stackables or { id, qty: 1, cond } for truck parts.
import { ITEMS } from '../data/items.js';

export class Inventory {
  constructor(maxWeight = Infinity, items = []) {
    this.maxWeight = maxWeight;
    this.items = items;
  }
  weight() { return this.items.reduce((s, e) => s + ITEMS[e.id].w * e.qty, 0); }
  count(id) { return this.items.reduce((s, e) => s + (e.id === id ? e.qty : 0), 0); }
  has(id, qty = 1) { return this.count(id) >= qty; }
  canAdd(entry) { return this.weight() + ITEMS[entry.id].w * entry.qty <= this.maxWeight + 1e-6; }

  // Adds an entry. Returns false (and adds nothing) if it would exceed the weight limit.
  add(entry) {
    if (!this.canAdd(entry)) return false;
    const def = ITEMS[entry.id];
    if (def.stack && entry.cond == null) {
      const existing = this.items.find((e) => e.id === entry.id);
      if (existing) { existing.qty += entry.qty; return true; }
    }
    this.items.push({ ...entry });
    return true;
  }
  // Removes qty of an item id. Returns true if all were removed.
  remove(id, qty = 1) {
    if (!this.has(id, qty)) return false;
    for (let i = this.items.length - 1; i >= 0 && qty > 0; i--) {
      const e = this.items[i];
      if (e.id !== id) continue;
      const take = Math.min(qty, e.qty);
      e.qty -= take; qty -= take;
      if (e.qty <= 0) this.items.splice(i, 1);
    }
    return true;
  }
  removeEntry(entry) {
    const i = this.items.indexOf(entry);
    if (i >= 0) this.items.splice(i, 1);
  }
  // Move one entry (whole stack) to another inventory. Returns true on success.
  moveTo(entry, other) {
    if (!this.items.includes(entry) || !other.add(entry)) return false;
    this.removeEntry(entry);
    return true;
  }
  toJSON() { return this.items.map((e) => ({ ...e })); }
}
