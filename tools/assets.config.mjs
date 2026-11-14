// Which outside assets the game uses and how they are converted. Read by tools/fetch-polyhaven.mjs,
// tools/convert-textures.mjs and tools/convert-models.mjs. Every asset here is CC0 (Poly Haven).
// Mixamo and Sketchfab files need an account, so they are downloaded by hand: see assets-src/DOWNLOADS.md.

// PBR texture sets: game key -> Poly Haven id. `size` is the largest side kept (px); `arm` is the
// packed ambient-occlusion / roughness / metalness map, kept smaller because it carries less detail.
export const TEXTURES = {
  grass: { id: 'leafy_grass', size: 1024 },
  dirt: { id: 'dirt', size: 1024 },
  cracked: { id: 'dry_ground_01', size: 1024 },
  sand: { id: 'dense_sand', size: 1024 },
  asphalt: { id: 'asphalt_02', size: 1024 },
  concrete: { id: 'dirty_concrete', size: 1024 },
  plaster: { id: 'worn_plaster_wall', size: 1024 },
  corrugated: { id: 'worn_corrugated_iron', size: 1024 },
  rustroof: { id: 'rusty_corrugated_iron', size: 1024 },
  siding: { id: 'weathered_plank_siding', size: 1024 },
  planks: { id: 'weathered_planks', size: 1024 },
  floor: { id: 'old_wood_floor', size: 1024 },
  roof: { id: 'grey_roof_tiles', size: 1024 },
  paint: { id: 'rusty_metal_02', size: 1024 },
  rock: { id: 'rock_boulder_dry', size: 1024 },
  bark: { id: 'pine_bark', size: 512 },
};
export const ARM_SIZE = 512;

// Poly Haven models -> src/assets/props/<key>.glb. tex: largest texture side kept. tris: triangle budget
// (meshes are simplified down to it). variant: which material variant to keep, when the model has several.
// keep: only nodes whose name matches. impostor: baked into camera-facing cards by tools/bake-impostors.mjs
// instead (trees and bushes made of millions of leaf triangles); each listed node becomes one variant.
export const MODELS = {
  fir: { id: 'fir_tree_01', impostor: ['fir_tree_01_a_LOD0', 'fir_tree_01_b_LOD0', 'fir_tree_01_c_LOD0'] },
  leafy: { id: 'tree_small_02', impostor: ['tree_small_02_LOD0'] },
  olive: { id: 'island_tree_01', impostor: ['island_tree_01_LOD0'] },
  shrub: { id: 'shrub_02', impostor: ['shrub_02_a', 'shrub_02_b', 'shrub_02_c', 'shrub_02_d'] },
  fern: { id: 'fern_02', impostor: ['fern_02_b', 'fern_02_c'] },
  grass: { id: 'grass_medium_01', impostor: ['grass_medium_01_tall_a_LOD0', 'grass_medium_01_mid_a_LOD0'], px: 256 },
  stump: { id: 'tree_stump_01', tex: 512, tris: 600 },
  rock: { id: 'rock_07', tex: 512, tris: 500 },
  rock2: { id: 'namaqualand_boulder_02', tex: 1024, tris: 1200 },
  crate: { id: 'wooden_military_crate', tex: 512, tris: 1500 },
  crate2: { id: 'old_military_crate', tex: 512, tris: 1500, keep: /_a$/ },
  barrel: { id: 'Barrel_01', tex: 512, tris: 1500, variant: 'oxide_grey' },
  barrel_green: { id: 'Barrel_01', tex: 512, tris: 1500, variant: 'oxide_green' },
  tyre: { id: 'old_tyre', tex: 512, tris: 1500 },
  rim: { id: 'rusted_wheel_rim_01', tex: 512, tris: 1500 },
  shelf: { id: 'worn_metal_rack', tex: 512, tris: 2000 },
  toolchest: { id: 'metal_tool_chest', tex: 512, tris: 2500 },
  toolbox: { id: 'metal_toolbox', tex: 512, tris: 1500 },
  toolcart: { id: 'tool_cart', tex: 512, tris: 2500 },
  lamp: { id: 'street_lamp_01', tex: 512, tris: 1500 },
  barrier: { id: 'concrete_road_barrier', tex: 512, tris: 800 },
  hydrant: { id: 'fire_hydrant', tex: 512, tris: 1500, keep: /_aged$/ },
  trashbag: { id: 'trashbag', tex: 512, tris: 800 },
  trashcan: { id: 'metal_trash_can', tex: 512, tris: 1500, keep: /_rust/ },
  bed: { id: 'old_bed_frame', tex: 512, tris: 2500 },
  table: { id: 'wooden_table_02', tex: 512, tris: 1500 },
  sofa: { id: 'Sofa_01', tex: 512, tris: 2500 },
  jerrycan: { id: 'metal_jerrycan', tex: 512, tris: 1200 },
  gascan: { id: 'propane_tank', tex: 512, tris: 1200 },
  generator: { id: 'portable_generator', tex: 512, tris: 2500 },
  aircon: { id: 'exterior_aircon_unit', tex: 512, tris: 1500, keep: /_rusted$/ },
  box: { id: 'cardboard_box_01', tex: 512, tris: 400 },
  cement: { id: 'cement_bag', tex: 512, tris: 800 },
  wrench: { id: 'pipe_wrench', tex: 512, tris: 1500 },
  bat: { id: 'baseball_bat', tex: 512, tris: 800 },
};

// Sky light for reflections and ambient light (Poly Haven HDRI, CC0).
export const HDRIS = {
  sky: { id: 'kloofendal_48d_partly_cloudy_puresky', res: '1k' },
};

// Mixamo (Adobe account needed; see assets-src/DOWNLOADS.md). Converted by tools/convert-mixamo.mjs.
export const MIXAMO = {
  survivor: { character: 'Swat Guy', animations: ['Breathing Idle', 'Walking (Male Standard Walk)', 'Running (Running With Intention)', 'Punching (Cross Punch)', 'Standing Melee Attack Horizontal', 'Hit Reaction', 'Standing React Death Backward'] },
  husk: { character: 'Yaku J Ignite', animations: ['Zombie Idle', 'Zombie Walk', 'Zombie Running', 'Zombie Attack (Swipe)', 'Zombie Reaction Hit', 'Zombie Death'] },
  dusthusk: { character: 'Warzombie F Pedroso', animations: ['the husk animations, scaled to its hip height'] },
};

// Sketchfab (account needed to download; CC BY 4.0, attribution required). Converted by tools/convert-vehicles.mjs.
export const SKETCHFAB = [
  { file: 'truck', use: "the player's pickup", name: 'Rusty Abandoned Truck with Interior - Game Ready', url: 'https://sketchfab.com/3d-models/rusty-abandoned-truck-with-interior-game-ready-68f715c39c07464db59e099bb8dc2d4e', author: 'Rashad Ibrahimli', authorUrl: 'https://sketchfab.com/rashad-brahimli' },
  { file: 'crashed_truck', use: 'wrecks, the rolled pickup', name: 'Crashed Abandoned Truck - Game Ready', url: 'https://sketchfab.com/3d-models/crashed-abandoned-truck-game-ready-1e9afcb999814bcfa2ea27b22df14059', author: 'Rashad Ibrahimli', authorUrl: 'https://sketchfab.com/rashad-brahimli' },
  { file: 'crashed_car', use: 'wrecks, the abandoned hatchback', name: 'Crashed Abandoned Car - Game Ready', url: 'https://sketchfab.com/3d-models/crashed-abandoned-car-game-ready-66ef51a84c9843dda53bf0b4b9020011', author: 'Rashad Ibrahimli', authorUrl: 'https://sketchfab.com/rashad-brahimli' },
  { file: 'sedan', use: 'wrecks, the wrecked sedan', name: 'Abandoned Generic Sedan 1 - Game Ready', url: 'https://sketchfab.com/3d-models/abandoned-generic-sedan-1-game-ready-6a2169dafc254f399387a679305bb1bf', author: 'Rashad Ibrahimli', authorUrl: 'https://sketchfab.com/rashad-brahimli' },
  { file: 'burned_cars', use: 'burnt-out wrecks', name: 'Burned-out Cars', url: 'https://sketchfab.com/3d-models/burned-out-cars-701066df6b914fd08318524c7ccd96a7', author: 'Renafox', authorUrl: 'https://sketchfab.com/kryik1023' },
];
