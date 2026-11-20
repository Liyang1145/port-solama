# ROADMAP — 索拉纳港 Port Solana（real/，r6.0 起一个游戏两张地图）

## 两张图共用（玩法 / 系统）
- 玩法系统只写一份（GPT 协作者负责后端：任务、警察、存档、经济、事件、测试；对接 issue #1）。新任务点按地图分别加在 `src/maps/<map>/mapdata.js`。
- 技术债（r6.0 合并遗留）：`src/maps/gta/city.js` 与 `src/maps/cyber/city.js` 都含同一套 Deco 核心区生成器（约 68 KB 重复代码）→ 抽出 `src/deco.js` 共用；B 图的 v4.5 立面风化/路面裂缝/沙滩波纹/草坪变化目前只在 B 图开（CYBER 开关），验证后可移植给 A 图的白天写实。
- 两张图都缺：车上射击、油量、SWAT、车辆爆炸、商店室内、直升机开火（GAMEPLAY_PLAN.md）。

## 地图 B「霓港」（赛博朋克）待办
1. 3 星通缉时在场警车偏少（r6.0 冒烟：cops 计划 2 辆，A 图 4 辆）——B 图路网刷警车的距离窗口/路点检查。
2. 住宅地块白色空地（航拍可见）；货柜港地面夜里偏亮；远景楼白天偏暗。
3. 赛博朋克打磨：雨夜（湿路 + 雨丝）、空中车流灯带、更多全息广告类型、义体/霓虹服装的行人、霓虹招牌密度向核心区集中；白天保留但以夜景为主。
4. 红树林/湿地海岸（可选）；草原/雨林里的玩法点（越野、藏匿点）。
5. B 图专属任务（现在 4 个任务 + 代客泊车都在两图共有的 Deco 核心区）：数据核心区、货柜港、零点堤道各加一个起点。

## 地图 A「索拉纳港」（写实）待办（原 r5.x 列表，按与 GTA6 的差距排序，大的在前）

Each 6-hourly round takes the top 1–2 open items, does them properly, verifies with screenshots (street / drive / night minimum)
and a logic sim, publishes, logs in ITERATION_LOG.md. Deadline 2026-12-19.

**Every round: read `GTA6_REFERENCE.md` first** (implementable GTA 6 specifics with sources + ranked gap list) and compare
shots side by side with `ref/gta6/` stills.

## Open (biggest remaining gap to GTA 6 first)
1. **Crowd density & behaviour** — 40 peds over the map vs packed GTA6 boulevards/beaches; needs character LOD (impostors / baked
   low-poly far), idle groups (chatting, phones, sitting on benches/beach towels), beach sunbathers.
2. **Building facades (midrise/condo/towers)** — still flat boxes beyond the Deco blocks: balconies with rails, window recesses,
   roof clutter (AC, water tanks, antennas), parallax interiors; more varied storefront types (strip-mall arcades, gas station).
3. **Vehicle fidelity** — ara3d cars low-poly; want higher-detail CC0/CC-BY sedan/SUV/police/van, interiors, better wheels, LOD.
4. **Weather + atmosphere** — localised rain/storm state (wet roads, spray, puddles persisting), volumetric-looking clouds/cloud
   shadows, heat shimmer on long roads, birds/planes.
5. **Vegetation variety** — flowering trees (red poinciana), hedges, bougainvillea, grass tufts; better palm bark/crown.
6. **Character animation set** — aim/fire for player & cops, hit reactions, enter/exit car, sprint, jump; skin/hair shading.
7. **Night extras** — police light bars washing the street red/blue (real lights), lit billboards, tower window patterns.
8. **Performance** — LOD/culling/texture streaming; target 60 fps mid GPUs (probe + more props cost draw calls).
9. **Gameplay depth**（逻辑层由 GPT 协作者负责，见 issue #1）— 第 1 期已在 v4.3 落地；持枪模型 + 瞄准层 r5.0 已做。下一步第 2 期：换弹/近战动作、车上射击、燃油、特警/钉刺带、目击者报警、车辆起火爆炸。
10. **大地图第 2 期**（MAP_DESIGN.md §7）— 第二条堤道串 2–3 座人工小岛；运河住宅区；大陆港口（集装箱码头 + 邮轮）；市中心 3 条可进入街道；大陆店铺招牌/室内、折线路口信号灯、公交；船可驾驶。
10a. **r5.0 遗留**：正午沙滩/开阔地逆光发白（见 SELFCHECK r5.0）；大陆路口无信号灯（车辆只靠前车避让）；折线路网上警车只做贪心寻路（无 A*，可用 mapapi.roadNetwork 做）；近景块生成时有一帧卡顿（每帧最多 1 块）；大陆店面室内仍是通用货架贴图；手持武器在第三人称后视角下多被身体挡住，缺换弹/近战挥击动作。
11. ~~Cyberpunk night~~ — r6.0 已作为独立的地图 B「霓港」并入；A 图保持写实，不加任何赛博/全息元素。

## Done
- r6.0 (2026-11-20): 两条线合并——一个代码库、一个游戏、两张地图（A 索拉纳港写实 / B 霓港赛博朋克），开局菜单选图，玩法系统共用，`src/maps/{gta,cyber}/` 分目录，mapapi 两图同一套接口，每图独立存档。
- r5.0 (2026-11-20): 大地图第 1 期 — 自然岛端、日光堤道 + 桥拱、星湾岛别墅、大陆甘蔗区/湾畔/壁画仓库区（斜街、弯路、不规则街区）、128 m 分块流式（远景常驻/近景按距离生成卸载）、OBB 碰撞、海岸浅水图、折线路网交通与行人、便利店 C；地图查询接口 src/mapapi.js；手持武器模型 + 上半身瞄准层；6 张原创壁画。
- v4.3 (2026-11-20): GTA6-style gameplay phase 1 — 6 weapons + wheel + melee + cover + gun shop; mission framework + 4 missions
  (store hold-up, cold-chain delivery, debt chase, shipyard gang fight) + valet; phone, ATM/bank, clothes, body shop, car dealer,
  radio, purse-snatcher event, two protagonists, stamina, autosave; police search zone, escalation, road blocks, helicopter.
  Map phase 1: alleys, two container yards, marina piers + yachts, lighthouse, Ferris wheel, shop fronts (MAP_DESIGN.md).
- v4.2 (2026-11-20): v4.1 lighting + unlit shops no longer black + crowd 84.
- v3.4 (2026-11-20): GTA6 research doc + refs; neutral-filmic grade + Florida-blue sky; darker night with shop/neon/headlight light
  pools; GTA6-layout HUD (original styling); street clutter (utility poles + power lines, ~500 signs, shelters, boxes, drains);
  storefront interiors + 32 shop signs; bike lanes + lane arrows; +500 broadleaf trees; dense beach; tower-glass reflection probe;
  car dust; more peds/traffic.
- v3.3 (2026-11-20): facade sills/jambs/pilasters/AC units on Deco punched-window blocks (midrise+towers still open).
- v3.0 (2026-11-20): engine, HDRI sky, PBR materials, shadows, AO, bloom, water, traffic/peds/police/wanted, HUD.
- v3.1 (2026-11-20): wet-road blue/purple night bug fixed (GTAO normal pass overwrote planar reflection); streaky wet reflections;
  10 lamp lights; all characters replaced by realistic MakeHuman/ara3d cast (10 people, own mocap clips, death animation);
  CREDITS.md added; Mixamo/RPM models removed.
- v3.2 (2026-11-20): traffic uses 4 ara3d vehicle models (car/suv/pickup/sports) with rotating wheels, game paint/glass/light
  materials, taxi sign + police light bar; procedural boxes retired except van.
