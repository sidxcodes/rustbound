// All 2D interface: HUD, backpack and crafting, loot, the truck panel, menus and end screens.
// Panels are re-rendered from game state after every action; one click handler routes data-act buttons.
import { ITEMS, KIND_LABEL, VEHICLE_SLOTS, RECIPES } from '../data/items.js';
import { MAP, ROAD_Z, ROAD_HALF, BUILDINGS, RIDGE_X, STRETCH, OUTPOST, REGION_NAMES, regionAt, PUMPS } from '../data/layout.js';
import { OBJECTIVES } from '../systems/Objectives.js';
import CREDITS from '../assets/credits.json';

const $ = (id) => document.getElementById(id);
const pct = (v) => `${Math.round(v)}%`;
const condClass = (c) => (c >= 60 ? 'cond-good' : c >= 30 ? 'cond-mid' : 'cond-bad');
const kg = (v) => `${v.toFixed(1)} kg`;

export class UI {
  constructor(game) {
    this.game = game;
    this.panel = null; this.ctx = null; this.sel = -1; this.vehTab = 'parts'; this.slotSel = 'engine'; this.searchT = 0;
    this.el = { panel: $('panel'), screen: $('screen'), prompt: $('prompt'), toasts: $('toasts'), goal: $('goal'), dash: $('dash'), warn: $('warn') };
    this.map = $('minimap'); this.mapBg = this.drawMapBackground();
    this.lastGoal = '';
    const click = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      this.game.audio.start();
      this.act(b.dataset.act, b.dataset.arg);
    };
    this.el.panel.addEventListener('click', click);
    this.el.screen.addEventListener('click', click);
    game.events.on('toast', (t) => this.toast(t));
    game.events.on('objective', (o) => { this.toast(`Done: ${o.text}`); game.events.emit('sfx', 'goal'); });
  }

  // ---------- panels ----------
  open(name, ctx = null) {
    this.panel = name; this.ctx = ctx; this.sel = -1;
    if (name === 'loot' && !ctx.searched) this.searchT = 0.9;
    this.el.panel.hidden = false;
    this.render();
  }
  close() {
    if (this.panel === 'loot' || this.panel === 'vehicle') this.game.saves.save(true);
    this.panel = null; this.ctx = null;
    this.el.panel.hidden = true; this.el.panel.innerHTML = '';
  }
  toast(text) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = text;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), 3700);
  }

  row(entry, act, i, sel) {
    const def = ITEMS[entry.id];
    const meta = entry.cond != null ? `${pct(entry.cond)} condition` : kg(def.w * entry.qty);
    return `<button class="row${sel ? ' sel' : ''}" data-act="${act}" data-arg="${i}"><span class="chip ${def.kind}">${KIND_LABEL[def.kind]}</span><span>${def.name}${entry.qty > 1 ? ` &times; ${entry.qty}` : ''}</span><span class="meta">${meta}</span></button>`;
  }
  list(inv, act, emptyText) {
    if (!inv.items.length) return `<div class="empty">${emptyText}</div>`;
    return `<div class="list">${inv.items.map((e, i) => this.row(e, act, i, false)).join('')}</div>`;
  }

  render() {
    if (!this.panel) return;
    const html = { inventory: () => this.htmlInventory(), loot: () => this.htmlLoot(), vehicle: () => this.htmlVehicle(), menu: () => this.htmlMenu(), credits: () => this.htmlCredits() }[this.panel]();
    this.el.panel.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  }

  htmlInventory() {
    const { inventory, player, crafting } = this.game;
    const items = inventory.items;
    const rows = items.length ? `<div class="list">${items.map((e, i) => this.row(e, 'sel', i, i === this.sel)).join('')}</div>` : '<div class="empty">Your backpack is empty. Search crates, shelves and wrecks.</div>';
    let detail = '<p>Select an item to use it.</p>';
    const e = items[this.sel];
    if (e) {
      const def = ITEMS[e.id], btns = [];
      if (['food', 'drink', 'med'].includes(def.kind)) btns.push(`<button class="btn" data-act="use">${def.kind === 'drink' ? 'Drink' : def.kind === 'med' ? 'Use' : 'Eat'}</button>`);
      if (def.kind === 'weapon') btns.push(`<button class="btn" data-act="equip">${player.equipped === e.id ? 'Put away' : 'Equip'}</button>`);
      if (def.kind === 'part') btns.push('<span class="meta" style="color:var(--dim)">Fit it from the truck panel.</span>');
      btns.push('<button class="btn ghost" data-act="drop">Discard one</button>');
      detail = `<strong>${def.name}</strong><p>${def.desc}</p><div class="btns">${btns.join('')}</div>`;
    }
    const recipes = RECIPES.map((r) => {
      const needs = Object.entries(r.needs).map(([id, q]) => `<span class="${inventory.has(id, q) ? '' : 'lack'}">${q} ${ITEMS[id].name.toLowerCase()}</span>`).join(' + ');
      return `<div class="recipe"><div>${ITEMS[r.out.id].name}<small>${needs}</small></div><button class="btn" data-act="craft" data-arg="${r.id}" ${crafting.canCraft(r) ? '' : 'disabled'}>Craft</button></div>`;
    }).join('');
    return `<div class="sheet-head"><h2>Backpack</h2><span class="sub">${kg(inventory.weight())} of ${inventory.maxWeight} kg${inventory.weight() > inventory.maxWeight ? ' — overloaded, you move slowly' : ''} &nbsp; <button class="btn ghost" data-act="close">Close</button></span></div>
      <div class="cols"><div><h3>Carrying</h3>${rows}<div class="detail">${detail}</div></div><div><h3>Crafting</h3><div class="list">${recipes}</div></div></div>`;
  }

  htmlLoot() {
    const c = this.ctx, { inventory } = this.game;
    if (this.searchT > 0) return `<div class="sheet-head"><h2>${c.name}</h2></div><div class="empty">Searching…</div><div class="bar"><i id="searchbar" style="width:0%"></i></div>`;
    const inv = { items: c.items };
    return `<div class="sheet-head"><h2>${c.name}</h2><span class="sub">Backpack ${kg(inventory.weight())} of ${inventory.maxWeight} kg &nbsp; <button class="btn" data-act="takeall" ${c.items.length ? '' : 'disabled'}>Take all</button> <button class="btn ghost" data-act="close">Close</button></span></div>
      <div class="cols"><div><h3>Inside</h3>${this.list(inv, 'take', 'Nothing left here.')}</div><div><h3>Your backpack</h3>${this.list(inventory, 'put', 'Empty.')}</div></div>`;
  }

  htmlVehicle() {
    const { vehicle, inventory } = this.game, st = vehicle.stats(), blockers = vehicle.startBlockers();
    const status = blockers.length
      ? `<div class="status"><strong>Won't start yet</strong><ul>${blockers.map((b) => `<li>${b}</li>`).join('')}</ul></div>`
      : `<div class="status ready"><strong>Ready to drive.</strong> Close this panel and press <kbd>F</kbd> next to the truck.${vehicle.slots.radiator ? '' : ' No radiator: the engine will overheat on long runs.'}</div>`;
    const tabs = `<div class="tabs"><button class="tab${this.vehTab === 'parts' ? ' on' : ''}" data-act="tab" data-arg="parts">Parts</button><button class="tab${this.vehTab === 'trunk' ? ' on' : ''}" data-act="tab" data-arg="trunk">Trunk</button></div>`;
    const head = `<div class="sheet-head"><h2>Pickup truck</h2><span class="sub">${Math.round(vehicle.odometer)} m driven &nbsp; <button class="btn ghost" data-act="close">Close</button></span></div>`;
    if (this.vehTab === 'trunk') {
      return `${head}${tabs}<div class="cols"><div><h3>Trunk — ${kg(vehicle.trunk.weight())} of ${vehicle.trunk.maxWeight} kg</h3>${this.list(vehicle.trunk, 'fromtrunk', 'The trunk is empty. Click backpack items to store them.')}</div>
        <div><h3>Backpack — ${kg(inventory.weight())} of ${inventory.maxWeight} kg</h3>${this.list(inventory, 'totrunk', 'Empty.')}</div></div>`;
    }
    const slots = VEHICLE_SLOTS.map((s) => {
      const p = vehicle.slots[s.id];
      const cls = `slot${p ? '' : ' missing'}${s.required ? ' req' : ''}${this.slotSel === s.id ? ' sel' : ''}`;
      const state = p ? `<div class="bar ${condClass(p.cond)}"><i style="width:${p.cond}%"></i></div><span class="state">${ITEMS[p.id].name} · ${pct(p.cond)}</span>` : `<span class="state">${s.required ? 'Missing' : 'Empty'}</span>`;
      return `<button class="${cls}" style="grid-area:${s.id}" data-act="slot" data-arg="${s.id}"><span class="name">${s.label}</span>${state}</button>`;
    }).join('');

    // detail for the selected slot
    const slot = VEHICLE_SLOTS.find((s) => s.id === this.slotSel), part = vehicle.slots[slot.id];
    const kits = inventory.count('repair_kit');
    let detail;
    if (part) {
      const def = ITEMS[part.id];
      detail = `<strong>${def.name}</strong> <span class="meta">${pct(part.cond)} condition</span><p>${def.desc}</p><div class="btns">
        <button class="btn" data-act="repair" data-arg="${slot.id}" ${kits && part.cond < 100 ? '' : 'disabled'}>Repair +35% (${kits} kit${kits === 1 ? '' : 's'})</button>
        ${def.fixed ? '' : `<button class="btn ghost" data-act="remove" data-arg="${slot.id}">Remove</button>`}</div>`;
    } else {
      const fits = inventory.items.map((e, i) => ({ e, i })).filter(({ e }) => ITEMS[e.id].slot === slot.accepts);
      const names = Object.values(ITEMS).filter((d) => d.slot === slot.accepts).map((d) => d.name.toLowerCase()).join(' or ');
      detail = `<strong>${slot.label}: ${slot.required ? 'missing' : 'empty'}</strong>` + (fits.length
        ? `<p>Choose a part from your backpack.</p><div class="list">${fits.map(({ e, i }) => `<button class="row" data-act="install" data-arg="${i}"><span class="chip part">FIT</span><span>${ITEMS[e.id].name}</span><span class="meta">${pct(e.cond ?? 100)}</span></button>`).join('')}</div>`
        : `<p>Nothing in your backpack fits here. Look for a ${names}.</p>`)
        + (inventory.has('wrench') ? '' : '<p style="color:var(--warn)">You also need a pipe wrench to fit parts.</p>');
    }
    const cans = inventory.count('fuel_can');
    return `${head}${tabs}${status}<div class="cols">
      <div><h3>Truck, seen from above (front at the top)</h3><div class="truck">${slots}</div></div>
      <div><h3>Selected part</h3><div class="detail" style="margin-top:0">${detail}</div>
        <div class="fuelrow"><div><h3 style="margin:0 0 4px">Fuel ${vehicle.fuel.toFixed(1)} of ${st.capacity} L</h3><div class="bar"><i style="width:${st.capacity ? (vehicle.fuel / st.capacity) * 100 : 0}%;background:var(--warn)"></i></div></div>
          <button class="btn" data-act="refuel" ${cans ? '' : 'disabled'}>Pour a can (${cans})</button></div>
        <div class="fuelrow"><div><h3 style="margin:0 0 4px">Chassis ${pct(vehicle.chassis)}</h3><div class="bar ${condClass(vehicle.chassis)}"><i style="width:${vehicle.chassis}%"></i></div></div>
          <button class="btn ghost" data-act="repair" data-arg="chassis" ${kits && vehicle.chassis < 100 ? '' : 'disabled'}>Patch</button></div>
      </div></div>
      <div class="stats"><div class="stat"><b>${pct(st.power * 100)}</b><span>Engine power</span></div><div class="stat"><b>${pct(st.grip * 100)}</b><span>Tyre grip</span></div>
        <div class="stat"><b>${Math.round(st.topSpeed * 3.6)} km/h</b><span>Top speed (road)</span></div><div class="stat"><b>${st.storage} kg</b><span>Trunk space</span></div></div>`;
  }

  htmlMenu() {
    return `<div class="sheet-head"><h2>Paused</h2></div><div class="btns">
      <button class="btn" data-act="close">Resume</button><button class="btn ghost" data-act="save">Save game</button>
      <button class="btn ghost" data-act="load" ${this.game.saves.hasSave() ? '' : 'disabled'}>Load last save</button>
      <button class="btn ghost" data-act="mute">${this.game.audio.muted ? 'Sound on' : 'Sound off'}</button>
      <button class="btn ghost" data-act="gfx">Graphics: ${this.game.quality === 'high' ? 'High' : 'Low'}</button>
      <button class="btn ghost" data-act="credits">Credits</button>
      <button class="btn ghost" data-act="new">New game</button></div>${this.keysHtml()}
      <p class="note" style="color:var(--dim)">The game saves by itself every 30 seconds and when you close a container or the truck panel.</p>`;
  }
  // Who made the art: every outside asset, its author and licence (generated by tools/write-licenses.mjs)
  htmlCredits() {
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const item = (i) => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.name)}</a>${i.by ? ` <span>by ${esc(i.by)}</span>` : ''}</li>`;
    const groups = CREDITS.map((g) => `<h3>${esc(g.title)}</h3><p class="lic">${esc(g.licence)}</p><ul class="credits">${g.items.map(item).join('')}</ul>`).join('');
    return `<div class="sheet-head"><h2>Credits</h2><span class="sub"><button class="btn ghost" data-act="back">Back</button></span></div>
      <p class="lic">Game code and design are original. The art comes from these creators, used under the licences shown (details in src/assets/LICENSE.md).</p>${groups}`;
  }
  keysHtml() {
    return `<dl class="keys"><dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>Walk. In the truck: drive, brake and steer</dd>
      <dt><kbd>Shift</kbd></dt><dd>Run (uses stamina)</dd><dt><kbd>E</kbd></dt><dd>Search, use, open the truck panel</dd>
      <dt><kbd>F</kbd></dt><dd>Get in or out of the truck</dd><dt><kbd>Click</kbd> / <kbd>Space</kbd></dt><dd>Attack on foot. Space is the handbrake when driving</dd>
      <dt><kbd>Tab</kbd></dt><dd>Backpack and crafting</dd><dt><kbd>Q</kbd><kbd>E</kbd> / <kbd>Wheel</kbd></dt><dd>Rotate and zoom the view</dd>
      <dt><kbd>C</kbd></dt><dd>Chase camera while driving</dd><dt><kbd>Esc</kbd></dt><dd>Menu, save and load</dd></dl>`;
  }

  act(name, arg) {
    const g = this.game, { inventory, vehicle, survival, player, crafting } = g;
    const i = Number(arg);
    switch (name) {
      case 'close': this.close(); return;
      case 'sel': this.sel = i; break;
      case 'use': { const e = inventory.items[this.sel]; if (e) survival.consume(e.id); if (!inventory.items[this.sel]) this.sel = -1; break; }
      case 'equip': { const e = inventory.items[this.sel]; if (e) player.equip(e.id); break; }
      case 'drop': { const e = inventory.items[this.sel]; if (e) { if (e.cond != null) inventory.removeEntry(e); else inventory.remove(e.id, 1); } if (!inventory.items[this.sel]) this.sel = -1; break; }
      case 'craft': crafting.craft(arg); break;
      case 'take': this.transfer({ items: this.ctx.items }, inventory, i); break;
      case 'put': this.transfer(inventory, { items: this.ctx.items }, i); break;
      case 'takeall': { for (const e of [...this.ctx.items]) this.transfer({ items: this.ctx.items }, inventory, this.ctx.items.indexOf(e), true); g.events.emit('sfx', 'pick'); break; }
      case 'fromtrunk': this.transfer(vehicle.trunk, inventory, i); break;
      case 'totrunk': this.transfer(inventory, vehicle.trunk, i); break;
      case 'tab': this.vehTab = arg; break;
      case 'slot': this.slotSel = arg; break;
      case 'install': vehicle.install(this.slotSel, inventory.items[i]); break;
      case 'remove': vehicle.removePart(arg); break;
      case 'repair': vehicle.repair(arg); break;
      case 'refuel': vehicle.refuel(); break;
      case 'save': g.saves.save(); break;
      case 'load': this.close(); g.loadGame(); return;
      case 'mute': g.audio.toggleMute(); break;
      case 'gfx': g.setQuality(g.quality === 'high' ? 'low' : 'high', true); break;
      case 'new': this.close(); g.newGame(); return;
      case 'credits': if (g.state === 'playing') this.open('credits'); else this.showCredits(); return;
      case 'back': if (g.state === 'playing') this.open('menu'); else this.showTitle(); return;
      case 'continue': g.loadGame(); return;
      case 'keepgoing': g.resume(); return;
      default: return;
    }
    this.render();
  }
  // Move the entry at index i from one item holder to another. Holders are Inventory objects or { items }.
  transfer(from, to, i, quiet = false) {
    const e = from.items[i];
    if (!e) return false;
    if (to.add) { if (!to.add(e)) { this.toast(to === this.game.inventory ? 'Too heavy to carry' : 'The trunk is full'); return false; } }
    else {
      const stack = ITEMS[e.id].stack && e.cond == null ? to.items.find((x) => x.id === e.id) : null;
      if (stack) stack.qty += e.qty; else to.items.push({ ...e });
    }
    from.items.splice(i, 1);
    if (!quiet) this.game.events.emit('sfx', 'pick');
    return true;
  }

  // ---------- screens ----------
  showTitle() {
    const has = this.game.saves.hasSave();
    this.el.screen.hidden = false;
    this.el.screen.innerHTML = `<div class="inner"><h1 class="logo">Rust<span>bound</span></h1>
      <p class="tag">You are stranded in a scrapyard with a pickup that will not start. Find the parts, fix it, and drive east to Ridge Outpost.</p>
      <div class="btns">${has ? '<button class="btn" data-act="continue">Continue</button>' : ''}<button class="btn${has ? ' ghost' : ''}" data-act="new">New game</button><button class="btn ghost" data-act="credits">Credits</button></div>
      ${this.keysHtml()}<p class="note touch-note">This build needs a keyboard and a mouse. Touch controls are not in yet.</p></div>`;
  }
  showCredits() {
    this.el.screen.hidden = false;
    this.el.screen.innerHTML = `<div class="inner credits-screen">${this.htmlCredits()}</div>`;
  }
  showDeath(cause) {
    const has = this.game.saves.hasSave();
    this.el.screen.hidden = false;
    this.el.screen.innerHTML = `<div class="inner"><h1 class="logo" style="font-size:clamp(44px,10vw,80px)">You <span>died</span></h1><p class="tag">Killed by ${cause} on day ${this.game.env.day}.</p>
      <div class="btns">${has ? '<button class="btn" data-act="continue">Load last save</button>' : ''}<button class="btn ghost" data-act="new">New game</button></div></div>`;
  }
  showWin() {
    const g = this.game, mins = Math.floor(g.playTime / 60), secs = Math.floor(g.playTime % 60);
    this.el.screen.hidden = false;
    this.el.screen.innerHTML = `<div class="inner"><h1 class="logo" style="font-size:clamp(40px,9vw,72px)">Ridge <span>Outpost</span></h1>
      <p class="tag">You made it across the Dead Stretch. This is the end of the first playable build.</p>
      <div class="endstats"><div class="stat"><b>${mins}:${String(secs).padStart(2, '0')}</b><span>Time played</span></div><div class="stat"><b>${Math.round(g.vehicle.odometer)} m</b><span>Driven</span></div><div class="stat"><b>${g.kills}</b><span>Husks killed</span></div></div>
      <div class="btns"><button class="btn" data-act="keepgoing">Keep exploring</button><button class="btn ghost" data-act="new">New game</button></div></div>`;
  }
  hideScreen() { this.el.screen.hidden = true; this.el.screen.innerHTML = ''; document.getElementById('app').classList.remove('intro'); }

  // ---------- per-frame HUD ----------
  update(dt) {
    const g = this.game, { survival, vehicle, player, env, input } = g;
    if (g.state === 'playing') {
      if (input.hitRaw('Escape')) { if (this.panel) this.close(); else this.open('menu'); }
      else if (input.hitRaw('Tab')) { if (this.panel === 'inventory') this.close(); else if (!this.panel) this.open('inventory'); }
      else if (this.panel && this.panel !== 'menu' && input.hitRaw('KeyE') && this.opened) this.close();
    }
    this.opened = !!this.panel; // so the E press that opened a panel does not also close it
    if (this.panel === 'loot' && this.searchT > 0) {
      this.searchT -= dt;
      const bar = $('searchbar');
      if (bar) bar.style.width = `${(1 - this.searchT / 0.9) * 100}%`;
      if (this.searchT <= 0) { this.ctx.searched = true; this.render(); }
    }
    // walking away from the truck or container closes its panel
    if (this.panel === 'vehicle' && !player.nearVehicle(2.5)) this.close();

    for (const [id, v] of [['health', survival.health], ['hunger', survival.hunger], ['thirst', survival.thirst], ['stamina', survival.stamina]]) {
      const el = $(`v-${id}`);
      el.querySelector('i').style.width = `${v}%`;
      el.querySelector('.num').textContent = Math.round(v);
      el.classList.toggle('low', v < 20);
    }
    $('region').textContent = REGION_NAMES[regionAt(player.x, player.z)];
    $('clock').textContent = `Day ${env.day}  ${env.clock()}`;

    const cur = g.objectives.current(), done = OBJECTIVES.length - g.objectives.list().filter((o) => !o.complete).length;
    const key = (cur ? cur.id : 'none') + done;
    if (key !== this.lastGoal) {
      this.lastGoal = key;
      this.el.goal.innerHTML = cur
        ? `<div class="goal-label">Goal</div><div class="goal-text">${cur.text}</div>${cur.hint ? `<div class="goal-hint">${cur.hint}</div>` : ''}<div class="goal-count">${done} of ${OBJECTIVES.length} done</div>`
        : '<div class="goal-label">Goal</div><div class="goal-text">All goals done. Explore freely.</div>';
    }

    const prompt = g.interaction.prompt;
    this.el.prompt.hidden = !prompt || g.state !== 'playing';
    if (prompt && this.el.prompt.dataset.t !== prompt) { this.el.prompt.innerHTML = prompt; this.el.prompt.dataset.t = prompt; }

    let warn = '';
    if (survival.toxicNow) warn = 'Toxic dust — get back in the truck';
    else if (player.driving && vehicle.temp >= 110) warn = 'Engine overheating';
    else if (survival.health < 25) warn = 'Badly hurt';
    this.el.warn.hidden = !warn; this.el.warn.textContent = warn;

    this.el.dash.hidden = !player.driving;
    if (player.driving) {
      const st = vehicle.stats();
      $('d-speed').textContent = Math.round(Math.abs(vehicle.speed()) * 3.6);
      const set = (id, frac, text, hot) => { const el = $(id); el.querySelector('i').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; el.querySelector('.num').textContent = text; el.classList.toggle('hot', !!hot); };
      set('g-fuel', st.capacity ? vehicle.fuel / st.capacity : 0, `${vehicle.fuel.toFixed(1)} L`, vehicle.fuel < 2);
      set('g-temp', (vehicle.temp - 25) / 100, `${Math.round(vehicle.temp)}°`, vehicle.temp >= 105);
      set('g-body', vehicle.chassis / 100, pct(vehicle.chassis), vehicle.chassis < 30);
    }
    this.drawMap();
  }

  // ---------- minimap ----------
  mapXY(x, z) { const w = this.map.width, h = this.map.height; return [((x - MAP.minX) / (MAP.maxX - MAP.minX)) * w, ((z - MAP.minZ) / (MAP.maxZ - MAP.minZ)) * h]; }
  drawMapBackground() {
    const c = document.createElement('canvas');
    c.width = this.map.width; c.height = this.map.height;
    const g = c.getContext('2d'), sx = c.width / (MAP.maxX - MAP.minX), sz = c.height / (MAP.maxZ - MAP.minZ);
    const colors = { scrapyard: '#5d5240', forest: '#33452a', station: '#55574a', town: '#55574a', stretch: '#8c7648', outpost: '#8c7648', wilds: '#47592f' };
    for (let x = MAP.minX; x < MAP.maxX; x += 4) for (let z = MAP.minZ; z < MAP.maxZ; z += 4) {
      g.fillStyle = colors[regionAt(x + 2, z + 2)];
      g.fillRect((x - MAP.minX) * sx, (z - MAP.minZ) * sz, 4 * sx + 1, 4 * sz + 1);
    }
    g.fillStyle = '#2a2b2c';
    g.fillRect((-12 - MAP.minX) * sx, (ROAD_Z - ROAD_HALF - MAP.minZ) * sz, c.width, ROAD_HALF * 2 * sz);
    g.fillStyle = '#6e6857';
    g.fillRect((RIDGE_X - 3 - MAP.minX) * sx, 0, 6 * sx, c.height);
    g.fillStyle = '#c9c2ae';
    for (const b of BUILDINGS) g.fillRect((b.x - b.hw - MAP.minX) * sx, (b.z - b.hd - MAP.minZ) * sz, b.hw * 2 * sx, b.hd * 2 * sz);
    g.fillStyle = '#df5a44';
    for (const p of PUMPS) g.fillRect((p.x - 1 - MAP.minX) * sx, (p.z - 1 - MAP.minZ) * sz, 2 * sx, 2 * sz);
    return c;
  }
  drawMap() {
    const g = this.map.getContext('2d'), { player, vehicle, world, cameraRig } = this.game;
    g.drawImage(this.mapBg, 0, 0);
    if (!world.barricade.broken) { const [bx, bz] = this.mapXY(RIDGE_X, ROAD_Z); g.fillStyle = '#df5a44'; g.fillRect(bx - 3, bz - 5, 6, 10); }
    const [ox, oz] = this.mapXY(OUTPOST.x, OUTPOST.z);
    g.strokeStyle = '#e2b445'; g.lineWidth = 2; g.beginPath(); g.arc(ox, oz, 6, 0, 7); g.stroke();
    const [sx1] = this.mapXY(STRETCH.from, 0), [sx2] = this.mapXY(STRETCH.to, 0);
    g.fillStyle = 'rgba(223,90,68,0.12)'; g.fillRect(sx1, 0, sx2 - sx1, this.map.height);
    const [vx, vz] = this.mapXY(vehicle.x, vehicle.z);
    g.fillStyle = '#7fb3b0'; g.fillRect(vx - 4, vz - 3, 8, 6);
    const [px, pz] = this.mapXY(player.x, player.z);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(px, pz, 4, 0, 7); g.fill();
    g.strokeStyle = '#14171a'; g.lineWidth = 1.5; g.stroke();
    const f = cameraRig.groundForward();
    g.strokeStyle = '#ffffff'; g.beginPath(); g.moveTo(px, pz); g.lineTo(px + f.x * 10, pz + f.z * 10); g.stroke();
  }
}
