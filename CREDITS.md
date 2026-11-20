# CREDITS — 索拉纳港 Port Solana (v3)

Everything shipped in `dist/` and where it comes from. Original game: no Rockstar / GTA names, characters, logos or assets.

| Asset (dist/assets) | Source | Author | License |
|---|---|---|---|
| sky_day / sky_golden / sky_sunset / sky_dusk.jpg | Poly Haven HDRIs `kloofendal_48d_partly_cloudy_puresky`, `evening_road_01_puresky`, `qwantani_dusk_2_puresky`, `belfast_sunset_puresky` (re-projected, sun disc removed, tools/assets.py) | Greg Zaal / Jarod Guest / Poly Haven | CC0 |
| asphalt_*, sidewalk_*, concrete_*, pavers_*, plaster_*, sand_*, grass_* | Poly Haven `asphalt_02`, `concrete_floor_02`, `concrete_wall_003`, `pavement_03`, `white_plaster_02`, `painted_concrete`, `coast_sand_01`, `leafy_grass` (re-graded) | Poly Haven | CC0 |
| frond.png, leafcluster.png, bark_d.jpg | derived from Poly Haven `island_tree_02` leaf/branch textures (tools/assets.py) | Poly Haven | CC0 |
| waternormals.jpg | three.js examples textures | three.js authors | MIT |
| car_sport.glb, car_sport_lod.glb | "Ferrari 458 Italia" glTF from the three.js examples (optimised, tools/optcar.mjs) | vicent091036 (Sketchfab) | CC BY 4.0 (as credited in three.js webgl_materials_car) — attribution shown here |
| ch_hero, ch_m1–m4, ch_f1–f4, ch_cop.glb (v3.1+) | ara3d presets (Athletic man, The Miami Dealer, The Corporate High-Flier, The Gangster, Elder, Athletic woman, Businesswoman, The Beach Girl, Teen, The American Sheriff), exported with `tools/make_cast.sh`, webp+meshopt | Bodies/clothes/skins: MakeHuman project (CC0); generator: ara3d / olatunde85 (MIT); motion: CMU Graphics Lab Motion Capture Database (free incl. commercial use, data obtained from mocap.cs.cmu.edu, funded by NSF EIA-0196217) | CC0 + CMU mocap terms |
| ~~veh_car, veh_suv, veh_pickup, veh_sports.glb~~ (v3.2–v3.4, retired in v3.5) | ara3d vehicle props (`car`, `suv`, `pickup`, `sports_car`) exported with `npx ara3d export --vehicle`, converted to static body + 4 wheel nodes (tools/splitcar.mjs), meshopt | ara3d / olatunde85 | MIT (package licence) |
| ph_hydrant.glb, ph_bin.glb, ph_cafe.glb (v3.5) | Poly Haven models `fire_hydrant`, `metal_trash_can`, `outdoor_table_chair_set_01` (1k, variant duplicates removed, textures → WebP 512, simplified, meshopt; tools/phprop.mjs) | Poly Haven (polyhaven.com) | CC0 |
| Traffic car bodies + wheels (v3.5) | procedural lofted bodies / lathe+extrude wheels (src/carbody.js, src/vehicles.js) — original designs | original | — |
| Palms, broadleaf trees, frond / fan / bark textures (v3.5) | procedural geometry + canvas-generated textures (src/veg.js) | original | — |
| Facade relief, balconies, canopies, rooftop equipment, Deco curves, kerbs (v3.5) | procedural geometry (src/city.js) | original | — |
| Mission framework + 4 missions, valet job (v4.0/v4.3) | src/missions.js, src/mission.js — original missions, names and dialogue | original | — |
| Weapons, weapon wheel, melee, cover (v4.3) | src/weapons.js — original implementation, generic weapon names, DOM/SVG UI | original | — |
| Phone, shops, ATM, protagonists, street event, autosave (v4.3) | src/world.js — invented shop / character names (海岸枪械行、潮汐衣橱、马特奥、伊莎…) | original | — |
| Police helicopter, road blocks, search zone (v4.3) | src/police.js — procedural low-poly helicopter | original | — |
| Car radio stations (v4.3) | generative WebAudio patterns (src/sfx.js), invented station names | original | — |
| Map additions: container yards, gantry cranes, marina piers + yachts, lighthouse, Ferris wheel, alleys (v4.3) | procedural geometry (src/city.js), layout in MAP_DESIGN.md / src/mapdata.js; map image tools/mapgen.cjs | original | — |
| Anton-Regular.ttf | Google Fonts | Vernon Adams | SIL OFL 1.1 |
| three.js, esbuild | npm | three.js authors / Evan Wallace | MIT |
| Audio | synthesized at runtime (src/sfx.js) | original | — |
| Street signs, street-name blades, shop sign boards, bus-shelter ads (v3.4) | drawn at runtime on canvas (src/street.js); invented names; text uses the player's system CJK font | original | — |
| Utility poles, wires, shelters, kiosks, drains, bike-lane / arrow markings, storefront interiors (v3.4) | procedural geometry / shaders | original | — |

Removed in v3.1: Mixamo `Michelle.glb`, `Soldier.glb` (three.js examples) and the Ready Player Me avatar `Man.glb` (licence unclear).

Reference stills in `v3/ref/gta6/` (© Rockstar Games and the capturing sites) are used only for visual study and are **not** part of `dist/`.
