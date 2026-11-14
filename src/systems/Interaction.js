// Works out what the player can interact with right now and handles E and F.
import { ITEMS } from '../data/items.js';

export class Interaction {
  constructor(game) {
    this.game = game;
    this.prompt = '';
    this.usesE = false; // true when E has a target, so the camera does not also rotate
    this.target = null;
  }
  update() {
    const { player, world, input, ui, vehicle, survival } = this.game;
    this.target = null; this.prompt = ''; this.usesE = false;
    world.setRing(null);
    if (survival.dead || ui.panel) return;
    if (player.driving) {
      this.prompt = '<kbd>F</kbd> Get out';
      if (input.hit('KeyF')) player.exitVehicle();
      return;
    }
    const nearTruck = player.nearVehicle();
    const container = world.nearestContainer(player.x, player.z);
    const pump = world.nearestPump(player.x, player.z);
    if (nearTruck) {
      this.target = { type: 'vehicle' };
      this.prompt = '<kbd>E</kbd> Open truck panel &nbsp; <kbd>F</kbd> Drive';
    } else if (container) {
      this.target = { type: 'container', container };
      this.prompt = `<kbd>E</kbd> Search ${container.name.toLowerCase()}${container.searched && !container.items.length ? ' (empty)' : ''}`;
    } else if (pump) {
      this.target = { type: 'pump', pump };
      this.prompt = `<kbd>E</kbd> Use fuel pump (${Math.round(world.pumpReserve)} L left)`;
    }
    this.usesE = !!this.target;
    if (!this.target) return;
    if (nearTruck) world.setRing(vehicle.x, vehicle.z, 6.4);
    else if (container) world.setRing(container.x, container.z, container.collider.type === 'box' ? container.collider.reach * 2 + 1.4 : 2.2);
    else world.setRing(pump.x, pump.z, 2.2);
    if (input.hit('KeyE')) {
      if (this.target.type === 'vehicle') ui.open('vehicle');
      else if (this.target.type === 'container') { ui.open('loot', container); this.game.events.emit('sfx', 'open'); }
      else if (this.target.type === 'pump') this.usePump();
    }
    if (nearTruck && input.hit('KeyF')) player.enterVehicle();
  }

  // Fill the truck if it is parked at the pump, then every empty can in the backpack.
  usePump() {
    const { world, vehicle, inventory, events, player } = this.game;
    if (world.pumpReserve <= 0.05) { events.emit('toast', 'The pump is dry'); return; }
    const done = [];
    const cap = vehicle.stats().capacity;
    if (cap && Math.hypot(vehicle.x - player.x, vehicle.z - player.z) < 8) {
      const add = Math.min(cap - vehicle.fuel, world.pumpReserve);
      if (add > 0.05) { vehicle.fuel += add; world.pumpReserve -= add; done.push(`truck +${add.toFixed(1)} L`); }
    }
    let cans = 0;
    while (inventory.has('empty_can') && world.pumpReserve >= ITEMS.fuel_can.litres) {
      // swap first, and swap back if the full can is too heavy to carry
      inventory.remove('empty_can', 1);
      if (!inventory.add({ id: 'fuel_can', qty: 1 })) { inventory.add({ id: 'empty_can', qty: 1 }); break; }
      world.pumpReserve -= ITEMS.fuel_can.litres; cans++;
    }
    if (cans) done.push(`filled ${cans} can${cans > 1 ? 's' : ''}`);
    events.emit('toast', done.length ? `Pump: ${done.join(', ')}` : 'Nothing to fill. Park the truck here or bring empty cans');
    if (done.length) events.emit('sfx', 'pour');
  }
}
