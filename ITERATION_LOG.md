# v3 iteration log — PORT SOLANA (GTA6-look WebGL2 open world)

Each round: build → headless SwiftShader screenshots (`node shot.cjs plans/round.json shots/rN`) → compare with
`TARGETS.md` references → fix the biggest gap. Screenshots per round live in `shots/rN/`.

## R1 — first light (shots/r1)
- New engine from scratch: HDRI panoramas (Poly Haven) blended over time of day, height fog, Poly Haven PBR textures,
  procedural Art Deco / condo / downtown tower generator with a facade shader, road shader (markings, wear, wet), planar-reflection water.
- Gap: image milky/flat (fog far too dense, AgX desaturated, no visible sun), textures too dark/rusty (concrete_wall_003 is stained orange),
  facade window grids aliasing (moiré) at distance.
- Fixes: fog density ÷2.4, ACES tone mapping, re-graded every albedo map to a measured target colour (`tools/assets.py` TARGET table),
  fwidth-based anti-aliasing of the procedural window grid, sidewalk joint lines, interior blinds.

## R2 — sky + sun (shots/r2, r3, dbg_g)
- Gap: overcast lilac sky (Belfast HDRI), Art Deco fronts in shadow at golden hour, **no shadows at all**.
- Root causes found: (1) CSM addon cascades never received shadows in this pipeline → replaced with one 4096² directional shadow map that follows
  the camera with texel snapping; (2) sky fill was ~1:1 with the sun → sun raised to 7.5–9 and IBL lowered to 0.55–0.6, exposure re-balanced.
- Added `evening_road_01_puresky` as the golden-hour sky; sun path now sets over the ocean so the beach-facing hotel fronts get warm light.
- HDRI sun discs removed in the asset pipeline (game draws its own sun at the simulated position).

## R3 — gameplay online (shots/g1–g3)
- Traffic (lane following, turns at intersections, signal phases, following distance), pedestrians on sidewalk loops,
  carjacking (F), pistol (raycast, tracers, muzzle flash), wanted 1–5 with police cruisers (road-grid pursuit), officers on foot who shoot,
  arrest/death + respawn, HUD (rounded minimap with health/armour bars, stars, cash, area/clock), synthesized audio.
- Gap: characters upside-down (Mixamo Hips rotation differs between rigs) → hips rotation track dropped for non-native rigs; Michelle model is stylised
  (cartoon dancer) → protagonist switched to the Ready Player Me male, clothing recoloured per outfit part.
- Logic sim: enter car ✓, drive 100+ km/h ✓, crime → wanted 2-3 ✓, 2–4 police cars dispatched ✓, officers kill player → respawn ✓, no console errors.

## R4 — night + architecture (shots/r4, r5)
- Gap: night storefronts blown out, wet road a purple mirror, downtown = plain boxes.
- Fixes: neon tubes on hotel cornices/eyebrows/pylons, fake room interiors behind glass (depth, ceiling light, furniture), reduced wet reflection,
  darker night sky; downtown towers now: chamfered curtain walls with vertical fins + setbacks + spires, round glass towers, twin white condo slabs
  with deep balconies, stepped concrete towers, LED crown lights.
- Triangle budget: palms were 1.4 M tris (1,460 palms) → fewer street palms + lighter palm meshes.

## v3.1 — 2026-11-20 (scheduled round 1; shots/r8)
- **Night wet-road blue/purple bug fixed.** Root cause: the water `Reflector` re-rendered itself inside the GTAO normal pass
  (`scene.overrideMaterial` = normal material), so the shared planar-reflection texture that wet roads sample held view-space normals
  (blue/purple). The reflection is now rendered explicitly once per frame before the main pass (`water.renderRefl`), and the per-draw hook
  is disabled — also saves one full scene render per frame.
- Wet asphalt reflections: 5-tap vertical smear (streaky lamp/signal/neon reflections), stronger in puddles; lamp point lights 6 → 10.
- **Characters replaced**: Mixamo Michelle/Soldier and the Ready Player Me man (licence unclear) removed. New cast of 10 realistic
  MakeHuman (CC0) people exported with ara3d (MIT) carrying their own CMU-mocap Idle/Walk/Run/Pistol aim/Death clips
  (`tools/make_cast.sh`, webp+meshopt, hero 1024² textures, others 512²): hero = casual shirt + jeans; peds = pink-suit, business suit,
  streetwear, elder, athletic woman, businesswoman, beach girl, teen; police = sheriff uniform. Clothing hue variation per ped;
  death uses the mocap fall clip. Shared shader program keys for all character materials (per-material keys made first render 3× slower).
- CREDITS.md and ROADMAP.md added.
- Verified: build ok; street / onfoot / drive / night / cops shots; sim: enter car → 63 km/h, crime → 3★, 4 police cars dispatched,
  ped death clip plays; no PAGEERROR.
- Known: traffic still boxy procedural bodies + one sports-car model; storefront glass reads black in shade; facades flat; crowd 30.
- Publishing: the page publisher uploads ONLY index.html (multi-file attempt failed: assets missing). `node tools/single.cjs` now builds
  dist_single/index.html (~23 MB: main.js + every asset as data: URIs, textures re-encoded to WebP; main.js resolves assets via window.__A).
  Verified locally (DIST=dist_single node shot.cjs …). Published to Page 「索拉纳港 Port Solana」 project_id 96467e5f-2878-4d1a-9518-c2d2f5c38458.

## v3.2 — 2026-11-20 (scheduled round 2; shots/r9)
- **Traffic vehicles replaced**: the boxy procedural sedan/SUV/pickup/taxi/police bodies now use 4 ara3d vehicle models (car, suv,
  pickup, sports_car; MIT) — skinned props converted to static body + 4 rotating wheel nodes (tools/splitcar.mjs), creased normals,
  materials mapped to the game's clear-coat paint / glass / tyre / head- & tail-light materials, per-car paint colour; taxi roof sign,
  police light bar. Ferrari stays as the player's sports car (`sport`).
- Verified: build ok; drive / cops / lineup2 (all types side by side) / night shots; sim: enter car 45–63 km/h, crime → 3★,
  police car dispatched, ped death ok; no PAGEERROR. Published dist_single (23.4 MB) to Page 「索拉纳港 Port Solana」.
- Known: ara3d cars are low-poly / slightly toy-like up close (no interior detail, simple wheels) → want higher-fidelity CC0/CC-BY cars
  later; van type still procedural; facades flat; storefront glass dark in shade; crowd 30.
- Tooling gotcha: `pgrep -f "shot.cjs …"` inside a bash -c matches itself — don't wait on it that way.

## v3.3 — 2026-11-20 (scheduled round 3; shots/r10)
- Facade geometry (city.js `facadeDetail`): punched-window Deco/stucco blocks get projecting sills, jambs, lintels, floor bands, pilasters, AC units, planters.
- Verified: build ok; street shot, no PAGEERROR. Drive/night/cops sims NOT re-run this round (Chromium system libs had to be reinstalled: `sudo npx playwright install-deps chromium`).
- Known: midrise/condo/tower facades still flat; tower glass, night lights, crowd unchanged.

## v3.4 — 2026-11-20 (GTA 6 research + fidelity pass; shots/r11base → r12 → r13 → r14 → r15)
- **Research**: `GTA6_REFERENCE.md` written (HUD, camera, grade, lighting, atmosphere, city, vehicles, people, beach, audio, systems,
  each with source URLs) + 55 reference stills in `ref/gta6/` (study only, not shipped). Top-10 gap list vs fresh `shots/r11base`.
- **Grade/sky** (gap 1): sky shader deepens + saturates blue sky pixels toward the zenith while keeping neutral clouds white, horizon
  haze no longer whitens the upper sky; day/golden fog bluer + thinner; teal-orange split toning replaced by a neutral-filmic grade
  (black point, stronger S-curve, lighter vignette/grain); golden-hour sun scattering + shafts toned down (whiteout when facing the sun).
- **Night** (gap 8): realistically dark (exposure/env down at night), stronger contrast; shop-window light spill + neon colour pools on
  sidewalks; every car has an additive headlight cone + red tail glow on the road at night.
- **HUD** (gap 4): GTA6 corner layout with original styling — top-left slim health/armour/stamina bars with icons, top-right small
  6-star row (white = seen, red blinking = search) + red evidence dots (脸/衣/车/枪) + weapon/ammo + cash (contextual fade, Tab peeks),
  bottom-left light translucent rounded-rect minimap with N marker, blue chase tint, red search zone (no police dots), dark plate at
  night; area name only fades in on district change. Wanted max raised to 6.
- **Street clutter** (gap 2, new `src/street.js`): 323 wooden utility poles with crossarms/insulators/transformers + sagging power and
  phone lines; ~500 signs (speed limit, ped crossing, no parking, one-way, parking hours, bus stop) + green street-name blades at every
  signal; 10 bus shelters with backlit ads; newspaper boxes, utility cabinets, bins, parking meters, bollards; storm drains + manholes.
- **Signage/storefronts** (gap 5): storefront shader rewritten (pale back wall, small merchandise on shelf rows, ceiling troffers,
  window posters, door bars) — no more dark checkerboards; 32 original shop sign boards on awning valances + projecting blade signs.
- **Roads** (gap 6): lane arrows before stop lines, green bike lanes with dashed conflict zones (island/bayfront streets).
- **Vegetation** (gap 3): +500 broadleaf canopy trees on side streets/avenues; palm/leaf albedo + translucency raised (no black fronds).
- **Beach** (gap 9): sand brighter/creamer; umbrella clusters ×8 (~620 umbrellas/towels/coolers).
- **Reflections/materials** (gap 10): cube reflection probe over the bay (PMREM) as env map of the building material — tower glass now
  reflects the skyline/island/water; refreshed every 0.75 game-hours. Car paint gets per-car road dust/grime on the lower body.
- **Density** (gap 7): peds 28→40 (cap 42), civilian traffic cap 20→27.
- Publishing robustness: main.js loads `assets/<f>` and falls back to `<f>` (works whether the host keeps the folder or flattens it).
- Verified each round with screenshots (street, onfoot, side street, beach, skyline, night, night drive, noon, cops) and the sim:
  enter car → 63 km/h, crime → 3★, police cars dispatched, ped death clip, no PAGEERROR.
- Published (main agent, 11:28 CST): dist_single 23.4 MB → Page 96467e5f. Known after v3.4: backlit golden-hour shots blow out to white; mid-rise/tower facades flat; density still low; no coloured crosswalks/flowering trees/sunbathers.

## v3.5 — 2026-11-20 (model fidelity round 1; user: "建模还是太粗糙了，优化"; shots/v35_base → v35_r1)
- Baseline close-ups (`plans/cuA.json`, `cuB.json` → `shots/v35_base/`), crudest models ranked by screen share:
  1 downtown podium/office/midrise facades (flat boxes with painted windows), 2 palms (flat frond strips), 3 broadleaf trees
  (lollipop card balls), 4 traffic cars (cartoon ara3d bodies, toy wheels), 5 Deco hotels (square boxes), 6 kerbs (square slab
  edges), 7 street furniture (box benches/bins/hydrants), 8 characters (acceptable).
- **Facades (city.js)**: generic `relief()` geometry aligned with the window shader (prismWalls now per-edge uv): deep piers between
  windows + spandrel bands + projecting sills on punched facades; metal mullion fins + slab-edge bands on curtain walls; cornices.
  Podium canopies with fascia + tie rods; midrise balconies (glass or stucco parapet, rails); condo slabs get privacy dividers,
  double top rail, slab soffits. Rooftops: parapet with coping, mechanical penthouse with louvres, AC condensers with fan discs,
  water tanks on legs (banded, conical lid), antenna masts, satellite dishes; podium roofs keep clear of the tower footprint.
- **Art Deco**: ~60% of hotels get rounded front corners; eyebrows, cornice, coping, accent stripes and neon tubes wrap around the
  curves (`roundFront`, `ledge`); stepped parapet blocks.
- **Kerbs**: bevelled kerb arris + 0.3 m kerb stone + concrete gutter pan along every block.
- **Palms (veg.js, rewritten)**: 3 species — coconut (curved leaning ringed trunk, 22 drooping fronds, coconut cluster, dead brown
  fronds), royal (smooth grey bulging trunk, glossy green crownshaft, plumose arching fronds), sabal (boot-textured trunk, ~30
  costapalmate fan leaves on petioles). Fronds = rachis ribbon + two drooping leaflet wings on a canvas-generated leaflet alpha
  texture (gaps between leaflets); bark albedo + normal maps generated at runtime; golden-angle phyllotaxis; near/far LOD swapped per
  instance around the camera (75 m).
- **Broadleaf trees**: branching skeleton (trunk → 4–5 limbs → 3–4 sub-branches, tapered tubes) with leaf clumps at the tips + inner
  fill (oak and sea-grape shapes, 4 variants), near/far LOD.
- **Vehicles**: new `src/carbody.js` — original lofted bodies (sedan, SUV, minivan, crew-cab pickup) from smooth side/plan profiles
  and superellipse sections, wheel arches cut into the sill, greenhouse with tinted glass + black B/C pillars + seals, panel-gap
  lines, hood/trunk shut lines, lens-shaped headlights with bezels, amber indicators, tail lamps + light bar, grille slats, intake,
  fog lamps, mirrors, door handles, plates, cabin interior (seats, headrests, dash, wheel), wheel-well liners. All traffic except
  sports cars uses them (taxi/police on the sedan). Procedural wheels everywhere: lathe tyre with rounded sidewall + grooves,
  extruded 5/6/10-spoke alloy face with bevels, lip, lugs, centre cap, brake disc + caliper. `sport2` traffic now uses the Ferrari
  (CC BY) with random paint. ara3d veh_*.glb retired (moved to raw/models/retired).
- **Street props**: Poly Haven CC0 fire hydrant, metal trash can, outdoor table + chairs (webp 512, meshopt, variant duplicates
  stripped with tools/phprop.mjs) instanced at corners / promenade / café terraces.
- Perf: first sim OOM-killed the headless browser → trimmed (buried relief faces skipped, no balusters, lighter tree tubes, tree LOD,
  palm LOD 75 m, props simplified, café sets halved). Sim then ok.
- Verified: close-ups `shots/v35_r1/` (palm, palms2, tower, condo, deco, deco2, trees, kerb, car lineup/sedan/rear/side/wheel);
  sim: enter car → 63 km/h, crime → 3★, police car dispatched, ped death clip; no PAGEERROR. Single file 23.4 MB.
- Published v3.5 (11:27 UTC 04:27) dist_single 23.4 MB → Page 96467e5f.

## v3.6 — 2026-11-20 (model fidelity round 2; shots/v35_base cu_prom/beach/lamp/crown → v36_r2)
- **Street lights**: tapered 12-sided pole, plinth + collar + anchor bolts, smooth tube arm, lathe cobra-head luminaire.
- **Traffic signals**: heads with backplates (yellow reflective border), 3 lens visors, hangers.
- **Promenade benches**: 5 seat slats + 3 raked back slats on extruded cast-iron scroll side frames.
- **Beach**: 8-rib umbrellas with panels sagging between ribs, scalloped valance, ribs + finial, tilted poles; reclining loungers
  (rails, legs, 9 slats, raised backrest); Miami-style lifeguard stands (splayed legs + cross braces, tube railings, round hut with
  ribbon window band + stripe, domed overhanging roof, flag, ramp with handrails).
- **Parking meters**: elliptic head, dome, display window, collar.
- **Shrubs**: 4 variants of 3–4 overlapping sub-clumps (mounds, not balls); bougainvillea-magenta and coral flowering variants.
- **Tower crowns**: glass curtain-wall towers get a glass screen crown (5–11 m) hiding the plant + light band; round towers a
  glass crown ring; residential towers a floating roof canopy on slim columns with a light band. Old inward-facing `fins()` dropped.
- **Shopfronts** on every store band: piers between bays, projecting transom/sign ledge, stone kick plate.
- **Cars**: wheel-arch lips, wipers, roof antenna fin, exhaust tips; steering wheel lowered.
- Verified: close-ups shots/v36_r2 (prom, beach, lamp, crown); sim drive 63 km/h → crime 3★ → 2 police cars → ped death, no PAGEERROR.
- Published v3.6 (04:48 UTC) dist_single 23.5 MB → Page 96467e5f.
- (main agent 12:54 CST) v3.6 is live on Page 96467e5f; copy at release/port-solana-v3.6.html. v3.7 code (awnings, kerb ramps, pickup bed, roof rails) builds but is UNVERIFIED (OOM in headless): next run must re-run plans/cuR4.json + plans/v35sim.json, then single.cjs + publish, log v3.7, update ROADMAP.md. Crudest remaining: flat tower windows (no frames/interiors, shimmer), simple car bodies (no creases, steering wheel through windscreen), card foliage dark from below, box-like bus shelters/cabinets/poles, no character LOD + thin crowds, backlit beach whiteout, plain seawall. Scene ~4.4M tris; memory is the constraint.

## v4.0 — 2026-11-20 (电影质感 v4 round 1；接手崩溃的子代理；shots/v4_base → v40 → v41a → v40_r2 → v40_r3)
- 接手：上一个子代理在 15:14 CST 改过 src（缩城、两级阴影、后期链、v4.1 车身/窗户视差/叶片透光/霓虹点光/海堤、v4.2 近景设施/角色 LOD），没有汇报，崩溃原因是全局 OOM（dmesg 里 chrome-headless 被 oom-kill）。代码保留，没有推倒重来。
- **缩城（已在代码里，本轮验证）**：只保留 Art Deco 海滨大道 Tideline Dr（x=290）、两条内街（x=170、x=50）、五条横街（z=±300、±150、0）、海滩（x 335–480）。岛 357×744 m。东侧是海滩，海滩两端是乱石防波堤，西侧是海堤（压顶、抛石、系船柱），路尽头有路障，市中心换成低模天际线（无碰撞、无道路）。场景 4.42M 三角形（v4_base 是 5.41M）。
- **后期链（v4.0 代码，本轮验证）**：HDR → GTAO → LightFX（屏幕空间接触阴影 + 带深度遮挡的体积光）→ bloom → Lens（驾驶动态模糊、拍照景深）→ ACES → 程序化 3D LUT（白天暖橙高光配青蓝阴影，夜晚青品）+ 暗角 + 色差 + 颗粒 → FXAA。两级 4096 阴影（近景 32 m 半宽，约 1.6 cm 每像素；远景 180 m），街景反射探针用于车漆和玻璃。
- **本轮修复（v4.3 标记）**：
  - Bug：后期 LightFX 加 NaN/Inf 防护。之前一个车辆坐标异常就会让整帧经 bloom 扩散成全黑（shots/v41a/drive.png → v40_r3/drive.png 正常）。
  - Bug：夜景霓虹点光离墙 1.2 m，造成白色过曝光斑 → 移到离墙 3 m、高度 ≤4.2 m、强度 26→9；立面青绿泛光只集中在店面带以上（shots/v40_r2/night.png → v40_r3/night.png）。
  - Bug：白天店面玻璃发黑 → 店内自发光提高（白天 0.95），店面玻璃金属度 0.9→0.45（v40_r3/detail.png）。
  - **手感（实测 plans/handling.json）**：改成"牵引力限制 + 功率限制"的加速模型，加二次风阻和松油门的发动机制动，按车型设刹车减速度，加轮胎侧向极限（mu·g，湿地 −25%，超过时转向不足；手刹不受限，可以漂移）。
    | 车型 | 0-100 改前 → 改后 | 100→0 刹车 改前 → 改后 | 60 km/h 满舵侧向 g 改前 → 改后 |
    |---|---|---|---|
    | 跑车 | 5.28 s → 3.45 s | 23.8 m → 32.6 m | 5.4 → ≈1.15（上限） |
    | 轿车 | 12 s 内到不了 → 7.95 s | 23.8 → 38.9 m | 3.9 → 1.1 |
    | SUV | 到不了 → 8.85 s | 23.8 → 41.3 m | 3.7 → 1.0 |
    | 警车 | 6.65 → 5.18 s | 23.8 → 35.6 m | 4.7 → 1.3 |
    转向响应到 90%：0.35–0.52 s → 0.17 s；手刹侧滑 22°；步行 3.9 m/s、冲刺 6.7 m/s、起步 0.23 s（在目标范围内，未改）。
  - **任务循环（新 src/mission.js，「代客泊车」）**：酒店门口有琥珀色光柱的泊车台 → 走进去接单，客人的车停到路边（蓝色标记）→ 上车后随机分配内街停车场车位（光柱 + 小地图黄点 + 品红虚线），限时 = 距离/8.5 + 22 s → 停稳（<5.5 m，<1.5 m/s）后付款 = 150 + 剩余秒数×4 − 车损×3 → 冷却 6 s 后可以再接单。超时、车况 <35%、通缉 ≥2 星、弃车 >60 m 都会失败。底部中间显示中文目标条。实测 shots/v40_r3/mission/mission.json：idle→pickup→drive→付款 $340→cool→idle→再接单→通缉后失败。
- 工具：runplan.cjs 改成每次启动前等可用内存 ≥2.5 GB，每块结束后 kill chromium，崩溃的块重试一次；shot.cjs 把 js 结果写成 json，加了 `CAP=canvas`（直接读 canvas）和 GPU watchdog 关闭。发现：SwiftShader 下 render() 只是排队（约 6 s），真正的光栅化发生在截图读回时（约 340 s），OOM 也出在这一步。
- 验证：build ok；shots/v40_r3 的 golden / detail / night / drive（960×540）都用 read_file 看过，没有过曝、全黑、PAGEERROR；sim（shots/v40_r3/sim）：开车 79 km/h，犯罪 → 3 星 → 4 辆警车出动，行人死亡动画正常；car_lineup 一块两次都 OOM（只影响近景截图，不影响逻辑）。
- 发布：dist_single 24.7 MB，16:56 CST 发布到页面 96467e5f；副本 release/port-solana-v4.0.html。
- (main agent 17:26 CST) v4.0 published 16:56 CST (release/port-solana-v4.0.html). v4.1 lighting (env.js/post.js) + unbuilt v4.2 edits (unlit shops not black, crowd 64→84) NOT verified/published. Next: review shots/v41 backlit + cu_*; node build.cjs; verify, plans/mission.json, plans/bounds.json; single.cjs; publish v4.1/4.2; fill SELFCHECK score table; update ROADMAP, CREDITS (mission.js original); copy best shots to shots/v4_best/. RUNNING.lock removed by main agent.
