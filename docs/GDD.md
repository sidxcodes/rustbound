# Rustbound — Game Design Document

Version 0.1 (first playable). November 2026.

## 1. Pitch

A top-down 3D survival game where your truck is your progress bar. You explore on foot to find parts, and every part you fit lets the truck take you somewhere your legs cannot.

**The loop:** explore → scavenge → survive → find parts → repair → upgrade → drive farther → new area.

**What makes it its own game.** Survival games usually treat a vehicle as a reward at the end. Here the vehicle is the main character: it has more stats than the player, every part is a real object with its own condition, and each region is gated by something the truck must be able to do (start, carry fuel, stay cool, break through).

## 2. Pillars

1. **The truck is the progression.** No player levels. New areas open because the truck got better.
2. **Parts are physical.** A part is an item with a condition. You carry it, fit it with a wrench, and feel the difference when you drive.
3. **Every trip is a decision.** Fuel, heat, tyres, daylight and backpack weight all push against "just one more building".
4. **Readable from above.** Top-down camera, clear silhouettes, roofs that fade when you walk in.

## 3. Camera and look

- Perspective camera, about 56° above the horizon, following the player. Rotates in 45° steps (Q/E), zooms with the wheel.
- While driving it pulls back with speed and looks ahead of the truck. C switches to a third-person chase camera.
- Gritty and realistic, in the style of top-down mobile survival games: real proportions, worn photo surfaces, a muted palette of olive, brown, rust and grey, soft shadows, day and night. The style is the goal; no assets are taken from any other game.
- Surfaces are photo-scanned PBR textures (colour, normal, roughness) from Poly Haven, CC0. The ground blends grass, dirt, cracked earth and sand by region.
- Props, rocks and stumps are photo-scanned Poly Haven models, simplified for real-time use. Trees, bushes and grass are baked impostors: pictures of the scanned plants on a few crossed cards, instanced in culled chunks. Buildings are built in code to match their colliders exactly and wear the photo textures; roofs fade when you walk in.
- Light: a photographed sky for reflections and sky light, a warm sun, a cool moon, neutral tone mapping. High adds ambient occlusion, bloom, a desaturated colour grade (olive mid-tones, cool shadows, greyer at night) and a vignette. Low skips the expensive effects and uses half-size textures.
- Characters are Mixamo characters and animations with realistic proportions (a survivor in tactical gear, two kinds of husk). Walk and run cycles are matched to the real movement speed. The truck is a rusty Sketchfab pickup (CC BY) with removable, steering, rolling wheels, working lights and a welded bull bar; wrecks are Sketchfab wrecks.

## 4. The truck

### Slots

| Slot | Needed to drive | Effect |
| --- | --- | --- |
| Engine | Yes, at 25% condition or more | Power and top speed scale with condition |
| Battery | Yes | Starts the engine, runs the lights |
| Fuel tank | Yes, with fuel in it | 40 L capacity |
| Wheels × 4 | Yes | Grip from tyre type × condition; off-road rating changes dirt speed and grip |
| Radiator | No | Without it the engine overheats in about 35 s of hard driving |
| Bumper (bull bar) | No | Breaks barricades at speed, halves front crash damage |
| Headlights | No | Light at night |
| Roof rack | No | +30 kg trunk space |

### Stats derived from parts

Engine power, tyre grip, off-road ability, top speed, cooling, trunk capacity. Nothing is a hidden number: the truck panel shows them and they feed straight into the physics.

### Wear and damage

- Tyres wear with distance, faster off the road.
- Overheating (110° and above) burns engine condition and halves power; at 125° the engine cuts out.
- Crashes above about 18 km/h damage the chassis. At 0% the truck will not run until patched.
- Repair kits restore 35% to one part or the chassis.

### Driving model

Single rigid body on flat ground with a two-axle tyre model. Each axle produces a sideways force that cancels its slip up to a limit of grip × load. Effects you can feel: understeer at speed, slower and looser handling on dirt with road tyres, handbrake slides, spin from off-centre hits.

## 5. Survival

| Stat | Drains | At zero |
| --- | --- | --- |
| Hunger | 100 → 0 in 15 min | −1.5 health per second |
| Thirst | 100 → 0 in 12 min | −1.5 health per second |
| Stamina | Running | Cannot run |
| Health | Husks, toxic dust, starvation, bad water | Death; reload the last save |

Health slowly regenerates when hunger and thirst are both above 50. Backpack limit is 40 kg; over it you walk at about half speed and cannot run. One day lasts 8 minutes.

## 6. World (first playable)

One handcrafted map, 520 m × 180 m, with a road running east.

| Region | Why go there | Gate |
| --- | --- | --- |
| Scrapyard | Wrench, two wheels, scrap, first fuel can | None. Start here |
| Pine forest cabin | Battery | On foot, two husks |
| Fuel station | Pump with 60 L, roof rack | Easier by truck |
| Harlow (town) | Radiator, bull bar, off-road tyres | Seven husks |
| Barricade | — | Needs the bull bar and speed |
| The Dead Stretch | — | Toxic on foot: you must be in the truck |
| Ridge Outpost | End of this build | — |

## 7. Enemies

Husks wander near where they spawn, notice you at 12 m (farther at night or when you drive), chase, and hit for 9 health. Dust husks in the Dead Stretch are faster and tougher. They attack the truck's chassis if you sit still, and die if you hit them above about 16 km/h, which costs a little chassis unless you have the bull bar.

## 8. Architecture

Each system is one class in `src/systems`, created by `Game` and reached through `game.*`. Systems send messages through a small event bus (`toast`, `sfx`, `objective`, `death`, `win`). Content lives in data files, not in code:

- `data/items.js`: items, vehicle parts and their stats, slots, recipes, loot tables.
- `data/layout.js`: buildings, containers and their contents, enemies, pumps, region boundaries.

Frame order: UI keys → interaction → player → vehicle (fixed 120 Hz sub-steps) → enemies → survival → goals → autosave → world → environment → audio → camera → render.

Save data is one JSON object built from each system's `toJSON()`.

## 9. Engine choice and the road ahead

This build uses **Three.js in the browser** so that every change can be played and tested straight away, and so the game runs from a link.

For a full PC release, the recommended engine is **Godot 4**:

- Free and open source, with no licence fee or revenue share.
- Small download, fast to iterate, GDScript is quick to learn from JavaScript or Python.
- `VehicleBody3D` and Jolt physics cover raycast-suspension vehicles.
- Resources (`.tres`) map directly onto the data-driven design here.

Unity with C# has the larger job market and asset store and is a fair choice if the goal is a studio job. It is heavier and its vehicle tooling needs paid assets or custom work.

The design carries over. `items.js` and `layout.js` become Godot resources, and each system class becomes a node script with the same responsibilities.

## 10. Roadmap

| Phase | Content | Status |
| --- | --- | --- |
| 1. Playable foundation | 3D world, character, camera, movement, collision | Done |
| 2. Survival and scavenging | Items, inventory, looting, health, hunger, thirst, crafting | Done |
| 3. Vehicle gameplay | Drivable truck, physics, enter/exit, fuel, condition | Done |
| 4. Restoration | Modular parts, fit/remove/repair, truck panel | Done |
| 5. World expansion | Shelter building, weather, more regions and enemy types, a second vehicle, ranged weapons | Planned |
| 6. Polish | Realistic art: photo surfaces, scanned props, plants, lighting, characters, truck (done); recorded audio, controller and touch input, balance | In progress |

## 11. Known limits of this build

- Flat terrain. There are no hills, so suspension is visual only.
- Husk path-finding is a simple "walk around what blocked me" rule, not a navigation mesh.
- Sound is synthesised beeps and an engine hum.
- Saves live in the browser on one device.
- No touch or controller support.
