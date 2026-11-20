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

### 代码结构（src/，esbuild 打包成 dist/main.js）
| 文件 | 职责 |
|---|---|
| `main.js` | 渲染器、资源加载、世界组装、主循环、测试钩子 `window.__G`（`step(n)`、`render()`、`setHour(h)`、`stats()`） |
| `game.js` | 游戏状态机：玩家（步行/驾驶）、相机、犯罪与通缉、警察派遣、命中判定、存档；`state()` 返回可断言的快照 |
| `mapdata.js` | **纯数据**：玩法点位 `POI`、任务起点、r5 大地图控制点 `REGION`（道路折线、人工岛、桥拱、区名） |
| `mapgeo.js` | **纯 JS（无 three.js，可在 Node 里跑）**：道路稠密路径、路口与裁切、人行道段、自然海岸线、确定性建筑地块 |
| `region.js` | r5 大地图几何：堤道/桥/人工岛/大陆街区；建筑按 128 m 分块流式加载（远景低模常驻，近景 ≤300 m 生成、>440 m 卸载）；`groundH` |
| `city.js` | 原 Deco 海滨区（网格路网、街区、酒店、海滩、码头、天际线），调用 `buildRegion` |
| `vehicles.js` | 车辆物理（牵引/功率/风阻/轮胎极限）+ `Traffic`：网格车道 + r5 折线路网（`mode:'rib'`，路口按节点选路，z=0 街与堤道互通） |
| `people.js` | 角色（MakeHuman 骨骼动画、LOD、上半身瞄准层、手持武器）+ 行人（街区环线 / r5 人行道折线） |
| `police.js` / `missions.js` / `mission.js` / `world.js` / `weapons.js` | 警察 AI、任务框架与 4 个任务、代客泊车、商店/手机/经济、武器系统 |
| `gunmodels.js` | 手持武器程序化模型（手枪、冲锋枪、霰弹枪、步枪、球棍） |
| `hud.js` / `sfx.js` / `post.js` / `env.js` / `mats.js` / `water.js` | 界面与小地图、音频、后期、天空光照、材质着色器、水面（含海岸距离图） |

后端/逻辑类改动优先放在：`mapgeo.js`（地图数据算法，可单测）、`vehicles.js` Traffic、`police.js`、`missions.js`、`world.js`、存档（`game.js` save/load）。

### 命令
```bash
npm install
node build.cjs                     # 必须通过
node tools/mapgen.cjs              # 重新生成俯视设计图 shots/map/*.png（读 mapdata + mapgeo，与游戏同源）
node runplan.cjs plans/<plan>.json shots/<dir> 3   # 无头 Chromium（SwiftShader）跑测试计划；结果 json + png
CAP=canvas SW=960 SH=540 node runplan.cjs ...       # 内存紧时：直接读 canvas、低分辨率
node tools/single.cjs              # 发布用单文件 dist_single/index.html（< 45 MB）
```
回归（每个 PR 都要过、0 个 PAGEERROR）：`plans/v35sim.json`（驾驶/通缉/行人）、`plans/mission.json`（代客泊车）、`plans/gp_weapons.json`、`plans/gp_missions.json`、`plans/gp_phone.json`、`plans/gp_police.json`、`plans/r5_smoke.json`（堤道驾驶、大陆交通/行人、手持武器）。
测试计划格式：`{"query":"hour=16&lowshadow&probe=0","shots":[{"name":"x","noshot":true,"js":"const g=__G.game; ...; g.state()"}]}`，`js` 的返回值写到 `shots/<dir>/<name>.json`。
共享机器内存约 8 GB：一次只开一个无头浏览器；`runplan.cjs` 会取全局锁 `/workspace/work/CHROMIUM.lock`，只杀自己的进程组。

### 分支与 PR 流程
1. 从最新 `main` 拉分支：`agent/<你的名字>/<主题>`（例如 `agent/gpt/police-dispatch`）。不要直接推 `main`。
2. 小而专注的提交；改动玩法/数据时同步更新 `GAMEPLAY_PLAN.md` / `MAP_DESIGN.md`，并在 `ITERATION_LOG.md` 末尾记一条。
3. 开 PR 到 `main`，描述里写：改了什么、跑了哪些 plan、关键数值（json 摘要）、已知问题。
4. 维护方 agent 审核合并；合并后的改动会在下一轮被合回 `real/` 并随版本发布。冲突时以 `main` 上已合并的代码为准再叠加本轮改动。
5. 不要提交 `ref/`（参考截图）、`dist_single/`、`node_modules/`、大于 5 MB 的新素材（先在 issue 里讨论）。

### 地图查询接口（逻辑层请只通过它读地图）——`src/mapapi.js`
纯 JS，浏览器和 Node 都能用；地图以后怎么重构，这些函数签名保持不变。
```js
import { getPOIs, nearestRoad, roadPointAhead, districtAt, isOnLand, randomRoadPoint, roadNetwork } from './mapapi.js';
getPOIs()                    // { gunshop, stores[], clothes, modshop, atms[], hospital, precinct, valet, depot, shipyard, debt, restaurants[], missionStarts[] }
nearestRoad(x, z)            // { id, name, kind:'grid'|'ribbon', dist, onRoad, x, z, tx, tz, hw, deckY? } 最近道路中心线（岛上网格 + r5 折线路网）
roadPointAhead(x, z, tx, tz, ahead=35) // 沿最近道路前进 ahead 米、朝目标 (tx,tz) 更近的方向的点（追车/逃跑/导航用）
districtAt(x, z)             // { id, name, sub }：甘蔗区 / 湾畔 / 壁画仓库区 / 星湾岛 / 日光堤道 / 海燕沙丘 / 南角红树林 / 棕榈岛…
isOnLand(x, z)               // 是否陆地或桥面（近似）
randomRoadPoint(rand, nx, nz, minD, maxD) // 折线路网上随机车道点 {x, z, yaw, road}（刷车、任务目标）
roadNetwork()                // { roads, junctions, pieces, grid } 原始路网（做寻路/A* 用）
```
运行时的精确地面高度（含堤道桥拱、人行道路缘）仍是 `city.groundH(x, z)`；地块/建筑碰撞在 `city.col`（含旋转 OBB）。
新增点位请加在 `src/mapdata.js` 的 `POI` / `POI_R5`（地图图片 `node tools/mapgen.cjs` 会自动画出来）。
