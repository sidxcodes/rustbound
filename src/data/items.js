// Every item in the game is defined here. Systems never hard-code item behaviour;
// they read these fields. Add an item by adding one entry.
export const ITEMS = {
  // tools and weapons
  wrench: { name: 'Pipe wrench', kind: 'weapon', tool: true, w: 1.5, damage: 22, desc: 'Fits and removes truck parts. Hits hard too.' },
  nail_bat: { name: 'Nail bat', kind: 'weapon', w: 1.8, damage: 34, desc: 'A plank with bad intentions.' },
  // materials
  scrap: { name: 'Scrap metal', kind: 'material', w: 0.5, stack: 20, desc: 'Crafting material.' },
  tape: { name: 'Duct tape', kind: 'material', w: 0.2, stack: 10, desc: 'Crafting material.' },
  cloth: { name: 'Cloth', kind: 'material', w: 0.1, stack: 20, desc: 'Crafting material.' },
  wood: { name: 'Plank', kind: 'material', w: 0.8, stack: 10, desc: 'Crafting material.' },
  // food, drink, medicine
  beans: { name: 'Canned beans', kind: 'food', w: 0.4, stack: 6, hunger: 35, desc: 'Restores 35 hunger.' },
  jerky: { name: 'Dried meat', kind: 'food', w: 0.2, stack: 6, hunger: 20, desc: 'Restores 20 hunger.' },
  water: { name: 'Clean water', kind: 'drink', w: 0.5, stack: 6, thirst: 40, desc: 'Restores 40 thirst.' },
  dirty_water: { name: 'Dirty water', kind: 'drink', w: 0.5, stack: 6, thirst: 25, health: -8, desc: 'Restores 25 thirst but costs 8 health. Filter it with cloth.' },
  bandage: { name: 'Bandage', kind: 'med', w: 0.1, stack: 6, heal: 30, desc: 'Restores 30 health.' },
  // vehicle care
  repair_kit: { name: 'Repair kit', kind: 'repair', w: 1, stack: 4, repair: 35, desc: 'Restores 35% condition on one truck part.' },
  fuel_can: { name: 'Fuel can (5 L)', kind: 'fuel', w: 4.5, stack: 4, litres: 5, desc: 'Pour into the tank from the truck panel.' },
  empty_can: { name: 'Empty fuel can', kind: 'material', w: 0.8, stack: 4, desc: 'Fill it at a fuel pump.' },
  // vehicle parts (each keeps its own condition, so they never stack)
  wheel_worn: { name: 'Worn road tyre', kind: 'part', slot: 'wheel', w: 9, grip: 0.82, offroad: 0.7, desc: 'Grip 82%. Poor off the road.' },
  wheel_offroad: { name: 'Off-road tyre', kind: 'part', slot: 'wheel', w: 11, grip: 1.0, offroad: 1.0, desc: 'Grip 100%. Keeps its grip on dirt and sand.' },
  battery: { name: 'Battery', kind: 'part', slot: 'battery', w: 8, desc: 'Needed to start the engine and run the lights.' },
  radiator: { name: 'Radiator', kind: 'part', slot: 'radiator', w: 6, desc: 'Stops the engine overheating.' },
  engine_i4: { name: 'Inline-4 engine', kind: 'part', slot: 'engine', w: 90, power: 1.0, fixed: true, desc: 'Too heavy to lift out by hand.' },
  fuel_tank: { name: 'Fuel tank (40 L)', kind: 'part', slot: 'tank', w: 20, capacity: 40, fixed: true, desc: 'Holds 40 litres.' },
  headlights: { name: 'Headlights', kind: 'part', slot: 'lights', w: 2, desc: 'Light the road at night.' },
  bullbar: { name: 'Bull bar', kind: 'part', slot: 'bumper', w: 14, desc: 'Steel front bar. Rams through barricades and protects the chassis.' },
  roof_rack: { name: 'Roof rack', kind: 'part', slot: 'rack', w: 7, storage: 30, desc: 'Adds 30 kg of trunk storage.' },
};

export const KIND_LABEL = {
  weapon: 'WPN', material: 'MAT', food: 'FOOD', drink: 'H2O', med: 'MED', repair: 'KIT', fuel: 'FUEL', part: 'PART',
};

// Truck slots: which item `slot` type fits, and whether the truck can drive without it.
export const VEHICLE_SLOTS = [
  { id: 'engine', label: 'Engine', accepts: 'engine', required: true },
  { id: 'battery', label: 'Battery', accepts: 'battery', required: true },
  { id: 'radiator', label: 'Radiator', accepts: 'radiator', required: false },
  { id: 'tank', label: 'Fuel tank', accepts: 'tank', required: true },
  { id: 'wheelFL', label: 'Front-left wheel', accepts: 'wheel', required: true },
  { id: 'wheelFR', label: 'Front-right wheel', accepts: 'wheel', required: true },
  { id: 'wheelRL', label: 'Rear-left wheel', accepts: 'wheel', required: true },
  { id: 'wheelRR', label: 'Rear-right wheel', accepts: 'wheel', required: true },
  { id: 'bumper', label: 'Front bumper', accepts: 'bumper', required: false },
  { id: 'lights', label: 'Headlights', accepts: 'lights', required: false },
  { id: 'rack', label: 'Roof rack', accepts: 'rack', required: false },
];

export const RECIPES = [
  { id: 'repair_kit', out: { id: 'repair_kit', qty: 1 }, needs: { scrap: 3, tape: 1 } },
  { id: 'bandage', out: { id: 'bandage', qty: 1 }, needs: { cloth: 2 } },
  { id: 'water', out: { id: 'water', qty: 1 }, needs: { dirty_water: 1, cloth: 1 } },
  { id: 'nail_bat', out: { id: 'nail_bat', qty: 1 }, needs: { wood: 1, scrap: 2, tape: 1 } },
];

// Random filler loot by container theme. Key items are placed by hand in world.js.
export const LOOT_TABLES = {
  junk: [['scrap', 1, 3, 0.8], ['tape', 1, 1, 0.3], ['cloth', 1, 2, 0.4], ['wood', 1, 2, 0.3]],
  food: [['beans', 1, 2, 0.6], ['jerky', 1, 2, 0.5], ['water', 1, 2, 0.5], ['dirty_water', 1, 1, 0.4]],
  home: [['cloth', 1, 3, 0.7], ['bandage', 1, 1, 0.35], ['beans', 1, 1, 0.4], ['water', 1, 1, 0.4], ['wood', 1, 2, 0.4]],
  car: [['scrap', 1, 3, 0.9], ['tape', 1, 1, 0.3], ['empty_can', 1, 1, 0.2]],
};
