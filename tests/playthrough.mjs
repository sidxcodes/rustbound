// Automated playthrough of the first playable: plays the real game in headless Chromium
// with simulated keys and real clicks on the interface, and checks the results.
// Run: node tests/playthrough.mjs [screenshot-folder]
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const shots = process.argv[2] || 'tests/screenshots';
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto('file://' + resolve('dist/index.html'));
await page.waitForFunction(() => window.__rustbound);

let passed = 0, failed = 0;
process.on('uncaughtException', async (e) => { console.log('CRASH', e.message.split('\n')[0]); try { console.log((await page.evaluate(() => T.log.concat([`player ${__rustbound.player.x.toFixed(1)},${__rustbound.player.z.toFixed(1)} hp ${__rustbound.survival.health.toFixed(0)} state ${__rustbound.state} panel ${__rustbound.ui.panel} prompt ${__rustbound.interaction.prompt}`]))).join('\n')); await page.screenshot({ path: `${shots}/crash.png` }); } catch {} process.exit(1); });
const check = (name, ok, extra = '') => { ok ? passed++ : failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const shot = async (name) => { await page.evaluate(() => { const g = window.__rustbound; g.renderer.render = g._render; g.tick(0.016); g.renderer.render = () => {}; }); await page.screenshot({ path: `${shots}/${name}.png` }); };
const state = (fn) => page.evaluate(fn);

// Test helpers that live in the page. They only press keys, move the mouse and step time.
await page.evaluate(() => {
  const g = window.__rustbound;
  g.autoRun = false;
  g._render = g.renderer.render.bind(g.renderer);
  g.renderer.render = () => {}; // skip drawing while simulating; screenshots turn it back on
  const T = (window.T = { log: [] });
  T.step = (n = 1) => { for (let i = 0; i < n; i++) g.tick(1 / 60); };
  T.press = (code) => { g.input.pressed.add(code); T.step(1); };
  T.keys = (codes) => { g.input.down.clear(); for (const c of codes) g.input.down.add(c); };
  // click on a world position (used to aim attacks)
  T.aim = (x, z) => { const v = new g.tmpV.constructor(x, 1, z).project(g.cameraRig.camera); g.input.mouse.nx = v.x; g.input.mouse.ny = v.y; };
  T.nearestEnemy = (range) => g.enemies.alive().map((e) => ({ e, d: Math.hypot(e.x - g.player.x, e.z - g.player.z) })).filter((o) => o.d < range).sort((a, b) => a.d - b.d)[0];
  // fight anything close: aim with the mouse and click
  T.fight = () => {
    let guard = 0;
    while (guard++ < 2400) {
      const n = T.nearestEnemy(9);
      if (!n || g.survival.dead) break;
      if (guard === 2400) T.log.push(`fight timed out, enemy at ${n.e.x.toFixed(1)},${n.e.z.toFixed(1)} d=${n.d.toFixed(1)}`);
      // step toward it if it is not coming, then swing when in range
      const k = [], dx = n.e.x - g.player.x, dz = n.e.z - g.player.z;
      if (n.d > 1.7) { if (dz < -0.3) k.push('KeyW'); if (dz > 0.3) k.push('KeyS'); if (dx > 0.3) k.push('KeyD'); if (dx < -0.3) k.push('KeyA'); }
      T.keys(k);
      if (n.d < 2.0) { T.aim(n.e.x, n.e.z); g.input.mouse.clicked = true; }
      T.step(1);
    }
  };
  // walk to a point with WASD (camera faces north in the test), fighting on the way
  T.walkTo = (x, z, tol = 0.5, run = true) => {
    T.care();
    for (let i = 0; i < 3000; i++) {
      if (T.nearestEnemy(7)) T.fight();
      const dx = x - g.player.x, dz = z - g.player.z;
      if (Math.hypot(dx, dz) < tol || g.survival.dead) break;
      const k = [];
      if (dz < -0.15) k.push('KeyW'); if (dz > 0.15) k.push('KeyS');
      if (dx > 0.15) k.push('KeyD'); if (dx < -0.15) k.push('KeyA');
      if (run) k.push('ShiftLeft');
      T.keys(k); T.step(1);
    }
    T.keys([]); T.step(2);
    const left = Math.hypot(x - g.player.x, z - g.player.z);
    if (left > tol + 0.2) T.log.push(`walkTo(${x},${z}) stopped ${left.toFixed(1)} m short at ${g.player.x.toFixed(1)},${g.player.z.toFixed(1)} clock ${g.env.clock()}`);
    return left;
  };
  // drive along waypoints with W/A/S/D like a player would
  T.driveTo = (x, z, tol = 5, maxSpeed = 30) => {
    const v = g.vehicle;
    for (let i = 0; i < 6000; i++) {
      const dx = x - v.x, dz = z - v.z, d = Math.hypot(dx, dz);
      if (d < tol) break;
      let err = Math.atan2(-dz, dx) - v.yaw;
      while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
      const k = [];
      if (err > 0.04) k.push('KeyA'); else if (err < -0.04) k.push('KeyD');
      const limit = Math.min(maxSpeed * (Math.abs(err) > 0.5 ? 0.4 : 1), Math.max(3, (d - tol) * 0.8 + 3));
      if (v.speed() < limit) k.push('KeyW'); else if (v.speed() > limit + 3) k.push('KeyS');
      T.keys(k); T.step(1);
      T.maxSpeed = Math.max(T.maxSpeed, v.speed());
      if (!v.engineOn) break;
    }
    T.keys([]);
  };
  T.brake = () => { for (let i = 0; i < 400 && Math.abs(g.vehicle.speed()) > 0.3; i++) { T.keys(['KeyS']); T.step(1); if (g.vehicle.speed() < 0) break; } T.keys(['Space']); T.step(30); T.keys([]); T.step(2); };
  T.care = () => { const s = g.survival; for (const [stat, ids] of [['thirst', ['water', 'dirty_water']], ['hunger', ['beans', 'jerky']]]) for (const id of ids) while (s[stat] < 45 && s.consume(id)); while (s.health < 55 && s.consume('bandage')); };
  // walk up to the truck from whichever side is free; `key` is F (drive) or E (panel)
  T.toTruck = (key) => {
    const v = g.vehicle;
    for (let n = 0; n < 6 && !(key === 'KeyF' ? g.player.driving : g.ui.panel === 'vehicle'); n++) {
      const near = (g.player.x - v.x) * -Math.sin(v.yaw) + (g.player.z - v.z) * -Math.cos(v.yaw) >= 0 ? 1 : -1, side = n % 2 ? -near : near, lx = -Math.sin(v.yaw) * side, lz = -Math.cos(v.yaw) * side;
      T.walkTo(v.x + lx * 2.1, v.z + lz * 2.1, 0.9);
      if (g.player.nearVehicle()) T.press(key);
    }
  };
  T.maxSpeed = 0;
  T.inv = () => Object.fromEntries(g.inventory.items.map((e) => [e.id, (g.inventory.count(e.id))]));
});

const lootAll = async (name) => {
  await page.evaluate(() => T.press('KeyE'));
  const open = await state(() => window.__rustbound.ui.panel);
  if (open !== 'loot') { check(`open ${name}`, false, `panel=${open}`); return; }
  await page.evaluate(() => T.step(70)); // search time
  await page.click('[data-act="takeall"]');
  await page.click('[data-act="close"]');
  await page.evaluate(() => T.step(2));
};

// ---------- 1. start ----------
await page.click('[data-act="new"]');
await page.evaluate(() => T.step(5));
check('new game starts', (await state(() => window.__rustbound.state)) === 'playing');
check('truck cannot start at the beginning', (await state(() => window.__rustbound.vehicle.startBlockers().length)) >= 4);
await shot('01-start');

// try to drive the broken truck: must refuse
await page.evaluate(() => { T.walkTo(2, -0.4, 1.3); T.press('KeyF'); T.keys(['KeyW']); T.step(120); T.keys([]); });
check('broken truck does not move', await state(() => { const v = window.__rustbound.vehicle; return Math.hypot(v.x - 2, v.z + 2.5) < 0.2 && !v.engineOn; }));
await page.evaluate(() => { T.press('KeyF'); });
check('player can get out again', await state(() => !window.__rustbound.player.driving));

// ---------- 2. garage: wrench and first wheel ----------
await page.evaluate(() => { T.walkTo(-15, 0.5); T.walkTo(-15, -6); T.walkTo(-18.6, -8.9, 0.5); });
await shot('02-garage');
await lootAll('toolbox');
check('found the pipe wrench', await state(() => window.__rustbound.inventory.has('wrench')));
await page.evaluate(() => T.walkTo(-11, -9.6, 0.5));
await lootAll('parts shelf');
check('found a wheel on the shelf', await state(() => window.__rustbound.inventory.has('wheel_worn')));

// ---------- 3. second wheel from the wreck, fuel from the drum ----------
await page.evaluate(() => { T.walkTo(-15, -6); T.walkTo(-15, 0.5); T.walkTo(-32, 14, 2.9); });
await lootAll('wrecked sedan');
check('two wheels in the backpack', (await state(() => window.__rustbound.inventory.count('wheel_worn'))) === 2);
await page.evaluate(() => { T.walkTo(-10, 2.5); T.walkTo(9, 2.5); T.walkTo(9, -6, 1.5); });
await lootAll('oil drum');
check('found a fuel can', await state(() => window.__rustbound.inventory.has('fuel_can')));

// ---------- 4. craft a repair kit (real UI) ----------
await page.evaluate(() => T.press('Tab'));
check('backpack opens with Tab', (await state(() => window.__rustbound.ui.panel)) === 'inventory');
await shot('03-backpack');
await page.click('[data-act="craft"][data-arg="repair_kit"]');
check('crafted a repair kit', await state(() => window.__rustbound.inventory.has('repair_kit')));
// equip the wrench as a weapon through the UI
const wrenchIndex = await state(() => window.__rustbound.inventory.items.findIndex((e) => e.id === 'wrench'));
await page.click(`[data-act="sel"][data-arg="${wrenchIndex}"]`);
await page.click('[data-act="equip"]');
check('wrench equipped', (await state(() => window.__rustbound.player.equipped)) === 'wrench');
await page.evaluate(() => T.press('Tab'));

// ---------- 5. fit wheels and repair the engine in the truck panel ----------
await page.evaluate(() => { T.walkTo(2, -0.3, 1.3); T.press('KeyE'); });
check('truck panel opens', (await state(() => window.__rustbound.ui.panel)) === 'vehicle');
for (const slot of ['wheelFR', 'wheelRL']) {
  await page.click(`[data-act="slot"][data-arg="${slot}"]`);
  await page.click('[data-act="install"]');
}
check('all four wheels fitted', (await state(() => window.__rustbound.vehicle.wheelsFitted())) === 4);
await page.click('[data-act="slot"][data-arg="engine"]');
await page.click('[data-act="repair"][data-arg="engine"]');
check('engine repaired past 25%', (await state(() => window.__rustbound.vehicle.slots.engine.cond)) >= 25);
await page.click('[data-act="refuel"]');
check('fuel poured into the tank', (await state(() => window.__rustbound.vehicle.fuel)) === 5);
check('only the battery is missing now', JSON.stringify(await state(() => window.__rustbound.vehicle.startBlockers())) === '["No battery"]');
await page.evaluate(() => T.step(40));
await shot('04-truck-panel');
await page.click('[data-act="close"]');

// ---------- 6. walk to the forest cabin for the battery, fighting husks ----------
await page.evaluate(() => { T.walkTo(30, -10); T.walkTo(40, -19); T.walkTo(40, -30); T.walkTo(40, -52); });
await shot('05-forest');
await page.evaluate(() => { T.walkTo(40, -56.5); T.walkTo(37.6, -59.6, 0.4); });
await lootAll('cabin shelf');
check('found the battery', await state(() => window.__rustbound.inventory.has('battery')));
check('husks near the cabin were killed in melee', (await state(() => window.__rustbound.kills)) >= 1, `kills=${await state(() => window.__rustbound.kills)}`);
check('player survived the walk', await state(() => !window.__rustbound.survival.dead), `health=${Math.round(await state(() => window.__rustbound.survival.health))}`);
await page.evaluate(() => { T.walkTo(40, -56.5); T.walkTo(40, -52); T.walkTo(40, -19); T.walkTo(30, -10); T.walkTo(2, -0.3, 1.3); T.press('KeyE'); });
await page.click('[data-act="slot"][data-arg="battery"]');
await page.click('[data-act="install"]');
check('truck is ready to drive', (await state(() => window.__rustbound.vehicle.startBlockers().length)) === 0);
await page.click('[data-act="close"]');

// ---------- 7. save and load round trip ----------
const before = await state(() => { const g = window.__rustbound; g.saves.save(true); return JSON.stringify({ s: g.vehicle.slots, f: g.vehicle.fuel, i: g.inventory.items }); });
const after = await state(() => { const g = window.__rustbound; g.vehicle.slots.battery = null; g.inventory.items = []; g.vehicle.fuel = 0; g.saves.load(); return JSON.stringify({ s: g.vehicle.slots, f: g.vehicle.fuel, i: g.inventory.items }); });
check('save and load restore truck parts, fuel and backpack', before === after);


// ---------- 7b. trunk, part removal and eating through the interface ----------
await page.evaluate(() => { T.toTruck('KeyE'); });
await page.click('[data-act="tab"][data-arg="trunk"]');
const carried = await state(() => window.__rustbound.inventory.items.length);
await page.click('[data-act="totrunk"][data-arg="0"]');
check('item stored in the trunk', await state(() => window.__rustbound.vehicle.trunk.items.length === 1) && (await state(() => window.__rustbound.inventory.items.length)) === carried - 1);
await page.click('[data-act="fromtrunk"][data-arg="0"]');
check('item taken back from the trunk', (await state(() => window.__rustbound.inventory.items.length)) === carried);
await page.click('[data-act="tab"][data-arg="parts"]');
await page.click('[data-act="slot"][data-arg="wheelFR"]');
await page.click('[data-act="remove"][data-arg="wheelFR"]');
check('removing a wheel stops the truck from starting', await state(() => window.__rustbound.vehicle.startBlockers().includes('1 wheel missing') && window.__rustbound.inventory.has('wheel_worn')));
await page.click('[data-act="install"]');
check('wheel refitted', (await state(() => window.__rustbound.vehicle.wheelsFitted())) === 4);
await page.click('[data-act="close"]');
await page.evaluate(() => { const g = window.__rustbound; g.survival.hunger = 30; if (!g.inventory.has('beans')) g.inventory.add({ id: 'beans', qty: 1 }); T.press('Tab'); });
await page.click(`[data-act="sel"][data-arg="${await state(() => window.__rustbound.inventory.items.findIndex((e) => e.id === 'beans'))}"]`);
await page.click('[data-act="use"]');
check('eating restores hunger', (await state(() => window.__rustbound.survival.hunger)) > 60);
await page.evaluate(() => T.press('Tab'));

// ---------- 8. drive to the fuel station ----------
await page.evaluate(() => { T.toTruck('KeyF'); });
check('engine starts', await state(() => window.__rustbound.vehicle.engineOn && window.__rustbound.player.driving));
await page.evaluate(() => { T.driveTo(22, 8, 4, 9); T.driveTo(60, 8, 6); });
await shot('06-driving');
const cruise = await state(() => T.maxSpeed);
check('truck reaches road speed', cruise > 9, `${(cruise * 3.6).toFixed(0)} km/h`);
await page.evaluate(() => { T.driveTo(100, 7, 6); T.driveTo(111, 6.2, 3, 6); T.brake(); T.press('KeyF'); });
check('reached the fuel station by truck', await state(() => window.__rustbound.flags.reachedStation === true));
check('fuel was used on the way', (await state(() => window.__rustbound.vehicle.fuel)) < 5);
check('no radiator: engine runs hot', (await state(() => window.__rustbound.vehicle.temp)) > 40, `temp=${Math.round(await state(() => window.__rustbound.vehicle.temp))}`);
await page.evaluate(() => { T.fight(); T.walkTo(109.5, 2.0, 0.7); T.press('KeyE'); });
console.log((await state(() => T.log)).join('\n'));
const fuelAfterPump = await state(() => window.__rustbound.vehicle.fuel);
check('pump fills the parked truck', fuelAfterPump > 39, `fuel=${fuelAfterPump.toFixed(1)} L`);
await shot('07-fuel-station');

// ---------- 9. town workshop: radiator and bull bar ----------
await page.evaluate(() => { T.toTruck('KeyF'); T.driveTo(180, 8, 6); T.driveTo(236, 8, 5, 12); T.brake(); T.press('KeyF'); });
await page.evaluate(() => { T.fight(); T.walkTo(240, -3); T.walkTo(240, -9); T.walkTo(234.6, -14.1, 0.6); });
await lootAll('workbench');
await page.evaluate(() => T.walkTo(244, -14.4, 0.6));
await lootAll('workshop shelf');
check('found radiator and bull bar', await state(() => window.__rustbound.inventory.has('radiator') && window.__rustbound.inventory.has('bullbar')));
await shot('08-workshop');

// before fitting the bull bar: the barricade must hold
await page.evaluate(() => { T.walkTo(240, -9); T.walkTo(240, -3); T.toTruck('KeyF'); });
const stash = await state(() => { const g = window.__rustbound; return { x: g.vehicle.x, z: g.vehicle.z }; });
await page.evaluate(() => { T.driveTo(270, 8, 4); T.driveTo(291, 8, 3); T.step(60); });
check('barricade stops the truck without a bull bar', await state(() => { const g = window.__rustbound; return !g.world.barricade.broken && g.vehicle.x < 291; }), `x=${(await state(() => window.__rustbound.vehicle.x)).toFixed(1)}`);
await page.evaluate(() => { T.brake(); T.press('KeyF'); });
await page.evaluate(() => { T.fight(); T.toTruck('KeyE'); });
check('truck panel opens at the barricade', (await state(() => window.__rustbound.ui.panel)) === 'vehicle');
for (const slot of ['radiator', 'bumper']) {
  await page.click(`[data-act="slot"][data-arg="${slot}"]`);
  await page.click('[data-act="install"]');
}
check('radiator and bull bar fitted', await state(() => !!window.__rustbound.vehicle.slots.radiator && !!window.__rustbound.vehicle.slots.bumper));
if (await state(() => window.__rustbound.vehicle.chassis < 60)) await page.click('[data-act="repair"][data-arg="chassis"]');
await page.evaluate(() => T.step(40));
await shot('09-upgraded');
await page.click('[data-act="close"]');

// ---------- 10. toxic dust on foot ----------
const tox = await state(() => { const g = window.__rustbound; const keep = { x: g.player.x, z: g.player.z, h: g.survival.health }; g.player.x = 320; g.player.z = 40; T.step(60); const lost = keep.h - g.survival.health; g.player.x = keep.x; g.player.z = keep.z; g.survival.health = keep.h; T.step(1); return lost; });
check('the Dead Stretch hurts on foot', tox > 4, `lost ${tox.toFixed(1)} health in 1 s`);

// ---------- 11. ram the barricade and cross to the outpost ----------
await page.evaluate(() => { T.toTruck('KeyF'); });
// reverse to get a run-up, then charge
await page.evaluate(() => { const g = window.__rustbound; for (let i = 0; i < 900 && g.vehicle.x > 255; i++) { T.keys(['KeyS']); T.step(1); } T.brake(); T.driveTo(300, 8, 4); });
check('bull bar breaks the barricade', await state(() => window.__rustbound.world.barricade.broken));
await page.evaluate(() => T.step(20));
await shot('10-barricade');
await page.evaluate(() => { T.driveTo(350, 8, 6); });
await shot('11-dead-stretch');
const hp = await state(() => window.__rustbound.survival.health);
await page.evaluate(() => { T.driveTo(418, 8, 5); T.step(5); });
check('no toxic damage inside the truck', (await state(() => window.__rustbound.survival.health)) >= hp - 0.5);
check('reached Ridge Outpost: win screen', (await state(() => window.__rustbound.state)) === 'won');
check('all 9 goals complete', (await state(() => window.__rustbound.objectives.list().filter((o) => o.complete).length)) === 9);
check('radiator keeps the engine below overheating', (await state(() => window.__rustbound.vehicle.temp)) < 110, `temp=${Math.round(await state(() => window.__rustbound.vehicle.temp))}`);
await shot('12-outpost');


// ---------- 12. overheating without a radiator, and death ----------
const heat = await state(() => { const g = window.__rustbound, v = g.vehicle; g.state = 'playing'; g.ui.hideScreen(); v.slots.radiator = null; v.syncParts(); v.temp = 25; v.x = 20; v.z = 8; v.yaw = 0; v.vx = v.vz = 0; v.engineOn = true; g.player.driving = true;
  let t = 0; while (v.engineOn && t < 120) { T.keys(v.x < 250 ? ['KeyW'] : ['KeyS']); if (v.x > 250 && Math.abs(v.speed()) < 1) { v.x = 20; } T.step(6); t += 0.1; } T.keys([]); return { t, temp: v.temp, on: v.engineOn }; });
check('without a radiator the engine overheats and cuts out', !heat.on && heat.temp >= 110, `after ${heat.t.toFixed(0)} s of hard driving, temp ${Math.round(heat.temp)}`);
await state(() => { const g = window.__rustbound; g.survival.damage(999, 'a test'); T.step(2); });
check('death shows the death screen', (await state(() => window.__rustbound.state)) === 'dead' && (await page.locator('#screen').innerText()).includes('DIED'));
await shot('13-death');

console.log((await state(() => T.log)).join('\n'));
check('no errors in the browser console', errors.length === 0, errors.join(' | '));
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
