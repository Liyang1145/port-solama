# ROADMAP — 索拉纳港 Port Solana（real/，r6.0 起一个游戏两张地图）

## ★ 当前唯一重点（用户 2026-11-21 09:42：「我现在只考虑光影，建模」）
我方只做光影和建模，玩法/后端 bug 全部交 GPT（issue #1），不再在我方排期。
并行子代理（worktree /workspace/work/wt/<名>，产出 /workspace/work/patches/<名>.patch + .md，完成后写 <名>.READY）：
- light2：两图光影（软阴影/接触阴影、间接光/天光 AO、大气透视、体积光（黄昏、路灯雾）、车漆与玻璃反射、夜景灯光分布；B 雨夜湿地倒影）。
- model-street-a：A 图店铺橱窗室内视差（货架/人影）、街具（停车计价器、路灯、长椅、垃圾桶、消防栓）金属与磨损、主角站姿。
- model-ground-a：A 图航拍：大陆路网/停车场/低矮住宅铺满、土壤草地混合贴图、摩天楼底座街区，海堤淡蓝平墙修掉。
- model-b2：B 图巨塔立面变化去重复、公寓污渍杂物、全息广告密度、雨林树干补光。

## r6.2 之后的下一步（2026-11-21 07:10 CST）
两图共用
1. bugs.md 仍开着的：#6 警车在大陆路口来回切换路点（需路口滞后）、#7 追捕时警车互撞/撞车流掉血、#8 堤道测试司机追尾车流掉车况（A 56、B 40）、#9 流式分块首帧仍有 ~44 ms 卡顿（World.build 分帧）、#11/#12 贴墙时相机进楼（玩家胶囊与 OBB 重叠）、#19 部分 POI 坐标在碰撞体里、#20 偶发车辆久停。
2. 角色：人群 80 m 以外不画（r6.2 显存修复）——远处可加廉价替身（公告板/实例化低模）补人群密度；装弹/近战程序动作（actionpose.js）、GPS 路线、切换地图菜单只做了代码/逻辑验证，没有截图确认。
3. 车内：夜间仪表发光、方向盘转动只做了数值验证；侧窗玻璃在强日光下偏透明。
地图 A：夜景个别彩绘店招红/粉字（不是灯管）改暖色；visual V7/V9 两处共面闪烁（city.js 旧地基 polyCap/海堤、yard 混凝土板）待 bldg 负责人处理。
地图 B：3 星在场警车仍偏少（1 辆，A 为 4）；雨林近景树干死黑。

## r6.1 之后的下一步（2026-11-21，按优先级；A/B 分开）
地图 A「索拉纳港」（写实，严禁霓虹）
1. A 夜景残留的彩色小灯箱：Deco 区个别店招底色仍是粉/洋红（shots/r61/after_gta2/night_deco.png 右上远处），统一改暖白/奶油底灯箱。
2. 航拍：大陆地面在北/西边界是一条直线截断（远处草地直边），需要自然岸线或远景地形收边；海面远端已在 r6.1 渐隐。
3. 立面第 2 期：阳台栏杆进深、空调外机/雨棚、屋顶杂物带到中高层；凹窗视差已做，缺夜间室内灯光分布变化。
4. 黄金时刻逆光：海燕沙丘逆光仍偏亮、地形起伏不足（r5.0 遗留）。
5. 堤道高速车损 100→38（r5.0 遗留，疑似擦碰车流）。
地图 B「霓港」（赛博朋克）
1. 雨林测试机位 rainforest2 贴着一棵大树根部，近景树干全黑（不是实例化缓冲问题，r6.1 已排除）；近景树干/板根在阴影里需要更多天空补光，或树加碰撞让玩家不能贴进树干。
2. 雨林近景偶见一根灰白色无贴图的弯曲细条（藤本或叶柄），查 vine/petiole 的 UV。
3. 3 星在场警车 2 辆（A 图 4 辆）；住宅地块白色空地；远景楼白天偏暗（r6.0 遗留）。
4. 雨夜：湿路 + 雨丝 + 积水；r6.1 已把水洼最低粗糙度 0.03→0.11 去掉路灯"亮点"，新环境下平面反射仍不出现，需真机确认。
5. B 图专属任务起点（数据核心区、货柜港、零点堤道）。

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
- r6.1 (2026-11-21): 两图自然光影（A 改 PBR-Neutral 色调、天空色雾、IBL 地面反弹、太阳/高光上限）；建筑材质（凹窗+窗洞侧壁、窗框磨损、抹灰/清水混凝土浮雕、雨痕、间接光 AO、店铺室内类型）；A 图彻底去霓虹（彩绘招牌+暖色灯泡、暖白泛光）；B 图雨林重做（阔叶林下层、落叶、林下棕榈、第二层小树、苔藓湿岩、三层瀑布+水雾+潭面泡沫），修实例化缓冲溢出导致的黑块/白刺。
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
