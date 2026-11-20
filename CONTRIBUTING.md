# Contributing / agent protocol

Several AI agents (and humans) work on this repo. Follow these rules.

## Before you start
1. Read `ROADMAP.md`, `GAMEPLAY_PLAN.md`, `MAP_DESIGN.md`, `SELFCHECK.md` and the tail of `ITERATION_LOG.md`.
2. Pick ONE item. Open (or comment on) a GitHub issue named after it and assign/claim it so nobody else takes it.
3. Work on a branch `agent/<your-name>/<short-topic>`, never directly on `main`.

## Hard rules
- Original content only: no Rockstar/GTA names, characters, logos, audio, textures or models; no ripped game assets.
- Assets must be CC0 / MIT / CC BY (with attribution) — add every new asset to `CREDITS.md`.
- Never commit reference screenshots of other games (`ref/` is git-ignored for this reason).
- UI text is Chinese.
- Keep `dist_single/index.html` under 45 MB; keep the scene memory-friendly (current budget ≈ 4.5 M triangles).

## Verify before opening a PR
- `node build.cjs` passes.
- Screenshots (golden-hour street, close-up, night, gameplay) look right: no blown-out whites, no black frames, no clipping, no page errors. `shot.cjs` / `runplan.cjs` with `plans/*.json` drive headless Chromium (one browser at a time; ≥2.5 GB free RAM).
- Logic sims pass with 0 errors: `plans/v35sim.json`, `plans/mission.json` and any plan for your system.
- Update `ITERATION_LOG.md` (date, version, what changed, known issues), `ROADMAP.md`, `SELFCHECK.md` scores with evidence.

## Pull requests
Small, focused PRs with before/after screenshots in the description. The maintainer's agent merges to `main` and publishes the playable build.

## 后端开发协作说明（r5.0 起，给 GPT / 其他后端协作者）
仓库只同步写实分支（项目里的 `real/` 目录）；维护方的 Hark agent 每轮验证、发布后把 `real/` 推到 `main`。
推之前它会先 `git fetch`，把 `main` 上别人合入的新提交合回 `real/`，不会覆盖你的改动——前提是你走下面的 PR 流程。

### 代码结构（r6.0：一个游戏、两张地图；src/ 由 esbuild 打包成 dist/main.js）
开局菜单选图（`index.html` 里的 loader 先定地图再运行游戏包）：`?map=gta`＝地图 A「索拉纳港」（写实），`?map=cyber`＝地图 B「霓港」（赛博朋克）。
无头测试（navigator.webdriver）不带参数时默认 A 图。**玩法系统两张图共用，只写一份。**

| 位置 | 职责 |
|---|---|
| `src/mapsel.js` | `MAP` / `CYBER`：当前地图（载入时就确定，模块可以直接读） |
| `src/city.js`（门面） | `LAYOUT`（两图共有的 Deco 海滨核心区）+ `buildCity` → 当前地图的 `maps/<map>/city.js` |
| `src/mapdata.js`（门面） | 当前地图的 `POI` / `MISSION_STARTS`（玩法代码只从这里取点位） |
| `src/mapapi.js`（门面） | 地图查询接口，两图同一套签名（见下） |
| `main.js` | 渲染器、资源加载、世界组装、主循环、测试钩子 `window.__G`（`step(n)`、`render()`、`setHour(h)`、`stats()`、`map`） |
| `game.js` | 游戏状态机：玩家、相机、犯罪与通缉、警察派遣、命中、存档（每张图一个存档键）；`state()` 返回快照 |
| `vehicles.js` | 车辆物理 + A 图交通（网格车道 + r5 折线路网）；B 图交通在 `maps/cyber/traffic.js`（`GraphTraffic`，同样的 cars/spawnCar/removeCar/update/waypoint） |
| `people.js` | 角色（骨骼动画、LOD、瞄准层、手持武器）+ 行人（街区环线 / A 图折线人行道 / B 图路网人行道） |
| `police.js` / `missions.js` / `mission.js` / `world.js` / `weapons.js` / `gunmodels.js` / `hud.js` / `sfx.js` | 警察、任务、代客泊车、商店/手机/经济、武器、界面与小地图（按地图画）、音频 |
| `mats.js` `env.js` `post.js` `water.js` `props.js` `veg.js` | 渲染；B 图专属的赛博朋克/风化部分由 `CYBER` 开关控制，A 图保持 r5.0 原样 |
| `src/maps/gta/` | A 图：`mapdata.js`（POI、任务起点、REGION）→ `mapgeo.js`（纯 JS 路网/地块）→ `region.js`（3D + 128 m 流式）、`city.js`、`mapapi.js` |
| `src/maps/cyber/` | B 图：`mapdata.js`（海岸、道路、区域、POI）→ `roadgraph.js` → `parcels.js` → `stream.js`（160 m 流式）、`region.js`、`nature.js`（草原/雨林/瀑布）、`neon.js`（全息广告）、`city.js`、`traffic.js`、`mapapi.js`、`names.js`（原创地名） |

后端/逻辑类改动优先放在：`mapgeo.js`（地图数据算法，可单测）、`vehicles.js` Traffic、`police.js`、`missions.js`、`world.js`、存档（`game.js` save/load）。

### 命令
```bash
npm install
node build.cjs                     # 必须通过
node tools/mapgen.cjs              # 重新生成俯视设计图 shots/map/*.png（读 mapdata + mapgeo，与游戏同源）
node runplan.cjs plans/<plan>.json shots/<dir> 3   # 无头 Chromium（SwiftShader）跑测试计划；结果 json + png
# 测 B 图：计划的 query 里加 map=cyber（例：plans/r6_cyber_smoke.json）
CAP=canvas SW=960 SH=540 node runplan.cjs ...       # 内存紧时：直接读 canvas、低分辨率
node tools/single.cjs              # 发布用单文件 dist_single/index.html（< 45 MB）
```
回归（每个 PR 都要过、0 个 PAGEERROR）：`plans/v35sim.json`（驾驶/通缉/行人）、`plans/mission.json`（代客泊车）、`plans/gp_weapons.json`、`plans/gp_missions.json`、`plans/gp_phone.json`、`plans/gp_police.json`、`plans/r5_smoke.json`（堤道驾驶、大陆交通/行人、手持武器）；r6.0 起总回归 `plans/r5_regress.json`（A 图）+ `plans/r6_cyber_smoke.json`（B 图：开车、零点堤道、开枪、通缉、任务、路网交通/行人）。
测试计划格式：`{"query":"hour=16&lowshadow&probe=0","shots":[{"name":"x","noshot":true,"js":"const g=__G.game; ...; g.state()"}]}`，`js` 的返回值写到 `shots/<dir>/<name>.json`。
共享机器内存约 8 GB：一次只开一个无头浏览器；`runplan.cjs` 会取全局锁 `/workspace/work/CHROMIUM.lock`，只杀自己的进程组。

### 分支与 PR 流程
1. 从最新 `main` 拉分支：`agent/<你的名字>/<主题>`（例如 `agent/gpt/police-dispatch`）。不要直接推 `main`。
2. 小而专注的提交；改动玩法/数据时同步更新 `GAMEPLAY_PLAN.md` / `MAP_DESIGN.md`，并在 `ITERATION_LOG.md` 末尾记一条。
3. 开 PR 到 `main`，描述里写：改了什么、跑了哪些 plan、关键数值（json 摘要）、已知问题。
4. 维护方 agent 审核合并；合并后的改动会在下一轮被合回 `real/` 并随版本发布。冲突时以 `main` 上已合并的代码为准再叠加本轮改动。
5. 不要提交 `ref/`（参考截图）、`dist_single/`、`node_modules/`、大于 5 MB 的新素材（先在 issue 里讨论）。

### 地图查询接口（逻辑层请只通过它读地图）——`src/mapapi.js`
纯 JS，浏览器和 Node 都能用；**两张图同一套签名**，自动回答当前地图（浏览器里由开局选择决定；Node 测试用 `useMap('gta'|'cyber')` 切换）。
```js
import { getPOIs, nearestRoad, roadPointAhead, districtAt, isOnLand, randomRoadPoint, roadNetwork, useMap, currentMap } from './mapapi.js';
getPOIs()                    // { gunshop, stores[], clothes, modshop, atms[], hospital, precinct, valet, depot, shipyard, debt, restaurants[], missionStarts[] }
nearestRoad(x, z)            // { id, name, kind:'grid'|'ribbon'(A)|'graph'(B), dist, onRoad, x, z, tx, tz, hw, s } 最近道路中心线
roadPointAhead(x, z, tx, tz, ahead=35) // 沿最近道路前进 ahead 米、朝目标更近的方向的点（追车/逃跑/导航）
districtAt(x, z)             // { id, name, sub }：A 图 甘蔗区/湾畔/星湾岛/日光堤道…；B 图 数据核心区/零点堤道/电穗草原/雾网雨林…
isOnLand(x, z)               // 是否陆地或桥面（近似）
randomRoadPoint(rand, nx, nz, minD, maxD) // 路网上随机车道点 {x, z, yaw, road, id}（刷车、任务目标）
roadNetwork()                // { roads, junctions, pieces, grid }（A：r5 折线路网；B：v4.4 路网图，roads 带 pts，junctions 带 deg/signal）——做 A* 用
useMap(id) / currentMap()    // Node 测试切图 / 查询当前图
```
运行时的精确地面高度（含堤道桥拱、人行道路缘）仍是 `city.groundH(x, z)`；地块/建筑碰撞在 `city.col`（含旋转 OBB）。
新增点位按地图加：A 图 `src/maps/gta/mapdata.js` 的 `POI` / `POI_R5`，B 图 `src/maps/cyber/mapdata.js` 的 `POI` / `MISSION_STARTS`（地图图片 `node tools/mapgen.cjs` 会自动画出来）。
