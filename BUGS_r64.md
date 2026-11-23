# BUGS_r64 — perf_debug1 真人场景排查（基于 main 0ef9f48 / r6.4）

测量环境：无头 Chromium + SwiftShader（软件 GPU，ARM 沙箱）。毫秒数只做**相对**对比；draw calls / 三角形 / 程序数与机器无关。
工具：`?prof` 帧分析器、`tools/human.cjs`（真实键鼠事件场景）、`tools/rcmp.cjs`（960x540@1.5x 渲染帧对比）、`tools/cpuprof.cjs`（CDP 采样）。
「旧」= `?oldshadow&oldgbuf&oldprobe&oldres&oldsharp&oldstep&oldmirror&oldmwu&oldhud&oldanim`。

## 前后数据（gta 图，出生点 15:00，1440x810 渲染帧）
| 指标 | 旧 | 新 |
|---|---|---|
| 渲染帧 p50 | ~256 ms | ~82 ms（约 3.1 倍快） |
| draw calls / 帧 | 7175（首帧 23241） | 3500–4400 |
| 三角形 / 帧 | 25.4 M | 13.8–17.4 M |
| 着色器程序 | 100 | 84 |
| 阴影 pass | 2518 calls / 11.4 M tris | 1131 / 5.4 M（每帧一次） |
| 主场景 pass | 2 遍（Hv + a，各 ~10 M） | 1 遍（GTAO 复用主深度） |
| 逻辑帧（guns 场景）p50/p95 | 10.3 / 30.7 ms | 10.1 / 23.1 ms |
| char.update + peds | 4.93 + 5.19 ms | 4.53 + 4.67 ms（动画 LOD） |
| PAGEERROR | 0 | 0 |

## 根因
- **糊**：旧后处理链按 CSS 像素（像素比 1）渲染再拉伸到 1.5x 画布 → 已改为真实像素比 + 动态分辨率（DRS）+ CAS 锐化，减轻色差/颗粒/运动模糊（`?oldres` `?oldsharp`）。
- **低帧**：阴影每帧渲染多遍、GTAO 单独再画一遍场景深度、反射探针整帧更新、角色进入镜面/探针 → 每帧 2 倍以上的 draw calls。
- **卡顿**：每帧一个可变步长（低于 20 fps 时变慢动作、物理大步长）→ 固定 1/60 s 子步进；HUD 每帧写 DOM；每帧多次矩阵遍历；人群动画每帧全量采样。

## 未解决（按严重度）
| # | 严重度 | 问题 | 归属 |
|---|---|---|---|
| 1 | 高 | 水面镜面反射 pass 现在是最大头：1855 calls / 9.1 M tris（gta 出生点），比主场景还多。需要镜面专用低 LOD/裁剪距离/层过滤或半频更新 | Hark |
| 2 | 高 | 单帧尖峰 ~3 s（渲染第 1–2 帧内，疑为 sprobe 立方体/着色器首编译）；真机上表现为进游戏/转场后一次大卡 | Hark |
| 3 | 高 | JS 堆常驻 ~900–1000 MB；沙箱里 3 分钟会话和昼夜场景都被系统 OOM 杀掉（dmesg 有 oom-kill chrome）。低内存机器会崩。几何属性数组上传后仍留在 JS 内存，需评估释放 | Hark（交 GPT 评审） |
| 4 | 中 | Esc 不暂停游戏：按 Esc 后按住 W 角色仍在移动（menus 场景 escapePausesGame=false），缺暂停菜单 | 交 GPT |
| 5 | 中 | gta 出生点附近 (275.4, 25.8) 步行走向停着的车时被卡住，侧移 6 次仍 <8 m 前进（car 场景 player-stuck ×8） | 交 GPT |
| 6 | 中 | (279, -7) 与 (283.2, -368.9) 也报 player-stuck（按住 W 1.5 s 位移 <0.3 m） | 交 GPT |
| 7 | 低 | 逻辑帧仍有 250–370 ms 单帧尖峰（每个场景开头 1 帧，疑为流式加载/首次 GC） | Hark |
| 8 | 低 | 剩余 CPU：Character.update/locomote ~16%、碰撞网格 query ~5.5%、AnimationMixer ~14%（cpuprof） | Hark |

## 场景覆盖（gta）
walk ✔、car（未能走到车旁：#5）、guns ✔（手枪/冲锋枪/换弹/武器轮/通缉 1 星）、mission（场景脚本朝错方向走了 465 m，属脚本问题；任务流程本身在 r5 回归中通过）、menus ✔（手机/大地图开关正常，Esc 不暂停 #4）、daynight ✗、session3min ✗（均被沙箱 OOM 杀掉，见 #3）。
cyber 图的真人场景本轮未跑完（时间/内存），仅跑回归 B。
截图：本轮无头环境下 1440x810 的 toDataURL 超时，未产出可看的新截图，清晰度改善未经肉眼复核。

## perf_debug3 更新（同分支，2f8da42 → f98bc7c）
新开关：`?oldrefl`（旧镜面）、`?nowarm`（不预热）、`?keepgeo`（不释放 CPU 顶点数组）。数据来自 `tools/rcmp.cjs`（gta 出生点 15:00，1440x810）与 `tools/first.cjs`（首帧拆解 + 几何内存普查）。

| 指标 | 旧 | 新 |
|---|---|---|
| 水面镜面 pass（画的那一帧） | 1856 calls / 9.09 M tris | 405 calls / 3.36 M tris（−78% / −63%） |
| 镜面更新频率 / RT 尺寸 | 每帧 / 0.5x 窗口 | 隔帧 / 0.35x 窗口 → 平均每帧约 200 calls / 1.7 M tris |
| 首个渲染帧（snap） | 3022 ms（新编译 39 个程序：主 pass 1818、镜面 543、阴影 537） | 1115 ms（程序在加载期预编译，首帧 0 新程序；剩下的 782 ms 是首个逻辑帧：HUD 首绘 239、生成人车 212） |
| 正式游玩（非 snap） | 点「开始」后第一帧卡 ~3 s | 点「开始」后在加载画面下先编译并跑一帧隐藏完整帧（编译+HUD 首绘+生成都在加载画面下） |
| JS 堆 | ~1000 MB | ~1000–1100 MB（**未达标**，只释放了 17 MB） |

镜面裁剪规则：距离 >650 m、视角半径 <0.02 rad、整体低于水面 +1.6 m（地面/路面/路缘，掠射角下看不见）的网格在镜面渲染时暂时隐藏；天空与 frustumCulled=false 的大网格始终保留；阴影贴图改为只在主 pass 渲染（防止被裁的物体丢影子）。画面差异：截图因沙箱 OOM 未能导出，**未经肉眼复核**。

### 新增/更新的问题
| # | 严重度 | 问题 | 归属 |
|---|---|---|---|
| 3（更新） | 高 | JS 堆仍 ~1 GB。普查：CPU 侧顶点数组 305 MB + 索引 28 MB，其中按位置签名判定的重复几何 ~41 MB；最大一块是未命名 Mesh 117 MB、vcol 地块 ~48 MB、角色 ~40 MB。只释放 normal/uv/color 仅得 17 MB（多数网格在登记前已上传，或是位置/索引/自定义属性）。剩余 ~600 MB 不在几何里，需真正的堆快照（沙箱内存不够拍 1 GB 快照）| Hark（下一轮，需大内存机器拍快照）|
| 9（perf_debug4 已处理） | 中 | 街道反射探针 sprobe：每面裁剪（>380 m、<0.03 rad、35 m 外低矮地面/路缘、单件 <8 m 的城市级实例集：街具/棕榈/停放车辆）+ 64 px 面 + 隔帧一面 + 6 s/15 s 刷新（?oldsprobe 回退）。gta 出生点：单面最大 2086 calls / 9.06 M tris / 52 ms → 538 / 4.27 M / 24 ms；一次刷新合计 calls 15559→3956（两次捕获窗口）。剩余三角形来自覆盖全城的合并建筑网格，按包围球无法裁 | Hark |
| 10（更新） | 中 | 沙箱截图：tools/shotlite.cjs（--single-process + readPixels）不再 OOM，但 SwiftShader 下加载 30–37 s + 第 8 帧（PMREM）20–36 s，读回超过单次 100 s 上限，**新旧对比截图仍未导出**；回归一项也要 ~100 s（regress_fresh 超时后 chrome 成孤儿需手动按 PID 杀）。需要更大内存/更快的机器或后台执行 | Hark（工具）|
| 11（新） | 低 | 回归 B 的 missions 脚本第一次跑报 `TypeError: reading 'x'`（cyber 图上 M.data.van 未定义，脚本用的是 A 图坐标），重试通过；非 PAGEERROR，疑为既有脚本脆弱 | GPT |
| 7（更新） | 低 | 瞬移后 250–370 ms 逻辑帧尖峰：perf_debug4 用 tools/tpspike.cjs（?prof，仅逻辑帧）在 (281,14)/(−300,200)/(600,−400) 瞬移后 3 帧均 4–14 ms，**无法复现**；尖峰应在渲染侧（区块流式挂载/首绘），未处理 | Hark |

daynight：开跑约 10 s 被沙箱 OOM 杀（同 #3/#10）；session3min / cyber 真人场景：本轮未跑。
回归：A plans/r5_regress.json 11/11，PAGEERROR 0；B plans/r6_cyber_smoke.json 7/7，PAGEERROR 0（missions 第一次失败、重试通过，见 #11）。

## perf_debug5 更新（同分支，详见 /workspace/work/patches/perf_debug5.md）
回归：A plans/r5_regress.json **11/11**、B plans/r6_cyber_smoke.json **7/7**，PAGEERROR 0（后台运行器 tools/bg.sh，shots/pd5/A、B）。

| # | 状态 | 问题 | 归属 |
|---|---|---|---|
| 7（处理） | 已摊开 | 瞬移尖峰定位：第 1 帧 r:sprobe 244 ms（探针面里同步编译 2 个新程序 + 上传 2.9 MB）+ detail.update 67 ms（bldgdetail 一整格同帧生成）。改：region.gate（新网格隐藏→compileAsync / 每帧 ≤1 个链接→再显示）+ bldgdetail 3 ms 分片（?oldtpwarm）。(−300,200) 最坏帧 sprobe+region 312→109 ms，新程序每帧 ≤1 | Hark |
| 3（更新） | 部分解决 | JS 堆 1027→803 MB：索拉纳港 World 桶 JS 数组构建后不丢（geom 175.7 MB + quad 35 MB），buildStreet 返回闭包保住 4 个桶（77 MB）→ 构建后清空（?keepjs）。剩余无单一大头（≤16 MB/项） | Hark |
| 12（新，已修） | 已修 | marina 浮码头材质在 envprog2 合并程序上再声明 `uniform float uTime` → 'uTime : redefinition'，瞬移到 (−300,200) 一带时程序无效（?oldmarinadecl） | Hark |
| 13（新，已修） | 已修 | GLSL smoothstep(edge0>edge1) 32 处（规范未定义）→ 1.0-smoothstep(lo,hi,x)，数学等价 | Hark |
| 14（新） | 待查 | A police 回归：第二、三段 crime(2,'test') 未让通缉生效（escalated 0 / 3000 帧，loseFrames 0），清通缉 200 帧后仍有 5 警车 6 警察 + 直升机；perf_debug3 同测正常（3 / 1921）。只跑逻辑帧，与渲染改动无关，疑随机/状态残留 | GPT |
| 15（新） | 低 | 探针远景 LOD（?oldsprobelod）只作用于远西大陆 34 个 region 区块，出生点/(−300,200) 无收益；剩余探针三角形来自 fabric/houses/downtown 城市级合并网格与实例集 | Hark |
