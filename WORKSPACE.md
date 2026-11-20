# 索拉纳港 Port Solana —— 唯一工作区（real/）

**2026-11-20 22:37 用户：「现在两个会话合并，不要分开，不然浪费资源…我们以现在这个会话为基准，合并进来。另一个会话停止。我们最终给出两个地图，一个是gta6，一个是赛博朋克。」**

- 从 r6.0 起，**只在 real/ 开发**。一个代码库、一个游戏、两张地图：
  - 地图 A「索拉纳港 PORT SOLANA」（`?map=gta`）：写实 GTA6 式海湾都市，昼夜都写实，不出现任何赛博/霓虹全息元素。代码 `src/maps/gta/`。
  - 地图 B「霓港 NEOPORT」（`?map=cyber`）：赛博朋克夜城（默认 21:36 开局，也有白天），全息广告、塔楼灯带、紫雾、雨林/草原。代码 `src/maps/cyber/`。
  - 开局主菜单选图；`?map=gta|cyber` 或 `#map=` 跳过菜单；无头测试（navigator.webdriver）默认 A 图。
- **v3/ 已归档、只读**：原「索拉纳港 Port Solana 开放世界」项目（7e768f1c）的赛博朋克线 v4.5，已于 2026-11-20 22:40 停止并整体并入 real/（地图 B）。不要再改 v3/，也不要再发布到它的 Page 96467e5f。
- 锁：real/RUNNING.lock（开工写、结束删）。无头 Chromium 全局锁 /workspace/work/CHROMIUM.lock（runplan.cjs 自动取）。发布副本：real/release/。截图：real/shots/。
- GitHub：每轮验证+发布后 `bash real/sync_github.sh "r<版本>: 摘要"`（shell credentials provider=github）→ Liyang1145/port-solama main。只同步 real/。推前先 fetch，合并 GPT 等协作者已进 main 的提交；open PR 先 build + 回归，通过再 squash 合并。
- 对接帖：https://github.com/Liyang1145/port-solama/issues/1（Hark=渲染/地图/美术；GPT=后端逻辑：game/mission(s)/police/存档/经济/事件/测试）。
- **Page**：「索拉纳港 Port Solana 写实版」project_id `3fffda2d-4e56-495b-9ce7-5dc21581ec86`（r6.0 起同一页面同时含两张地图，用 action=edit 原样替换 index.html）。私有，用户在 App 内 Share 后才可外链。

## 目录（r6.0）
```
src/                 共用玩法与渲染系统（两张图共用）
  mapsel.js          MAP / CYBER：当前地图（载入前由菜单决定）
  city.js            门面：LAYOUT（两图共有的 Deco 海滨核心区）+ buildCity → 当前地图
  mapdata.js         门面：当前地图的 POI / MISSION_STARTS
  mapapi.js          门面：地图查询接口，两图同一套签名（useMap() 供 Node 测试）
  game.js missions.js mission.js world.js police.js weapons.js gunmodels.js vehicles.js people.js hud.js sfx.js ...
  mats.js env.js post.js water.js props.js veg.js  渲染；霓港专属部分用 CYBER 开关（A 图与 r5.0 一致）
  maps/gta/          地图 A：mapdata.js mapgeo.js region.js city.js mapapi.js
  maps/cyber/        地图 B：mapdata.js roadgraph.js parcels.js region.js stream.js nature.js neon.js city.js traffic.js mapapi.js names.js
```
