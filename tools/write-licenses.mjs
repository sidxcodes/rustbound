// Writes src/assets/LICENSE.md: every outside asset the game embeds, with its author, source and licence.
// Run after the converters: node tools/write-licenses.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { TEXTURES, MODELS, HDRIS, MIXAMO, SKETCHFAB } from './assets.config.mjs';

const credits = existsSync('assets-src/polyhaven/credits.json') ? JSON.parse(readFileSync('assets-src/polyhaven/credits.json', 'utf8')) : {};
const has = (dir, re) => existsSync(dir) && readdirSync(dir).some((f) => re.test(f));
const row = (use, id) => { const c = credits[id] || {}; return `| ${use} | [${c.name || id}](https://polyhaven.com/a/${id}) | ${(c.authors || []).join(', ') || 'Poly Haven'} | CC0 1.0 |`; };

let md = `# Asset credits and licences

Everything listed here is embedded in \`dist/index.html\`. Each asset was converted by a script in
\`tools/\` (resized to 1024 px or smaller, re-encoded as WebP, meshes simplified and quantized).

## Poly Haven (CC0 1.0, public domain)

Source: https://polyhaven.com. Licence: https://polyhaven.com/license (CC0: no attribution required;
credited here as thanks). Downloaded by \`tools/fetch-polyhaven.mjs\`.

### Surface textures (\`src/assets/tex\`, converted by \`tools/convert-textures.mjs\`)

| Used for | Asset | Author | Licence |
| --- | --- | --- | --- |
${Object.entries(TEXTURES).map(([k, t]) => row(k, t.id)).join('\n')}

### Models (\`src/assets/props\`)

Plants marked *baked* were rendered into camera-facing cards by \`tools/bake-impostors.mjs\`; the
rest were simplified by \`tools/convert-models.mjs\`.

| Used for | Asset | Author | Licence |
| --- | --- | --- | --- |
${Object.entries(MODELS).map(([k, m]) => row(`${k}${m.impostor ? ' (baked)' : ''}${m.variant ? ` (${m.variant} variant)` : ''}`, m.id)).join('\n')}

### Sky (\`src/assets/env\`, converted by \`tools/convert-env.mjs\`)

| Used for | Asset | Author | Licence |
| --- | --- | --- | --- |
${Object.entries(HDRIS).map(([k, h]) => row(`${k} lighting and reflections`, h.id)).join('\n')}

## Quaternius, Zombie Apocalypse Kit (CC0 1.0, public domain)

The \`.glb\` files directly in \`src/assets\` come from the **Zombie Apocalypse Kit** (March 2024) by
**Quaternius** (https://quaternius.com), CC0 1.0. Converted by \`tools/convert-pack.mjs\`. They are now
the fallback for anything whose realistic replacement is missing, plus a few small street props
(traffic cones, plastic barriers, traffic light).
`;

md += has('src/assets/mixamo', /\.glb$/) ? `
## Mixamo (Adobe)

Characters and animations from https://www.mixamo.com, used under Adobe's terms: Mixamo characters and
animations may be used royalty free in personal, commercial and non-profit projects, including video
games (https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html). They may not be redistributed as
standalone files, so the downloaded FBX files (\`assets-src/mixamo\`) and the converted \`.glb\` files
(\`src/assets/mixamo\`) are **kept out of git** (see \`.gitignore\`). They exist only inside the built game.
Run \`node tools/convert-mixamo.mjs\` after downloading them as listed in \`assets-src/DOWNLOADS.md\`.

| Game character | Mixamo character | Animations |
| --- | --- | --- |
${Object.entries(MIXAMO).filter(([k]) => existsSync(`src/assets/mixamo/${k}.glb`)).map(([k, m]) => `| ${k} | ${m.character} | ${m.animations.join(', ')} |`).join('\n')}
` : `
## Mixamo (Adobe): not included yet

The realistic characters need a Mixamo login to download. See \`assets-src/DOWNLOADS.md\`. Until then the
Quaternius characters are used. Mixamo files must stay out of git (Adobe allows them inside games but
not as standalone files).
`;

const sf = SKETCHFAB.filter((m) => existsSync(`src/assets/vehicles/${m.file}.glb`));
md += sf.length ? `
## Sketchfab (CC BY 4.0)

These models are licensed under Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/).
They were changed for the game: re-oriented, rescaled, split into parts (wheels, body), textures resized
and re-encoded, meshes compressed.

| Used for | Model | Author | Licence |
| --- | --- | --- | --- |
${sf.map((m) => `| ${m.use} | [${m.name}](${m.url}) | [${m.author}](${m.authorUrl}) | CC BY 4.0 |`).join('\n')}
` : `
## Sketchfab: not included yet

The realistic truck and wrecks need a Sketchfab login to download. See \`assets-src/DOWNLOADS.md\`. Until
then the Quaternius vehicles are used.
`;
writeFileSync('src/assets/LICENSE.md', md);
console.log('wrote src/assets/LICENSE.md');

// The same credits, short, for the in-game Credits screen (CC BY asks for credit where players see the work)
const ph = (list) => [...new Map(list.map((id) => [id, credits[id] || { name: id, authors: [] }])).entries()].map(([id, c]) => ({ name: c.name || id, by: (c.authors || []).join(', '), url: `https://polyhaven.com/a/${id}` }));
const groups = [];
if (sf.length) groups.push({ title: 'Truck and wrecks', licence: 'CC BY 4.0, from Sketchfab, changed for the game', items: sf.map((m) => ({ name: m.name, by: m.author, url: m.url })) });
const chars = Object.entries(MIXAMO).filter(([k]) => existsSync(`src/assets/mixamo/${k}.glb`));
if (chars.length) groups.push({ title: 'Characters and animations', licence: 'Mixamo (Adobe)', items: chars.map(([, m]) => ({ name: m.character, by: 'Mixamo', url: 'https://www.mixamo.com' })) });
groups.push({ title: 'Textures, props, plants and sky', licence: 'CC0, from Poly Haven', items: ph([...Object.values(TEXTURES), ...Object.values(MODELS), ...Object.values(HDRIS)].map((a) => a.id)) });
groups.push({ title: 'Fallback models and street props', licence: 'CC0', items: [{ name: 'Zombie Apocalypse Kit', by: 'Quaternius', url: 'https://quaternius.com' }] });
writeFileSync('src/assets/credits.json', JSON.stringify(groups));
console.log('wrote src/assets/credits.json');
