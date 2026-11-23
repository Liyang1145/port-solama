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
