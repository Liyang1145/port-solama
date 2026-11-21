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

## v4.2 — 2026-11-20 18:17 CST 发布（含 v4.1 光影）
- 用户 17:44 改方向：取消赛博朋克夜景（以后单独做一张地图），本轮未改动任何夜景代码，夜景保持写实。
- 验证：shots/v41（golden/detail/night/drive/backlit，v4.1 光影）+ shots/v42/golden.png（白天未亮灯店铺不再是黑块，对比 shots/v41/golden.png 左侧黑色卷帘块）+ shots/v42/sim（驾驶 79 km/h、3 星 4 辆警车、行人死亡）+ shots/v42/mission（代客泊车 $348 + 通缉失败分支），无 PAGEERROR。人群 84。
- 工具：无头 Chromium 在完整画质下渲染即被全局 OOM 杀掉（container-server 常驻约 2.2 GB）；截图改用 `&lowshadow&probe=0` + `CAP=canvas`（只影响测试截图，发布版仍是完整画质）。tools/single.cjs 支持 `DIST=`/`OUT=`。
- 发布：dist_single_v42 23.5 MB → 页面 96467e5f；副本 release/port-solana-v4.2.html；GitHub 同步 a92c00c。

## v4.3 — 2026-11-20（GTA6 式玩法第 1 期 + 地图设计第 1 期）
用户 17:44：「游戏内容玩法照着 gta6 来…这是个大工程」；17:48：「地图设计好。参考gta6」。总表 GAMEPLAY_PLAN.md，地图 MAP_DESIGN.md + shots/map/port_solana_map.png。
- **武器（src/weapons.js）**：拳头、棒球棍、手枪、冲锋枪、霰弹枪（9 弹丸）、步枪；独立弹匣/备弹/射速/扩散/射程/换弹；数字键 1–6、滚轮、按住 Q 武器轮盘（25% 慢动作）；近战扇形判定；命中标记（爆头红叉）、受击硬直、后坐力；C 掩体（受击概率 ×0.35、相机降低）。
- **武器店「海岸枪械行」**：E 打开菜单买枪/弹药/防弹衣，通缉中拒绝营业。
- **任务（src/missions.js）**：地图字母标记 + 光柱起点、目标条、GPS、大字结算卡。夜班收银（持枪抢便利店 → 3 星 → 甩掉）、冷链急送（冷藏车限时送餐厅）、追债（撞停/打坏逃跑跑车后收钱）、码头火并（6 名持枪帮派成员）；代客泊车保留。
- **开放世界（src/world.js）**：两家便利店店员可被持枪抢劫（瞄准 2.5 s）；ATM 存取款（现金/银行分开，死亡只扣现金）；服装店换衣清除"衣"证据并在搜索中降一星；修车坊修理/喷漆（降一星）；手机（↑/I）：任务导航、地图、联系人（技工送车、律师降星）、银行、资产、车行买车、电台；随机抢包贼事件；双主角马特奥/伊莎（Z 切换，各自现金、武器、通缉、位置）；体力（冲刺耗尽后需恢复到 25）；localStorage 自动存档。
- **电台（src/sfx.js）**：三个原创生成式电台，开车时播放，句号键切台。
- **警察（src/police.js + game.js）**：失去视线后去最后目击点搜索（增援也刷在那里），离开 95 m 红圈并躲够时间才消星，静止躲藏 1.5 倍速冷却；视线内抵抗按时间升星；3 星前方路口路障；4 星直升机 + 探照灯（照到即"被看见"）。
- **地图第 1 期（src/city.js, src/mapdata.js）**：内侧街区中间 6 m 步行小巷；西南「南湾货运站」（冷库、装卸台、集装箱、龙门吊）和西北「北湾旧船坞」（集装箱迷宫、铁皮棚）；「鹈鹕游艇港」3 条可行走栈桥 + 游艇；南防波堤灯塔、北海滩摩天轮「海风之眼」；商店招牌和地面标记、ATM 机。
- 实测：shots/v43/gp/{weapons,missions,phone,police}.json（数值见 SELFCHECK v4.3 证据）；回归 shots/v43/mission（代客泊车 $369）+ shots/v43/sim。
- 本轮修的 bug：商店 B/服装店标记在建筑内；冷藏车刷在集装箱里；搜索中的警察可在最后目击点"逮捕"不在场的玩家；警察增援刷在玩家真实位置导致永远甩不掉；escT 跨通缉残留。
- 截图（1280×720，`&lowshadow&probe=0` + CAP=canvas，均已人工检查）：shots/v43/heli.png（夜间直升机 + 探照灯，初版探照灯强度过高出现白斑 → 改为 decay 2、约 3 lux 后重拍）、gang.png（旧船坞火并；初版逆光发白 → 改 15:12 朝东重拍）、marina.png、gunshop.png、landmarks.png（摩天轮；正午沙滩偏亮，未选为最佳）。
- 中途沙盒重启：/tmp 与 Playwright 浏览器被清空，重新安装 chromium-headless-shell 和系统依赖后继续。
- 发布：dist_single 23.6 MB → 页面 96467e5f（18:59 CST）；副本 release/port-solana-v4.3.html。
- 剩余短板：没有持枪/瞄准动画和手上武器模型；近战没有挥击动作；店铺没有室内；直升机不会开火；日光堤道/市中心未做；贴图和精细建模本轮未推进。

---
# 写实分支 r5.x（real/ 独立工作区，起点 v4.3；白天夜晚都写实，不做赛博朋克）

## r5.0 — 2026-11-20（大地图第 1 期 + 分块流式 + 手持武器/瞄准层）
用户 20:03：「继续你的迭代。游戏性和内容，手感，bug，地图构建，细节，贴图，精细建模，真实感，还原度，代入感」；此前：地图不要方方正正，参考 GTA6 官方 Leonida 地图结构，大小无上限、分块流式控制内存。
- **地图重构（MAP_DESIGN.md 重写）**：参照 Vice City 的结构（大陆 + 海湾 + 屏障岛 + 堤道 + 人工岛），全部原创命名。全图从 0.36×0.74 km 扩到约 2.5×3.1 km。
  - 新的单一数据源：`src/mapdata.js`（`REGION` 道路控制点、人工岛、桥拱、区名、POI_R5）→ `src/mapgeo.js`（纯 JS：Catmull-Rom 路径、20 个路口求交 + 按真实几何裁切车行道、凸包路口、人行道段、自然海岸线、334 个确定性建筑地块）→ `src/region.js`（3D）+ `tools/mapgen.cjs`（俯视图 shots/map/port_solana_map.png、port_solana_mainland.png）。
  - **屏障岛自然两端**：海燕沙丘（木栈道、海葡萄、棕榈丛）、北/南棕榈（公寓塔落在自然海岸线内，带碰撞）、南角红树林（泥滩斜坡入水）；东海滩海岸线在 Deco 区外自然弯曲并延伸到岛尖（`beachOff`），Deco 区原样不动；南北海堤栏杆/沙滩挡墙拆除，防波堤根部后移让海滩步道连续。
  - **日光堤道**：岛上 z=0 横街直接接堤道（路障拆除、海堤留缺口），双向四车道、草堤 + 棕榈、深色抛石护坡 + 约 1300 块护岸石、护栏（OBB 碰撞）、路灯；中段通航桥拱（升 4.6 m、桥墩、桥下底板、混凝土护墙）。实测开车 30→−1014 全程通过，桥顶车身 y=5.03（shots/r5/smoke/r5_drive.json）。
  - **星湾岛**（人工豪宅岛，经星湾桥接堤道）：海堤 + 栏杆、闭合环岛路、8 栋现代别墅（悬挑二层、带状玻璃、泳池 + 木平台 + 躺椅、绿篱、临水棕榈）、中央棕榈公园 + 喷泉。
  - **大陆**：甘蔗区（1–3 层鲜艳灰泥店铺、条纹遮阳篷、女儿墙、屋顶空调/水箱、壁画）、湾畔（弯曲的湾岸大道 + 海湾公园 + 海堤栏杆，路西侧 5–12 层公寓）、壁画仓库区（大仓库 + 卷帘门 + 整面壁画）；路网 9 条：弯路、38° 斜街、半圆月牙路、折线街；远景市中心天际线移到 x<−1400，加碰撞。
  - **分块流式**：334 个地块按 128 m 分 34 块；远景（纯拉伸体）常驻，相机 300 m 内按块生成近景细节，440 m 外卸载并释放显存；全部近景加起来 36 万三角形（Node 实测），任一时刻只加载一部分（夜景截图时 25 块）。碰撞一次性建好（新增 `ColliderGrid.addOBB` 旋转盒碰撞，射线/推挤都支持）。
  - **水面**：海岸距离图（8 m 栅格倒角距离变换）驱动湾底深度，自然岸、护坡、海堤边都有青绿浅水过渡。
  - **交通/行人/任务适配**：`Traffic` 新增折线路网模式（`rib`：车道 = 路径 + 右偏；段尾按节点选路、贝塞尔转弯、死路掉头；z=0 街 ↔ 堤道双向互通）；大陆 25 辆车中 23 辆在新路网上跑；行人沿新人行道走（27 人）；警车寻路 `roadWaypoint` 先走区域道路；新增便利店 C「甘蔗区杂货」（可抢）、ATM、两家餐厅（冷链急送可能跨湾送货）；小地图覆盖整湾（大陆、堤道、人工岛、岛端），区名渐显用新区名。
  - **地图查询接口** `src/mapapi.js`（给逻辑层/GPT）：getPOIs / nearestRoad / roadPointAhead / districtAt / isOnLand / randomRoadPoint / roadNetwork。
- **精细建模**：手持武器程序化模型 `src/gunmodels.js`（手枪：套筒防滑纹、准星、护圈、扳机、斜握把纹理；冲锋枪：消音器、弹匣、折叠枪托、红点镜；霰弹枪：管状弹仓、木护木 + 防滑环、木托；步枪：M-LOK 护木、皮卡汀尼导轨、弯弹匣、伸缩托、瞄具；球棍），按手骨位置/朝向每帧摆放；警察/帮派也持枪。
- **动作**：角色加上半身瞄准层（自带的 Pistol aim 片段只保留脊柱/颈/头/手臂轨道，权重叠加在走/跑上），玩家瞄准、警察/帮派 45 m 内举枪（shots/r5/b/aim.png；smoke r5_aim：rifle 在手、aimW=1）。
- **贴图**：6 张原创程序化壁画（落日棕榈、热带叶花、几何瓷砖 + 抽象人脸；底部污渍、褪色斑、流痕），贴在甘蔗区侧墙和仓库外墙。
- **Bug**：便利店 C 预留地块缺 face/id 导致近景块生成异常（Node 离线构建 34 块复现并修复）；大陆地面用 polygonOffset 时在掠射角被推到水面后面（航拍里地面"消失"成浅水沙色）→ 改为地面低于路面 6 cm；星湾桥岔口被堤道护栏/草堤挡住 → 岔口两侧开口；湾岸大道临海一侧不再生成建筑（留作公园）；runplan.cjs 原来 `pkill -f ms-playwright` 会误杀另一条线的浏览器 → 改为全局锁 + 只杀自己的进程组（含 playwright 另起的浏览器进程组）。
- **收尾/发布（2026-11-20 22:00 CST）**：最终构建回归 plans/r5_regress.json 11 项全过、0 PAGEERROR（shots/r5/regress）；补拍 shots/r5/final/beach_day.png、mainland_day.png、dunes.png。单文件 23.6 MB → 新 Page「索拉纳港 Port Solana 写实版」project_id 3fffda2d-4e56-495b-9ce7-5dc21581ec86（原样发布，私有，需用户在 App 内 Share 才能外链）；release/port-solana-r5.0.html。GitHub：origin/main 无他人新提交、无 open PR → sync_github.sh 推送 commit 3ee6c50；issue #1 留言 https://github.com/Liyang1145/port-solama/issues/1#issuecomment-7041380015（mapapi 接口、r5.0 改动点、建议 GPT 做交通灯/警察 A* 寻路/存档降级/新区任务点）。最佳截图 shots/best/r5_*.png。
- **遗留**：堤道高速驾驶车损（r5_drive 100→38）；海燕沙丘逆光过曝、起伏不足；航拍天空灰带 + 右上扇形伪影。

---
# r6.0 — 2026-11-20 23:35 CST：两条线合并，一个游戏两张地图
用户 22:37：「现在两个会话合并，不要分开，不然浪费资源。另一个会话在那造赛博朋克地图。我们以现在这个会话为基准，合并进来。另一个会话停止。我们最终给出两个地图，一个是gta6，一个是赛博朋克。」
- **基准**：real/ r5.0（地图 A「索拉纳港」）。**并入**：v3/ v4.5（另一会话 22:40 停止；v3/ 归档只读），成为地图 B「霓港 NEOPORT」。开工前 GitHub main 仍是 32a4036，无 GPT 新提交、无 open PR。
- **结构**：`src/mapsel.js`（MAP/CYBER，载入前确定）；门面 `src/city.js`（LAYOUT + buildCity）、`src/mapdata.js`（当前图 POI/MISSION_STARTS）、`src/mapapi.js`（两图同签名，Node 用 useMap 切换）；`src/maps/gta/`（mapdata/mapgeo/region/city/mapapi）、`src/maps/cyber/`（mapdata/roadgraph/parcels/region/stream/nature/neon/city/traffic/mapapi/names）。
- **共用玩法（以 real/ 为准）**：game/missions/mission/world/police/weapons/gunmodels/vehicles/people/hud/sfx 一份代码。B 图带来的差异合进共用文件：B 图交通 `maps/cyber/traffic.js`（GraphTraffic，city.TrafficClass 注入）、行人路网人行道（people.js，city.graph 时启用）、警察路障用路网路口（police.js）、追击寻路用 traffic.waypoint（game.js）、ColliderGrid.remove / withSeed（util.js）、World.append（geo.js）、小地图按图绘制 + B 图区名（hud.js）、水床高度贴图（water.js）。存档按图分键（A `portsolana_v43`，B `portsolana_cyber_v60`）。B 图因此第一次有了手持武器模型 + 上半身瞄准层。
- **渲染**：mats/env/post/props/veg/geo 里 v4.5 的赛博朋克与风化部分全部用 `CYBER` 开关，A 图的着色器文本与 r5.0 逐字一致（脚本还原比对）；A 图无全息广告/塔楼灯带/紫雾/洋红青调色/冷色 LED 路灯。
- **开局菜单**：index.html 两张地图卡片（索拉纳港 写实 / 霓港 赛博朋克）；loader 选图后才运行游戏包（单文件里游戏包存成 `<script type="text/plain" id="gamejs">`）；`?map=gta|cyber` 或 `#map=` 跳过菜单；无头测试默认 A 图，`?menu` 强制显示菜单。B 图默认 21:36 开局。
- **B 图原创地名**：与 A 图重复的全部改名（棕榈岛→光栅岛、日光堤道→零点堤道、金棕榈岛→镀金岛、帆影→信标、湾区中心→数据核心区、港岛→货柜港、金穗草原→电穗草原、云雾雨林→雾网雨林、海潮大道→脉冲大道…；店名 赛博枪械坊/霓虹 24 小时/零点便利/光纤衣橱/脉冲改装坊/义体医疗中心…），见 src/maps/cyber/names.js。
- **修的 bug**：(1) B 图 region.js 区域地面循环里 `if (!mat) continue;` 被写进了注释 → 每个非城区区域多一块无材质白色地面（夜景航拍的大白板，v4.5 就有）；(2) B 图流式近景块改到镜面反射前加载（v3 顺序）；(3) A 图回归里 missions 失败是测试顺序问题（同页先跑代客泊车），单独跑与 r5.0 数值完全一致。
- **验证**：node build.cjs 通过（dist/main.js 1242 KB）。A 图 `plans/r5_regress.json` 11 项：9 项同页通过，drive/missions 单独复跑通过（shots/r6/regress_gta + regress_gta_b；代客泊车 +$417、四任务 1696/1266/1100/1600、3 星 4 警车、路障/直升机、r5_drive 堤道、r5_world 15 车 15 行人、rifle aimW=1），0 PAGEERROR。B 图冒烟 `plans/r6_cyber_smoke.json`（shots/r6/smoke_cyber）：开车 79 km/h；零点堤道 1.5 km 开到大陆 (−1542,−265) 最高 163 km/h 车况 100；赛博枪械坊买齐 6 种武器、四种枪命中；3 星通缉（在场警车 2）；代客泊车 +$341；四个任务全部付款 1931/1297/1100/1600；数据核心区 13 车 12 在路网、15 行人走路网人行道、0 落水；0 PAGEERROR。菜单测试（单文件）：菜单显示、点「霓港」进入 cyber、标题 NEOPORT、0 错误（shots/r6/menu.png）。
- **截图**（1280×720，lowshadow&probe=0 + CAP=canvas，均 read_file 检查）：A：shots/r6/gta/aerial.png、mainland_day.png、night.png、beach_day.png（与 r5.0 一致）；B：shots/r6/cyber3/night_aerial.png、shots/r6/cyber/night_deco.png、night_street.png、falls.png、prairie2.png、cyber3/aerial_day.png。
- **环境说明**：沙盒重装了 chromium-headless-shell 1255 + 依赖。新环境下夜间湿路面镜面反射不出现——用 r5.0 原始源码重建对照（shots/r6/night_r50/night.png）同样没有，属测试环境差异，不是合并回退。
- **发布**：dist_single 23.8 MB（< 45 MB，两图共用一套素材，无重复）→ Page 3fffda2d（action=edit 原样替换；检查器无 WebGL 报的标题对比度/按钮报错是误报）；副本 release/port-solana-r6.0.html。GitHub：fetch 后 main 无他人提交、无 open PR → sync_github.sh 推送 **ae42e8d**；issue #1 留言 https://github.com/Liyang1145/port-solama/issues/1#issuecomment-7043593700（新目录、选图方式、mapapi 两图用法、回归、建议 GPT 接手项）。最佳截图复制到 shots/best/r6_*.png。
- **遗留**：B 图 3 星在场警车 2 辆（A 图 4 辆）；B 图远景楼白天偏暗；Deco 核心区生成器在 maps/gta/city.js 与 maps/cyber/city.js 各有一份（技术债）；新测试环境下湿路面镜面反射不出现（r5.0 原版同样，环境问题，待真机确认）；A 图 r5.0 遗留（堤道高速车损、沙丘逆光、航拍灰带）未动。

---
# r6.1 — 2026-11-21 02:35 CST：自然光影 / 建筑材质与风化 / B 图雨林瀑布
三个方向，两图都做；A 图「索拉纳港」昼夜都不允许任何霓虹/赛博元素，B 图「霓港」保持赛博朋克。玩法代码未改。
- **自然光影（两图）**：A 图改 PBR-Neutral 色调（B 保留 ACES），曝光随之 ×1.1–1.25；雾色取天空色（航拍灰带变淡）；IBL 下半球加地面反弹（A 暖沙/灰泥，B 湿混凝土）；太阳圆盘 60→22、天空上限 48、后期高光上限 24（逆光不再整片泛白）；黄金时刻光束减弱、18.7 h 雾色偏冷。收尾加：A 图远海 2.3–4 km 渐隐成天空的"地平线以下海色"（water.js，B 图不受影响）——shots/r61/lab_gta/aerial_day.png 水面截断硬线消失；B 图水洼最低粗糙度 0.03→0.11（mats.js，CYBER 才生效），路灯倒影从过亮小点变成拉长倒影（shots/r61/lab_cyber3/night_street.png）。
- **建筑材质与风化（两图）**：凹窗视差 + 窗洞侧壁（顶部最暗）+ 窗框磨损；抹灰浮雕（A）/ 清水混凝土 + 拉杆孔（B），随距离淡出；窗台雨痕；只作用于间接光的 AO（墙脚、窗洞、窗台下）；店铺室内分咖啡馆/精品店/办公室等类型；装饰线脚/柱/檐口不再是平塑料。**A 图去霓虹**：灯管 → 彩绘 Deco 色带，招牌白天彩绘搪瓷字、夜里暖色灯泡光，顶冠泛光白/暖白，摩天轮暖色灯泡圈，立面泛光暖卤素色；店名「霓虹理发」在 A 图改「海湾理发」（street.js）。
- **B 图雨林/瀑布**：第二层林下小树、林下棕榈（3 种）、阔叶植物（3 种）、落叶斑块，蕨类上限 3200，藤蔓更多；巨石按占地最低点落座 + 苔藓顶面 + 水雾区湿岩；瀑布三层水帘 + 220 粒水雾 + 潭面泡沫；林中光束/雾增强。
- **修的 bug**：B 雨林 LodSet 实例缓冲固定 6000 槽，第二层林下让单集超过容量 → 黑色大块/白色长刺（shots/r61/lab_cyber/rf2.png、falls_close.png）。改为首次 update 按 items.length 分配（nature.js LodSet.alloc），修后 shots/r61/after_cyber2/rainforest.png、rainforest2.png、falls_close.png 无伪影（一次修复即通过）。rainforest2 机位近景的"黑色巨石"经探测不是岩石实例（隐藏全部岩石图像不变），是机位贴着一棵树的根部/树干——记入遗留。
- **回归（最终构建，dist/main.js 1266 KB）**：新工具 `tools/regress_fresh.cjs`（一个浏览器、一次锁、每项测试新开 context/page）。A `plans/r5_regress.json` 11/11 通过（shots/r61/regress_gta：代客泊车 +$420 + 通缉失败分支；6 武器、换弹 1.3 s、球棍 2 下、掩体；四任务 1696/1266/1100/1600、码头帮派向玩家开枪；手机 7 页；3 星 4 警车、路障、直升机探照灯、甩星、升星；驾驶 79 km/h；r5_drive 到 x=−1020 车况 38（与 r5.0 遗留一致）；r5_world 15 车 15 行人；r5_aim rifle aimW=1），0 PAGEERROR。B `plans/r6_cyber_smoke.json` 7/7 跑通（shots/r61/smoke_cyber：79 km/h；零点堤道到 (−1542,−265) 最高 163 km/h 车况 100；6 武器；代客泊车 +$398；四任务 1931/1297/1100/1600；13 车 12 在路网、15 行人、0 落水），0 PAGEERROR。注意：B 的 cops 测试在新页面上 3 星但 150 帧内在场警车 0（r6.0 同页跑在驾驶之后为 2）；police.js/game.js 本轮未改，属 B 图原有问题。
- **截图**（1280×720，lowshadow&probe=0 + CAP=canvas，均 read_file 检查）：前 shots/r61/before_gta/*、before_cyber/*；后 shots/r61/after_gta2/*、after_cyber2/*、lab_gta/aerial_day.png、lab_cyber3/night_street.png；最佳复制到 shots/best/r61_*.png。
- **发布**：dist_single 23.8 MB → Page 3fffda2d（action=edit 原样替换；检查器的 WebGL/对比度报错是无 GPU 误报）；release/port-solana-r6.1.html。GitHub：fetch 后 main 无他人提交、无 open PR → sync_github.sh 推送 **3383c49**；issue #1 留言 https://github.com/Liyang1145/port-solama/issues/1#issuecomment-7047502517。
- **环境**：本轮同时有多个其他 agent 在 /workspace/work/wt/ 跑无头浏览器，CHROMIUM.lock 竞争严重（回归等锁约 40 分钟）；有进程在 17:32 用同一份 src 重建过 real/dist（内容一致）。
- **遗留**：A 夜景远处个别店招灯箱底色偏粉（彩绘灯箱，非灯管）；A 航拍大陆地面北/西直线截断、远海右上一条斜向接缝；B 雨林近景贴树根时树干死黑、偶见灰白无贴图细条；B 湿路倒影仍偏亮；B 3 星在场警车少；r5.0 遗留（堤道车损、沙丘逆光）。

---
# r6.2 — 2026-11-21 07:10 CST：车内饰与坐姿司机、17 人角色与步态、两图建筑建模、画面与玩法修复
- **整合**：六个并行补丁合进一份（整合副本 /workspace/work/int/r，git tag base）：visual（画面/世界伪影 V1–V14 等）、bugs（23 条 bug 清单 /workspace/work/patches/bugs.md）、vehicles（车内饰 + 坐姿司机，用的是最终验证版：修司机滞后一帧/旧变换、出租车乘客头穿顶、跑车双方向盘、玻璃不透明度 0.40、隐藏车不生成乘员）、people（17 人角色、20 个动作、四向步态、转身/闲置变化、跳跃/游泳/受击/两种死亡）、bldg_a（A 图九类建筑细节流式层 src/maps/gta/bldgdetail.js + archdetail.js）、bldg_b（B 图巨塔/筒子楼/店街/港口/天桥 src/maps/cyber/arch.js、bldglayer.js、kit.js）。无项目被丢弃。
- **阻塞（A 图出图 OOM）的根因与修复**（工具 tools/probe/：按进程测 chromium RSS + 场景组成）：
  - 测量：A 街景整合版在首帧渲染时 GPU 进程 + 渲染进程超过 3.5 GB（沙盒可用约 3.3 GB）；把角色全部隐藏只有 2.25 GB；换成无贴图材质仍 3.3 GB → 不是贴图，是几何。
  - 根因：cast GLB 的 glTF 形变目标（34 个 ARKit 表情 + 口型）是按 mesh 定义的，每个角色约 30 个子网格（衣服、鞋、头发……）都带全零的 34 个目标；three.js 为每个带形变的几何体建一张浮点形变纹理（顶点数 × 34 × vec4），而且 LOD1/LOD2 几何体又各复制一份。17 个角色 → 约 1 GB 显存 + 渲染进程拷贝。这对真实玩家同样是大量显存浪费。
  - 修复（真实玩家同样受益）：people.js `dropDeadMorphs`（零形变子网格不再建形变纹理，脸/眼/牙保留眨眼和口型）；LOD1/2 不带形变；`shareSkeleton`（SkeletonUtils.clone 给每个子网格一套骨架 → 每个角色每帧 37 次骨骼纹理上传，现为 1 次）；人群绘制距离 `CROWD_DRAW` 80 m（LOD3 不画、不跑动画）；资源层 tools/stripmorph.cjs 把全零形变数据从 GLB 里去掉（glTF 校验 0 错误），tools/texcap.py 角色贴图按用途限尺寸（底色 512、法线/金属粗糙度与眼睛牙齿等小件 256，主角 1024 不变）。
  - 结果：A 街景首帧峰值 3.5 GB+（被杀）→ 2.57 GB；960×540 回读成功（首张 251 s，峰值 2.95 GB）。单文件 47.9 MB → 38.8 MB。
- **回归**（tools/regress_fresh.cjs，每项新页面；最终资源再跑一遍）：A `plans/r5_regress.json` 11/11、B `plans/r6_cyber_smoke.json` 7/7，0 PAGEERROR（shots/r62/regress_gta、smoke_cyber）。A：代客泊车付款 + 通缉失败分支、6 武器、四任务、手机含「切换地图」、3 星 4 警车 + 路障 + 直升机、驾驶 79 km/h、r5_drive 到 x≈−1050 车况 56、r5_world 15 车 15 人、rifle aimW=1。B：堤道最高 143 km/h 到 (−1535,−265)，−675 处追尾车况 40（bugs #8 同类，测试司机不避车）；6 武器；四任务；15/16 车在路网、0 落水；3 星在场警车 1（r6.1 为 0）。
- **截图**（960×540，lowshadow&probe=0 + CAP=canvas，均 read_file 检查）：shots/r62/gta/a_street_day.png、a_aerial.png、a_night.png、car_driver_side.png（司机坐姿双手握方向盘）、car_glass.png（透过车窗看到座椅/仪表/司机）；shots/r62/cyber/b_night_street.png、b_megast_day.png（X 斜撑巨塔、天桥）、b_tenement_day.png（空调外机、笼式阳台、街上电缆束、竖向招牌）。A 图夜景无霓虹（饱和品红/青像素扫描：街景/航拍 0，夜景只有一块彩绘店招的红字，不是灯管）。
- **未做/遗留**：见 ROADMAP「r6.2 之后」。

## r6.3（2026-11-21 14:3x–15:2x CST）整合 light2 + ground_a + street_a
- light2：两图光影（AO 黑斑消除、接触硬化软阴影、金色时刻光柱、B 湿路灯光）；ground_a：A 图大陆城市肌理（路网/低层楼/塔楼吸附街区）；street_a：橱窗室内/街具/站姿。三补丁无冲突、build 通过。
- 回归：B 7/7、A 10/11 + 0 PAGEERROR；missions 项失败是测试写死送货坐标（RNG 序列变化后抽到 x=-1057 的餐厅），已改测试为按 dest 坐标放车，非游戏 bug（未整套重跑）。
- 截图 shots/r63（A 街景/金色/夜景/航拍/车、B 夜街）已查：A 无霓虹、无全黑。B 其余 3 张未等跑完。model_b2 尚未 READY。
