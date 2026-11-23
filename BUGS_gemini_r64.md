# BUGS_gemini_r64 — Gemini 全量代码审计 + Windows 真机 WebGL2 实测缺陷报告

- **审计方**：**Gemini**
- **基准提交**：`main` @ `0ef9f48`（r6.4，13 路并行分支合并后）
- **审计方式**：全量 106 个 `src/` 源码静态与跨模块审计 + `esbuild` 打包/资产分析 + Windows 真机 Chrome/WebGL2 浏览器实测（开局菜单、地图 A「索拉纳港」、地图 B「霓港」）
- **与 `agent/hark/perf_debug1` 对齐说明**：本报告基于 `main 0ef9f48` 产出，下方已显式标出 Hark 在 `perf_debug1`（至 `bb014a7`）已处理的重叠项，并补充 `perf_debug3` 查找约 600 MB 未知 JS 堆的关键线索。

---

## 一、系统性根因摘要

1. **`r6.4`（`0ef9f48`）多分支大合并引入的硬回归**：
   - 跨分支着色器冲突导致真机 WebGL 顶点着色器直接编译失败（`marina.js` × `envprog.js` 的 `uTime` 重定义）。
   - **4 处行内 `//` 注释意外吞掉同行后续可执行代码**（霓港全城屋顶裁剪失效、商业带柱子穿模、`veg.js` 严格模式崩溃、`env.js` 阴影半径丢失）。
   - 新默认着色器回归了旧版已修过的反向 `smoothstep(edge0, edge1, x)`（`edge0 > edge1`），导致 Windows ANGLE/D3D11 真机上路人皮肤保护失效变亮品红。
2. **A/B 双图补丁分裂**：`colfix.js`、`parkfix.js`、`propfix.js`、`edgewalls.js` 均以 `if (!CYBER)` 隔离，导致霓港保留隐形空气墙群、逆向停放车辆与 GTA 地名/招牌泄露。
3. **2.5D 平面碰撞与渲染假设未适配 3D 立体地形**：碰撞查询写死 `y = 0.5`、射线写死 `y = 1.1~1.6`、路灯光池写死 `y = 0.04/0.19`、车灯目标写死 `y = 0`，在跨海大桥、海滩沙丘、霓港雨林高原全面穿帮。
4. **仅跑无头 Linux SwiftShader `?snap` 回归的盲区**：掩盖了 Windows D3D11/ANGLE 着色器 UB、GTAO 蒙皮 T-Pose 穿帮，以及 `gta/region.js` 中 `lotDetail` 仅在 `?snap` 路径执行、实际游玩被绕过的缺陷。

---

## 二、P0 致命缺陷（崩溃 / 死循环 / 着色器报错 / 核心机制失效）

| # | 严重度 | 归属 | 影响地图 | 源码定位 | 根因与现象 |
|---|---|---|---|---|---|
| **G-01** | P0 | **Hark** | 地图 A（真机实测复现） | `src/maps/gta/marina.js:101-108`<br>`src/envprog.js:222-228, 331-337` | **WebGL 顶点着色器编译失败（`'uTime' : redefinition`）**：`M.vcol` 并入 `envprog` Uber 着色器后已带入 `fol` 的 `uniform float uTime;`，`marina.js:floatMat()` 克隆 `M.vcol` 后二次注入 `uniform float uTime;`。真机报 `VERTEX ERROR: 0:185: 'uTime' : redefinition`，游艇港浮动栈桥编译失败。 |
| **G-02** | P0 | **GPT** | 双图共用 | `src/game.js:207-230, 274-277, 369` | **被捕无限死循环 + 0 星无罪逮捕 + 尸体被捕**：第 229 行缺少 `this.wanted > 0` 与 `this.deadT <= 0`，且 `bustT` 永不清零衰减。`busted()` 设 `deadT = 3.5` 不清 `wanted`，1.6 秒内再触发 `busted()` 无限重置 `deadT` 卡死；消星或花 $800 找律师后，0 星也会被残留警察逮捕并没收枪械与 8% 现金。 |
| **G-03** | P0 | **GPT** | 双图共用 | `src/vehicles.js:495, 516-518, 524`<br>`src/util.js:18`<br>`src/main.js:171` | **切换标签页 `dt === 0` 除零致全城车辆永久 `NaN` 消失**：`THREE.Timer` 在页面隐藏/恢复首帧返回 `dt = 0`。`Vehicle.update()` 未拦截 `dt <= 0`，`ax/az = (...) / dt` 得 `NaN` 经 `clamp`/`lerp` 永久污染 `pitch`/`roll`，全城车辆矩阵变 `NaN` 永久不可见。 |
| **G-04** | P0 | **GPT** | 双图共用 | `src/vehicles.js:700, 716-717`<br>`src/maps/cyber/traffic.js:111, 125-126`<br>`src/game.js:200, 202`<br>`src/missions.js:90` | **假值零漏洞（`chaseSpeed \|\| 24`）**：`chaseSpeed = 0` 被误判为 `24 m/s`（86 km/h）并强制松手刹。警员下车后的无人警车全速冲撞玩家；「追债」任务待命目标车开局即油门到底乱撞。应改为 `a.chaseSpeed ?? 24`。 |
| **G-05** | P0 | **GPT** | 双图共用 | `src/game.js:372-386, 124-137` | **瞄准/开火时 W/A/S/D 全向锁死向前冲 + 掩体减速失效且可卡车内 65% 免伤**：瞄准/开火强改 `P.yaw = yawC` 后直接沿 `P.yaw` 移动而非 `(dx, dz)`，按 `S`/`A`/`D` 均直冲敌人，侧移/后退动作不可达。第 378 行 `mx *= 0.35` 写在已算完 `dx, dz` 之后是死代码；上车不清除 `P.cover` 可白嫖永久 65% 免伤。 |
| **G-06** | P0 | **GPT** | 双图共用 | `src/game.js:67, 361`<br>`src/world.js:111-118`<br>`src/carbody.js:279` | **快修车坊操作死锁完全不可进入 + 喷漆扣钱不改色**：`KeyE` 仅 `P.onFoot` 生效，而 `modMenu()` 要求 `P.car` 非空，正常游玩永远打不开修车坊。且喷漆匹配 `/paint\|body/i.test(o.material.name)`，但程序化车壳材质是数组且 `paintMat` 的 `name` 为空，扣 $300 零效果（应改用 `userData.paint` / `paintSlot`）。 |
| **G-07** | P0 | **GPT + Hark** | 地图 A（影响双图高架） | `src/maps/gta/region.js:220`<br>`src/vehicles.js:503`<br>`src/util.js:62, 67` | **GTA 日光堤道跨海桥外车道撞击桥下隐形桥墩**：桥墩在车道下方 `o = ±6 m`、顶高至 `3.75 m`，但 `vehicles.js:503` 调 `col.resolve()` 传死值 `y = 0.5`（应为 `this.y + 0.5`），导致 `y ≈ 5.3 m` 桥面上车辆撞上桥底隐形桥墩。 |
| **G-08** | P0 | **GPT** | 双图共用 | `src/missions.js:58-96`<br>`src/mission.js:53, 76-89`<br>`src/game.js:431-432, 524-528` | **任务多处永久软锁 + 坏存档崩死主循环**：①「夜班收银」店员死后永不复活且无失败分支致永久卡死；② 超过 330 m 车辆回收未保护任务车，冷链/追债/代客期间按 `Z` 切主角即销毁任务车永锁（同源解释 `perf_debug3` #11 的 `M.data.van` 未定义）；③ `loadSave()` 先 `Object.assign` 覆盖 `P.load` 再校验，坏/残缺存档每帧抛未捕获 `TypeError`。 |
| **G-09** | P0 | **GPT** | 双图共用 | `src/world.js:92-125` | **ATM 无限刷钱（负存款）+ 武器店重复扣全款**：`atmMenu`/`gunMenu`/`modMenu` 仅打开时算一次 `off`，`act()` 不复验余额也不重建菜单。ATM 连续按 2 无限提现 $1,000（银行余额扣至负数）；枪店可反复按同键重复扣全款买同一把枪或满护甲/满弹药继续扣钱。 |
| **G-10** | P0 | **Hark** | 双图 / 核心 | `src/maps/cyber/roofs.js:239`<br>`src/maps/gta/strip.js:229`<br>`src/veg.js:415`<br>`src/env.js:222` | **4 处行内 `//` 注释吞掉可执行代码**：① `cyber/roofs.js:239` 吞掉 `im.frustumCulled = false` 等 4 句 → 离开出生点后霓港全城屋顶细节全部被旧包围球裁剪消失；② `gta/strip.js:229` 吞掉 `if (w) { ... continue; }` → 商业带雨棚立柱穿树穿车穿建筑；③ `veg.js:415` 吞掉 `let lastX = 1e9, lastZ = 1e9;` → 泄漏全局变量，ESM/严格模式直接 `ReferenceError` 崩溃；④ `env.js:222` 吞掉 `sun.shadow.radius = 1.6;`。 |
| **G-11** | P0 | **Hark** | 地图 B | `src/maps/cyber/mapdata.js:139-150, 209-211`<br>`src/main.js:102-103`<br>`src/maps/cyber/nature.js:426-428` | **霓港核心区公园被吞噬长出 7 栋摩天楼 + 580 株野外植被被静默丢弃**：① `DISTRICTS` 中 `downtown` 排在完全位于其内部的 `dtpark` 之前，`districtAt()` 永不返回 `dtpark` → 0 棵公园树却生成 7 栋摩天楼（同页 `south` 亦遮蔽 `southdeco` 70% 宽度）；② `main.js:102-103` 先 `buildVegetation()` 后 `buildNature()`，后者写入 `city.palms`/`city.shrubs` 的 ~160 棵野外棕榈与 ~420 丛草原灌木全部丢失。 |

---

## 三、P1 高危缺陷（显性画面穿帮 / 严重性能与显存泄漏 / 碰撞与玩法破坏）

### 3.1 交 Hark（渲染 / 光影 / 地图 / 模型 / 显存）

- **G-12｜GTAO 将全部蒙皮角色替换为静态无蒙皮 T-Pose + 无限泄漏 `ShaderMaterial`（真机实测复现）**
  - `src/post.js:231-242, 252-253`、`src/people.js:100, 105`、`src/envprog.js:55, 234`
  - 角色材质统一挂 `alphaTest = 0.001` 与占位 `map`，触发 `post.js:252` 将所有 `SkinnedMesh` 换为不含 `#include <skinning_vertex>` 的 `cutMat(m)`，真机可见角色脚边翼状黑影、背部暗带及坐车司机穿透车顶 AO；`cutN` 对每个 NPC 克隆材质永久创建不释放的 `ShaderMaterial`。
  - *注：`perf_debug1` 已改 GTAO 复用主深度，请确认复用后 `cutMat` 路径与 `cutN` 泄漏是否彻底移除/绕过。*
- **G-13｜21 处 GLSL 未定义行为 `smoothstep(edge0, edge1, x)`（`edge0 > edge1`）（真机路人皮肤变洋红）**
  - `src/people.js:59`（2 处，从 `OLDNPC` 第 78 行回归）、`src/vehicles.js:442`（1 处，从 `OLDENV2` 第 447 行回归）、`src/mats.js` 18 处（`229, 242, 492, 513, 514, 524, 533, 810, 836, 858, 860, 863, 875, 942, 961, 977, 978, 982`）。
  - Windows ANGLE/D3D11 下 `people.js:59` 皮肤保护失效，真机实测路人全身变亮品红；车灯光锥与路面/人行道磨损同样存在驱动未定义行为。
- **G-14｜反射探针重绘阴影 & `sprobe` 钻地底 & 高频 `needsUpdate`**
  - `src/main.js:126-143`、`src/vehicles.js:728-729`
  - `main 0ef9f48` 上 `CubeCamera.update()` 未关 `shadowMap.autoUpdate`（每次 6 面重画 12 张 4K 阴影）、`sprobe` 高速每秒刷新 ~3.6 次并给全部车漆置 `needsUpdate = true`（*注：`perf_debug1/perf_debug4` 已优化阴影与探针节流*），**但仍需修复**：`main.js:139` 写死 `sprobe.cam.position.set(p.x, 2.2, p.z)`，在跨海大桥（5.2 m）与霓港雨林/高地（27–39 m）钻到地底拍黑图；且探针未开 `KIT_LAYER`。
- **G-15｜共享混凝土贴图 `.repeat` 被原地覆写，破坏全城混凝土平铺 4×（面积 16×）**
  - `src/main.js:88-91`、`src/mats.js:40-44, 342, 969`：`simpleMats` 设 `T.concrete_*` 为 `(0.25, 0.25)`，随后的 `buildingMaterial` 调 `texSet(T, 'concrete', 1)` 原地覆写回 `(1, 1)`。
- **G-16｜GPU 显存与 JS 堆泄漏（助力排查 `perf_debug3` 约 600 MB 未知 JS 堆！）**
  - `src/geo.js:5, 81-83`：`DROP_JS = CYBER` 导致 **GTA 地图从未释放 `city.world.buckets` 里的原始 JS 顶点/索引数组**（长期双倍几何内存）；
  - `src/people.js:456`：`Character.dispose()` 从未调用 `skeleton.dispose()`（每销毁一名 NPC 永久泄漏 GPU `boneTexture`）及克隆材质/`mixer`，且无行人对象池；
  - `src/vehicles.js:331-334, 545` & `src/police.js:40`：警灯/出租车顶灯/直升机几何与材质每次创建从未释放；
  - `src/props.js:296-302` & `src/street.js:320`：启动同步创建约 64–85 MB VRAM 招牌画布；
  - `build.cjs:4`：两张完整地图（GTA 1,077 KB + Cyber 925 KB 源码）全部静态打包进单一 2.37 MB `dist/main.js`，且 `cnglyph.js:20` 在 GTA 图也预先加载 `cnglyph.png`；`main.js:64` 加载解码 `car_sport_lod.glb` 却从未引用。
- **G-17｜GTA 大陆 `lotDetail` 在真实游玩中从未执行（仅 `?snap` 截图模式生效）**
  - `src/maps/gta/city.js:192`、`src/maps/gta/region.js:412-433`：`gta/city.js` 只包了 `region.load()`，而 live 游玩走 `budget = 1` 的 `begin -> step -> finish` 路径，完全绕过 `lotDetail`。
- **G-18｜全城路口路牌两面被金属背板 100% 遮挡**
  - `src/street.js:101-106, 166-167`：两块 `signFace` 放在同一坐标、`ry` 差 `Math.PI`，反面背板局部 `-0.012` 变换到世界 `+0.012` 正好盖住正面绿色牌面。
- **G-19｜GTA `city.groundH()` 漏算沙丘（~1.5 m）与木栈道 + 房屋长围栏端部失碰 + 运河棕榈空气墙**
  - `src/maps/gta/city.js:242-249`、`src/maps/gta/flora.js:237-303`、`src/maps/gta/beachkit.js:296-307`、`src/maps/gta/beachprops.js:114-150`：人物/车辆沉入沙丘 1.5 m、穿过木栈道下方，围栏/伞/躺椅被沙丘掩埋；
  - `src/maps/gta/houses.js:236-309`：10–12 m 长泳池网棚/围栏只登记在中心单格，查询半径仅 `r + 3 m` 致两端穿墙；
  - `src/maps/gta/marina.js:79` & `src/maps/gta/propfix.js:44`：运河棕榈重复加碰撞且迁移/删除后原 `city.col` 留空气墙。
- **G-20｜霓港港口（`port.js`）箱车错位悬空 + 设施全零碰撞 + 车轮平躺穿甲板**
  - `src/maps/cyber/port.js:264-681`：`quayBoxes`（`0xb0a7`）与 `props`（`0x2f9e`）随机种子不同，集装箱偏离拖车最高 6 m 悬空/穿车头；650–2600 m 仅画箱不画车；8 台拖车、5 台跨运车、3 台正面吊、3 台叉车、210 m 火车、14 根 34 m 灯塔与 44 系船柱全零碰撞；叉车与铁路平板车车轮未旋转呈水平圆柱穿地板。
- **G-21｜霓港脉冲大道隐形空气墙群 + 场景缺失碰撞 + 雨林高原树木碰撞封顶 `y = 30 m`**
  - `src/props.js:534-540`、`src/street.js:193-214`、`src/maps/cyber/pedlane.js:22-42`：`colfix` 仅对 GTA 生效，霓港脉冲大道每 13 m 空白处留 1×1 m 隐形咖啡桌墙、公交亭 4.4×4.4 m 方盒堵死步道、南侧报箱碰撞建在反方向空地、步道垃圾桶零碰撞；
  - `src/maps/cyber/bldglayer.js:257-277`、`src/maps/cyber/viaduct.js:253-285`、`src/maps/cyber/nature.js:408-440`：天桥柱/楼梯、高架下夜市摊、~800 块野巨石与林下棕榈零碰撞；雨林高原高至 39.8 m（~16 公顷 > 30 m），树碰撞高度写死绝对 `30`。
- **G-22｜左上角生命/护甲/体力 SVG 图标 CSS 错位变纯黑（真机截图复现）**
  - `src/index.html:22-24, 71`：CSS 写 `#hp svg` / `#ar svg` / `#st svg`，实际 DOM 中 `<svg>` 位于父元素 `#hpb`/`#arb`/`#stb` 内，选择器全不命中，图标默认纯黑 `#000` 夜间不可见。

### 3.2 交 GPT（玩法 / 物理 / AI / 任务 / 经济 / UI / 工具）

- **G-23｜小地图玩家箭头永久反向 180°（真机截图复现）**
  - `src/hud.js:156, 187-188`：第 187 行多加了 `+ Math.PI`，箭头朝下并反转左右转向。
- **G-24｜输入与焦点失控（失焦卡死按键/慢动作轮盘、菜单不挡移动、指针锁未捕获异常）**
  - `src/game.js:57-90`、`src/hud.js:39-40`、`src/weapons.js:62-82`：缺 `blur`/`visibilitychange`/`pointerlockchange` 清理，切窗或按 `Esc` 卡死奔跑/射击/0.25× 慢动作；开车按 `Q` 可白嫖无限慢动作；开手机/菜单时 `WASD`/`F`/`Z`/`1-6` 仍生效；`requestPointerLock?.()` 未 `.catch()` 报 `Uncaught (in promise) WrongDocumentError`。
- **G-25｜击杀闲置第二主角切人操控“滑行尸体” + 换弹切人污染近战弹药为 `NaN`**
  - `src/game.js:151`、`src/world.js:65-82`、`src/weapons.js:45-76`：射杀伊莎后按 `Z` 切换成平躺滑行且无武器状态；换弹中按 `Z` 切到拳头/球棍会把 `clip`/`reserve` 算成 `NaN` 写入存档。
- **G-26｜`Traffic.update()` `dead` 漏 `continue;` + 车速 4.6 m/帧无子步穿墙 + 狭巷下车卡墙**
  - `src/vehicles.js:497-509, 674, 713-717`、`src/maps/cyber/traffic.js:92, 122-126`、`src/game.js:115-123, 413-414`：报废车松手刹乱打方向；跑车 92 m/s 在 20 fps 单步 4.6 m 穿柱穿墙；右侧下车不查 `col.resolve` 把人塞进墙内；车车碰撞推挤后未再调 `col.resolve`。
- **G-27｜战斗与警察/直升机多项漏洞**
  - `src/game.js:147-154`、`src/weapons.js:89-96`：车辆受击体仅车心 1.1 m 球体（车头/车尾打空）；射线起点前移致贴脸打空、贴墙被挡或穿薄墙；
  - `src/police.js:43-55`、`src/game.js:194-268, 500-513`：直升机探照灯无遮挡检测（躲楼后/屋檐下仍永锁 4 星）；警察/帮派 LOS 写死 `y=1.1~1.6` 且无视车辆；空警车/报废警车隔大楼打伤玩家；鞭尸；
  - `src/missions.js:45-50, 114-119`：`gang` 同帧击杀+离圈抛 `TypeError`；失败泄漏存活帮派 NPC；刷敌未查碰撞可刷进集装箱；
  - `src/mission.js:10-75`：代客泊车把客车刷在 `(290, 0)` 十字路口中央、未互斥主线任务、不回收客车致重叠爆炸；
  - `src/world.js:43, 157`：大陆甘蔗区 ATM 3D 机箱刷在 1.12 km 外的棕榈岛；逃跑超时抢包贼仅 `dispose()` 未从 `peds.list` 删除留隐形幽灵。
- **G-28｜GTA 寻路 `roadroute.js` 丢失星湾岛环路及多处关键 POI**
  - `src/roadroute.js:7-41`：`pring` 因单路口 `a === b` 被丢弃（0 条边）；海滨步道（`x > 300`）、警局、冷库、旧船坞超出 `best.d < 40` 返回 `null`（GPS 画直线穿楼、警车失路）。
- **G-29｜`runplan.cjs` 在 Windows 彻底不可用（且无 `/workspace/work` 时无限死循环）**
  - `runplan.cjs:5-24`：硬编码 `free -m`/`setsid`/`pgrep`/`/workspace/work/CHROMIUM.lock`，`mkdirSync` 吞 `ENOENT` 死循环。

---

## 四、P2 中危与 P3 低危精选清单

### 渲染 / 模型 / 地图细节（Hark）
1. **后期与水面配置**：`post.js:30, 106, 149` 初始 `uRes` 硬编码 `1280×720`；`post.js:269` Bloom 半分辨率构造后被 `addPass` 覆写回全分辨率（4× 开销）；`?ao=0` 仍跑完整 GTAO；`LensShader:116` 缺 `pc.w > 0` 防护；`water.js:128-130` `Reflector` 未传 `multisample: 0` 意外开 4× MSAA HalfFloat 且不随窗口 resize；`water.js:92` 霓港禁用远海渐隐；`mats.js:898` 湿路反射误用视图空间 `normal.xz` 扰动屏幕 UV（真机霓港夜路现过曝白色横向条纹）；`mats.js:588, 688` 潜在零向量 `normalize` NaN。
2. **模型与几何瑕疵**：
   - 跑车（`sport`/`sport2`）车轮前进时倒转（`src/vehicles.js:184, 525`）；
   - 敞篷车（`conv`）鲨鱼鳍天线悬空在开放座舱正中（`src/carbody.js:262`）；
   - GTA 两座桥底法线朝上（桥下仰视透明）+ 栏杆锯齿台阶（`src/maps/gta/region.js:217-258`、`archdetail.js:265`）；
   - 路灯光池写死 `y = 0.04/0.19` 沉入高架/桥下 6 m（`src/props.js:204`）；
   - 霓港集装箱场泛光灯锥悬空（`src/maps/cyber/bldglayer.js:232` 漏用 `gy.mast`）；瀑布水雾夜间发纯白穿雾（`src/maps/cyber/nature.js:501-619`）；
   - GTA 街角路牌悬空在 2.6 m 柱顶上方（`src/maps/gta/signage.js:307-311`）；南北远端海滩淋浴细节永久被裁剪（`src/maps/gta/beachkit.js:328`）；
   - 霓港 `cnglyph_chars.js` 缺 22 个汉字（疑似提取脚本被 `'SOLA//NET'` 截断）；
   - 霓港 `clutcap.js:68` 循环变量 `k` 遮蔽外层 `k === 'stall'`；GTA `parkfix.js:235` 把西侧路灯误判为红绿灯；霓港推车/垃圾桶轮子平躺、烧烤摊啤酒箱重叠（`dress.js:117, 151`、`street2.js:190, 228`）；直升机 4 片旋翼两两重合 Z-fighting（`police.js:20`）。

### UI / 音频 / AI / 性能热点 / 工程卫生（GPT + 共同）
3. **UI 与跨图串味**：`#help` 第 0 帧即被欢迎弹窗隐藏（`game.js:98-99`、`hud.js:90`）；按 `M` / 手机「地图」空转（`bigMap` 从未被读）；手机面板挡住 `#area` 且不响应鼠标点击；加载完成 `#lp` 还原成“正在载入城市…”（`main.js:152`）；HTML 初始弹药 `12 / 96` 进图变 `12 / 48`；通缉证据图标不重置且“车”证据从未触发；霓港欢迎语写“索拉纳港”、街牌/公交站写 GTA 路名与“索拉纳银行”、脉冲大道约半数停车逆向。
4. **音频**：`sfx.station = 0` 与 `world.station = -1` 初始失步；切台/下车残留 ~3 s 音符；切后台标签页引擎/警笛不停；未检 `ctx.state === 'running'`（`src/sfx.js:3-55`）。
5. **AI / 物理 / 性能热点**：车辆湿沙滩夹在 `y >= 0` 悬空 1–1.5 m（`vehicles.js:514`）；逃跑行人 12 s 后瞬移 60+ m（`people.js:577-583`）；车流无视行人（`game.js:299`）；开车穿帮派/店员无碰撞（`game.js:422`）；近战无高度与穿墙检测且打不到店员；手机叫技工无限刷永不回收车进墙/海；警察/帮派/店员/待机主角缺 `setLod()` 全程 LOD0 蒙皮；`seating.js`/`poseSeated` 每帧数千次分配、`props.js` 每帧排序全图路灯、`roadroute.js` 每帧无缓存 `O(V²)` Dijkstra、`util.js` 每帧 ~200 次 `new Set()`、`main.js` 3 次冗余 shader `precompile`；`src/mapapi.js` 为未接入的死代码且双图契约不一致。
6. **安全与打包卫生**：`world.js:182-200` `localStorage` 资产名直接进 `innerHTML`（存储型 XSS）；`tools/single.cjs` 隐式依赖未写入 `package.json` 的 `sharp`、重复内嵌 228 KB 字体、有损压缩 log-HDR 天空；`shot.cjs` 缺路径穿越校验与 `try/finally` 清理；`world.js:223` `promptK` 离圈不重置导致二次进店无提示。

---

*报告人：**Gemini**（代码审计 + Windows 真机 WebGL2 实测）*
