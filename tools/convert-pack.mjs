// Converts the Quaternius "Zombie Apocalypse Kit" (CC0) glTF files into small .glb files in src/assets.
// Usage: node tools/convert-pack.mjs "<path to the unzipped kit folder>"
// Keeps only the animations the game uses, removes unused data, and quantizes vertex data.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize, resample, weld } from '@gltf-transform/functions';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const kit = process.argv[2];
if (!kit) { console.error('Pass the kit folder'); process.exit(1); }
const out = 'src/assets';
mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const SURVIVOR_ANIMS = ['Idle', 'Walk', 'Run', 'Punch', 'Slash', 'Death', 'HitReact'];
const ZOMBIE_ANIMS = ['Idle', 'Walk', 'Run', 'Run_Arms', 'Punch', 'Idle_Attack', 'Death', 'HitReact'];
const FILES = [
  ['Characters/glTF/Characters_Shaun.gltf', 'survivor', SURVIVOR_ANIMS],
  ['Characters/glTF/Zombie_Basic.gltf', 'zombie_basic', ZOMBIE_ANIMS],
  ['Characters/glTF/Zombie_Chubby.gltf', 'zombie_chubby', ZOMBIE_ANIMS],
  ['Vehicles/glTF/Vehicle_Pickup.gltf', 'pickup'],
  ['Vehicles/glTF/Vehicle_Pickup_Armored.gltf', 'pickup_armored'],
  ['Vehicles/glTF/Vehicle_Sports.gltf', 'car_sports'],
  ['Vehicles/glTF/Vehicle_Truck.gltf', 'car_truck'],
  ['Weapons/glTF/WoodenBat_Barbed.gltf', 'bat'],
  ...['Barrel', 'Chest', 'Chest_Special', 'CinderBlock', 'Container_Green', 'Container_Red', 'Couch', 'FireHydrant', 'Pallet', 'Pallet_Broken', 'Pipes',
    'PlasticBarrier', 'StreetLights', 'TrafficBarrier_1', 'TrafficBarrier_2', 'TrafficCone_1', 'TrafficCone_2', 'TrafficLight_1', 'TrashBag_1', 'TrashBag_2',
    'WaterTower', 'Wheel', 'Wheels_Stack', 'Blood_1', 'Blood_2'].map((n) => [`Environment/glTF/${n}.gltf`, n.toLowerCase()]),
];

let total = 0;
for (const [src, name, anims] of FILES) {
  const doc = await io.read(join(kit, src));
  if (anims) for (const a of doc.getRoot().listAnimations()) if (!anims.includes(a.getName())) a.dispose();
  await doc.transform(dedup(), weld(), resample({ tolerance: 0.002 }), prune(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
  const file = join(out, `${name}.glb`);
  await io.write(file, doc);
  const kb = statSync(file).size / 1024; total += kb;
  console.log(`${name.padEnd(18)} ${kb.toFixed(0).padStart(5)} KB  ${doc.getRoot().listAnimations().map((a) => a.getName()).join(',')}`);
}
console.log(`total ${total.toFixed(0)} KB`);
