import { Game } from './core/Game.js';
import { loadPack } from './models/pack.js';
import { loadTextures } from './gfx/pbr.js';
import { loadProps } from './models/props.js';

async function start(data) {
  // photo textures and hand-made models; the game still runs on painted textures and built-in shapes if these fail
  await Promise.all([loadTextures(), loadPack(), loadProps()]);
  const game = new Game(document.getElementById('view'));
  window.__rustbound = game; // handy in the browser console and used by the automated test
  // If the page is updated while someone is playing, carry their game across.
  if (data && data.save) { game.saves.apply(data.save); game.resume(); game.cameraRig.update(0, true); }
  window.claude?.hot?.snapshot?.(() => (game.state === 'playing' ? { save: game.saves.snapshot() } : {}));
}
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
