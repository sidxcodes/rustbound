// Save and load to the browser's localStorage. Every access is guarded because
// storage can be blocked (private windows, some embedded previews).
const KEY = 'rustbound.save.v1';

export class SaveLoad {
  constructor(game) { this.game = game; this.timer = 0; }

  snapshot() {
    const g = this.game;
    return {
      v: 1, savedAt: Date.now(),
      player: g.player.toJSON(), survival: g.survival.toJSON(), inventory: g.inventory.toJSON(),
      vehicle: g.vehicle.toJSON(), enemies: g.enemies.toJSON(),
      containers: g.world.containers.map((c) => ({ id: c.id, items: c.items.map((e) => ({ ...e })), searched: c.searched })),
      pumpReserve: g.world.pumpReserve, barricade: g.world.barricade.broken,
      time: g.env.time, day: g.env.day, flags: { ...g.flags }, objectives: { ...g.objectives.state },
    };
  }
  apply(d) {
    const g = this.game;
    g.world.reset();
    g.inventory.items = d.inventory.map((e) => ({ ...e }));
    g.survival.load(d.survival);
    g.vehicle.load(d.vehicle);
    g.player.load(d.player);
    g.enemies.reset(d.enemies);
    for (const s of d.containers) {
      const c = g.world.containers.find((x) => x.id === s.id);
      if (c) { c.items = s.items; c.searched = s.searched; }
    }
    g.world.pumpReserve = d.pumpReserve;
    if (d.barricade) g.world.setBarricadeBroken();
    g.env.time = d.time; g.env.day = d.day;
    g.flags = { ...d.flags }; g.objectives.state = { ...d.objectives };
  }
  hasSave() { try { return !!localStorage.getItem(KEY); } catch { return false; } }
  save(silent = false) {
    if (this.game.survival.dead || this.game.state !== 'playing') return false;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.snapshot()));
      if (!silent) this.game.events.emit('toast', 'Game saved');
      return true;
    } catch {
      if (!silent) this.game.events.emit('toast', 'Could not save: browser storage is blocked');
      return false;
    }
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      this.apply(JSON.parse(raw));
      return true;
    } catch { return false; }
  }
  clear() { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } }
  update(dt) {
    this.timer += dt;
    if (this.timer > 30) { this.timer = 0; this.save(true); }
  }
}
