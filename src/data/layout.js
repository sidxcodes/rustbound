// Handcrafted map. Units are metres. +x is east, +z is south. The main road runs east along z = ROAD_Z.
export const MAP = { minX: -80, maxX: 440, minZ: -90, maxZ: 90 };
export const ROAD_Z = 8;
export const ROAD_HALF = 4.2;
export const RIDGE_X = 292;          // rock ridge with the barricade in the road gap
export const STRETCH = { from: 297, to: 402 }; // the Dead Stretch: toxic on foot
export const OUTPOST = { x: 418, z: ROAD_Z, r: 11 };
export const STATION = { x: 112, z: -6, r: 16 };
export const TOWN = { x: 222, z: 4, r: 46 };
export const PLAYER_START = { x: -4, z: 1.5 };
export const TRUCK_START = { x: 2, z: -2.5, yaw: 0 };

// Buildings: centre, half-sizes, which wall has the door (n/s/e/w), wall colour.
export const BUILDINGS = [
  { id: 'garage', name: 'Scrapyard garage', x: -15, z: -7, hw: 6.5, hd: 5, door: 's', doorW: 4.2, color: 0x7a8588 },
  { id: 'cabin', name: 'Forest cabin', x: 40, z: -58, hw: 4.5, hd: 3.6, door: 's', doorW: 1.8, color: 0x6b4a32 },
  { id: 'shop', name: 'Fuel station shop', x: 112, z: -14, hw: 7, hd: 4.2, door: 's', doorW: 2.2, color: 0xb9b3a2 },
  { id: 'house1', name: 'House', x: 190, z: -9, hw: 5, hd: 4.2, door: 's', doorW: 1.8, color: 0xa39a84 },
  { id: 'house2', name: 'House', x: 206, z: 25, hw: 5.2, hd: 4.2, door: 'n', doorW: 1.8, color: 0x8f9a95 },
  { id: 'house3', name: 'House', x: 214, z: -10, hw: 4.6, hd: 4.4, door: 's', doorW: 1.8, color: 0x9c8672 },
  { id: 'workshop', name: 'Town workshop', x: 240, z: -11, hw: 7.5, hd: 5.4, door: 's', doorW: 4.4, color: 0x6f7a7c },
  { id: 'house4', name: 'House', x: 232, z: 26, hw: 5, hd: 4.4, door: 'n', doorW: 1.8, color: 0xa8a08e },
];

// Containers. `items` are guaranteed; `table` adds random filler (see LOOT_TABLES).
export const CONTAINERS = [
  // scrapyard: enough to get the truck rolling except the battery
  { id: 'toolbox', kind: 'toolbox', name: 'Toolbox', x: -19.5, z: -10.2, items: [['wrench', 1], ['tape', 2], ['scrap', 2]] },
  { id: 'garage_shelf', kind: 'shelf', name: 'Parts shelf', x: -11, z: -11, rot: 0, items: [['wheel_worn', 1, 55], ['cloth', 2], ['scrap', 1]] },
  { id: 'wreck_a', kind: 'wreck', name: 'Wrecked sedan', x: -32, z: 14, rot: 0.5, items: [['wheel_worn', 1, 40], ['scrap', 2]], table: 'car' },
  { id: 'yard_crate', kind: 'crate', name: 'Supply crate', x: -6.5, z: -3.5, items: [['beans', 1], ['water', 1], ['cloth', 2]] },
  { id: 'yard_barrel', kind: 'barrel', name: 'Oil drum', x: 9, z: -6, items: [['fuel_can', 1]] },
  { id: 'wreck_b', kind: 'wreck', name: 'Burnt-out van', x: -38, z: -12, rot: -0.9, items: [['scrap', 3], ['tape', 1]], table: 'car' },
  { id: 'yard_locker', kind: 'locker', name: 'Locker', x: -20.6, z: -5, rot: Math.PI / 2, items: [['bandage', 1], ['jerky', 1]] },
  { id: 'yard_crate2', kind: 'crate', name: 'Crate', x: 18, z: 20, items: [['wood', 2]], table: 'junk' },
  // forest cabin: the battery
  { id: 'cabin_shelf', kind: 'shelf', name: 'Cabin shelf', x: 37.2, z: -60.6, items: [['battery', 1, 80], ['beans', 1]] },
  { id: 'cabin_chest', kind: 'crate', name: 'Old chest', x: 43, z: -60, items: [['water', 1], ['dirty_water', 1], ['cloth', 2], ['wood', 2]] },
  // fuel station
  { id: 'shop_counter', kind: 'crate', name: 'Shop counter', x: 108, z: -15, items: [['water', 1], ['jerky', 1], ['tape', 1]], table: 'food' },
  { id: 'shop_shelf', kind: 'shelf', name: 'Shop shelf', x: 115, z: -17.2, items: [['empty_can', 1], ['bandage', 1], ['beans', 1]] },
  { id: 'shop_locker', kind: 'locker', name: 'Staff locker', x: 118.2, z: -13, rot: -Math.PI / 2, items: [['roof_rack', 1, 70], ['scrap', 2]] },
  { id: 'station_wreck', kind: 'wreck', name: 'Abandoned hatchback', x: 126, z: 3, rot: 0.2, items: [['fuel_can', 1]], table: 'car' },
  // town
  { id: 'h1_cupboard', kind: 'shelf', name: 'Cupboard', x: 187, z: -12.2, items: [['beans', 1], ['cloth', 1]], table: 'home' },
  { id: 'h2_chest', kind: 'crate', name: 'Chest', x: 208.5, z: 27.5, items: [['bandage', 1]], table: 'home' },
  { id: 'h3_cupboard', kind: 'shelf', name: 'Cupboard', x: 211.5, z: -13.4, items: [['water', 2]], table: 'food' },
  { id: 'h4_chest', kind: 'crate', name: 'Chest', x: 234, z: 28.5, items: [['jerky', 2], ['tape', 1]], table: 'home' },
  { id: 'ws_bench', kind: 'toolbox', name: 'Workbench', x: 234.5, z: -15.4, items: [['bullbar', 1, 85], ['repair_kit', 1]] },
  { id: 'ws_shelf', kind: 'shelf', name: 'Parts shelf', x: 244, z: -15.6, items: [['radiator', 1, 75], ['scrap', 3]] },
  { id: 'ws_rack', kind: 'tires', name: 'Tyre rack', x: 246.4, z: -9, items: [['wheel_offroad', 1, 90], ['wheel_offroad', 1, 85]] },
  { id: 'town_wreck', kind: 'wreck', name: 'Rolled pickup', x: 252, z: 24, rot: 1.1, items: [['wheel_offroad', 1, 70], ['wheel_offroad', 1, 65], ['fuel_can', 1]], table: 'car' },
  { id: 'town_barrel', kind: 'barrel', name: 'Oil drum', x: 226, z: -1.5, items: [['fuel_can', 1], ['empty_can', 1]] },
];

export const PUMPS = [{ id: 'pump1', x: 109.5, z: 0.5 }, { id: 'pump2', x: 114.5, z: 0.5 }];
export const PUMP_RESERVE = 60; // litres shared by both pumps

export const ENEMY_SPAWNS = [
  { x: 30, z: -46 }, { x: 50, z: -50 },
  { x: 104, z: -4 }, { x: 121, z: -8 }, { x: 116, z: 16 },
  { x: 184, z: 4 }, { x: 198, z: 18 }, { x: 208, z: -2 }, { x: 222, z: 14 }, { x: 236, z: 0 }, { x: 246, z: 16 }, { x: 252, z: -4 },
  { x: 318, z: 2, fast: true }, { x: 340, z: 16, fast: true }, { x: 362, z: 4, fast: true }, { x: 384, z: 12, fast: true },
];

// Decorative wrecks with collision but no loot.
export const DECOR_WRECKS = [
  { x: 14, z: -18, rot: 2.2 }, { x: -24, z: 24, rot: 1.4 }, { x: 60, z: 13.5, rot: 0.1 }, { x: 160, z: 3, rot: 2.9 },
  { x: 326, z: 14, rot: 0.7 }, { x: 352, z: 0.5, rot: 2.6 }, { x: 378, z: 15, rot: 1.9 },
];

export function onRoad(x, z) {
  if (x > -12 && Math.abs(z - ROAD_Z) < ROAD_HALF + 0.4) return true;
  // packed dirt pad in front of the garage
  return x > -22 && x < 12 && z > -3 && z < 12;
}
export function regionAt(x, z) {
  if (x >= STRETCH.from && x <= STRETCH.to) return 'stretch';
  if (x > STRETCH.to) return 'outpost';
  if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.r) return 'town';
  if (Math.hypot(x - STATION.x, z - STATION.z) < STATION.r + 6) return 'station';
  if (x < 34 && Math.abs(z) < 34) return 'scrapyard';
  if (z < -30 && x < 170) return 'forest';
  return 'wilds';
}
export const REGION_NAMES = {
  scrapyard: 'Scrapyard', forest: 'Pine forest', station: 'Fuel station', town: 'Harlow', stretch: 'The Dead Stretch', outpost: 'Ridge Outpost', wilds: 'Open country',
};
