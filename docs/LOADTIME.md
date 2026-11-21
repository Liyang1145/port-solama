# loadtime：首次加载提速（分支 agent/hark/loadtime）

用户反馈：「我电脑加载这个游戏要二十分钟」。目标：首次加载到能玩 < 1 分钟，画面不退步。

## 结论先说
- 瓶颈在**着色器**，不在资源和程序化生成：沙盒里资源下载/解码 + 两张地图的全部生成合计约 **10 秒**（A 9.2 s、B 10.4 s 到 Game 构造完），之后全部是 GPU 首帧（着色器编译/JIT）。
- 原因：场景里常驻 **19 盏点光 + 2 盏聚光**（10 路灯、6 霓虹补光、枪口闪光、2 警灯、车灯、警用探照灯；白天强度为 0 但仍计入着色器）。three.js 把点光/聚光循环**完全展开**，每个受光材质的片元着色器里塞了约 23 份 BRDF（19+2+2 方向光）。A 图 122 个程序、B 图 127 个，全部这么大。Windows Chrome 走 ANGLE→D3D11，HLSL 编译（FXC）对这种展开代码极慢，且是逐个串行编译 → 这正是“二十分钟”的来源（推断，见“未验证项”）。
- 修法：光照循环改为不展开（数学完全相同）、名字不同但代码相同的材质共用程序、首帧前用 `KHR_parallel_shader_compile` 并行预编译（带进度条）。

## 改了什么（文件）
1. **src/loadfast.js（新）**
   - `rolledLights()`：启动时改写 `THREE.ShaderChunk.lights_fragment_begin`：当没有点光阴影（本游戏恒成立）时，点光循环保持真正的 `for` 循环（不再展开成 19 份）；聚光同理（无阴影、无投影贴图时）。原展开版本原样保留在 `#else` 分支，条件不满足时自动回退。另加 `color==0` 时 `continue`（白天路灯、闲置闪光等暗光源贡献恰为 0，跳过即与原结果一致）。
   - `precompile(renderer, scene, camera, {rt, all, onProgress})`：对场景材质调用 `renderer.compile`，然后用 `isReady()`（有 KHR_parallel_shader_compile 时非阻塞轮询 COMPLETION_STATUS）等全部程序链接完成，期间更新加载条「正在准备画面 n / N」。**关键点**：编译时把渲染目标设为后期链的 `composer.renderTarget1`——场景实际画进这张 HalfFloat RT（线性、不做色调映射），对着画布编译会生成另一套永远用不上的变体（第一版就踩了这个坑：程序数 122→188）。`all:true` 会把当前隐藏的对象（远景 LOD、流式分块、夜间道具）也编进去，灯光除外（灯光数必须与真实渲染一致）。
2. **src/main.js**
   - 分段计时：`window.__LT`（marks：html+bundle、textures、glb、font+simplifier、env+mats+water、buildCity、world.build+stream、trees+region+veg+nature、props+furniture+street+neon、post+probes、game、precompile、probe、precompile(envmap variants)、ready、first frame），首帧后 `console.log('[loadtime] …')`。
   - 启动顺序：Game 构造后 → `precompile(可见对象)` → 反射探针 `probe.update()`（会给建筑材质挂上 envMap，产生新变体）→ 再 `precompile` 一次补 envMap 变体 → ready。首帧之后，若浏览器支持并行编译，1.5 s 后在后台把隐藏对象也预编译（不阻塞；不支持就不做，保持原来“出现时再编”的行为）。
   - A/B 开关：`?unrolled`（恢复展开循环）、`?noprecompile`、`?nodedup`（见下）。
   - `W.firstFrame()` 调试钩子（渲染一帧 + readPixels，返回 LT）。
3. **src/mats.js（共享文件，改动 3 行，只在 `prep()` 里）**：`prep(mat, key, patch)` 在 **没有 patch** 时 shader 文本与标准材质完全一样，但每个名字（'roof'、'bark'、'metal'、'whitep'…约 36 处）都成了独立的 customProgramCacheKey → 一模一样的程序重复编译。现在无 patch 时统一用 `'std'`，uniform 仍是每个材质自己的。有 patch 的（building、road、neon、vcol、SHOPROOM 等）**完全不动**。`?nodedup` 可恢复旧行为。**冲突点**：别的线若改 `prep()` 函数体需手工合并这 3 行；SHOPROOM 段落未碰。
4. **tools/loadtime.cjs（新）**：计时工具。`node tools/loadtime.cjs out.json "map=gta" [dir=dist_single]`，走真实启动路径（非 snap），等首帧，再测 frame2（含 readPixels，等 GPU 真正做完）、frame3（稳态），并导出程序清单（名称/源码长度/defines）。
5. **tools/regress_fresh.cjs**：支持 `CHROME_BIN`（沙盒 22:43 重启后默认 chromium 缺失），一行。

未改：people.js、mats.js 的 SHOPROOM、src/maps/cyber/street2.js / viaduct.js、地标、玩法文件。资源打包（tools/single.cjs）未改，单文件仍 38.9 MB。

## 计时（沙盒：ARM CPU + SwiftShader 软件 GPU，960×540，本地 http 服务单文件 dist_single）
单位 ms，各段为增量；「到 ready」= JS 侧启动完成（加载条走完、可点「进入城市」）；frame2 = 首帧之后再渲染一帧并 readPixels，等 GPU 把首帧积压的编译/JIT 全部做完。

| 段 | A 前 | A 后 | B 前 | B 后 |
|---|---:|---:|---:|---:|
| html+bundle（下载/解析 40 MB 单文件） | 1104 | 962 | 862 | 977 |
| 纹理解码 | 289 | 133 | 157 | 168 |
| GLB（17 个角色 + 车 + 道具，meshopt） | 3610 | 3762 | 3805 | 3959 |
| env+mats+water | 205 | 216 | 13 | 14 |
| buildCity | 786 | 754 | 1045 | 1035 |
| world.build+stream | 85 | 78 | 322 | 306 |
| 行道树+区域+植被(+自然) | 866 | 840 | 1074 | 1112 |
| 道具+街具+招牌(+霓虹) | 943 | 857 | 1222 | 1142 |
| post | 87 | 28 | 66 | 33 |
| Game 构造 | 1237 | 1290 | 1819 | 1500 |
| 预编译（可见） | — | 1167 | — | 3848 |
| 反射探针首渲染（同步编译） | **19294** | **8243** | **16483** | **5783** |
| 预编译（envMap 变体） | — | 783 | — | 808 |
| **到 ready** | **28.5 s** | **19.1 s** | **26.9 s** | **20.7 s** |
| 首帧回调 | 617 | 629 | 625 | 757 |
| **frame2（GPU 做完首帧积压）** | **333 s** | **226 s**（另一次 194 s） | **238 s** | **176 s** |
| frame3 稳态 | — | 27 s | — | 24 s |
| 程序数 | 122 | 108 | 127 | 115 |
| **整体墙钟（打开→首帧真正画完）** | **362 s** | **246 s**（213 s） | **266 s** | **198 s** |

「A 前」= 改动前代码（只加了计时），「B 前」= 新代码加 `?unrolled&noprecompile&nodedup` 三个开关回到旧行为。沙盒多代理共享 CPU，单次测量有 ±15% 抖动。

解读：
- 程序化生成（737 运河地块、1468 集装箱等）在沙盒里合计只有 ~3–4 s，不是瓶颈，没有动（改分帧生成收益小、风险大）。
- SwiftShader 在**首次绘制**时按管线状态 JIT 编译，与 D3D 的耗时结构不同：它把成本记在 frame2，且不支持 KHR_parallel_shader_compile（`parallel:false`），所以沙盒里只看到 ~30–40 % 的下降。真 GPU 上编译发生在 link 时，并行预编译会把它挪到加载条阶段并分到多个线程。

## 对 Windows / 真 GPU 的预估（未在真机验证）
- 每个受光片元着色器的光照代码：约 23 份 BRDF → 4 份（1 点光循环 + 1 聚光循环 + 2 方向光阴影）。FXC 时间对代码量明显超线性，单程序预计快 4–6 倍以上；程序数 122→108（A）/127→115（B）；再加并行编译（Chrome 在 Windows 上用多线程编译）。
- 粗估：原 20 分钟 ≈ 120 程序 × ~10 s；改后 ≈ 108 × 1–2 s ÷ 并行度 2–4 → **约 30–90 秒**，加上下载与 ~5–10 s 的 JS 启动。能否 < 1 分钟取决于 FXC 是否把 `for` 循环再次展开（ANGLE 对含 `continue` 的循环通常输出真正的 `[loop]`，未核实）。
- Chrome 的 GPU 着色器磁盘缓存：程序变小后更容易被缓存，**第二次打开应接近即开**。

## 未验证项
1. 真 Windows/D3D11 的实际编译时间（沙盒无 GPU）。请在 Windows Chrome 打开后按 F12，看控制台 `[loadtime]` 一行（各段 ms + 程序数），或输入 `__LT`。
2. 后台“隐藏对象全量预编译”只在有 KHR_parallel_shader_compile 时运行，沙盒不支持，未实测其对游玩帧率的影响。
3. 下载：单文件 38.9 MB 未压缩（17 个角色 GLB 已是 meshopt+WebP，base64 占 ~32 MB）。慢网络下下载本身可能要数十秒；这条线没改打包。若要再降，下一步是角色按需加载（主角+警察先加载，其余首帧后），但这会碰 people.js/game.js，留给 GPT 决定。

## 回归与截图
- 回归 A `plans/r5_regress.json`：11 项，**0 PAGEERROR**；`missions` 一项 ERR（读坐标 undefined）= 已知的测试写死坐标问题，与本线无关。
- 回归 B `plans/r6_cyber_smoke.json`：7 项全过，**0 PAGEERROR**。
- 截图（同机位、同参数 `hour=15|20.6&lowshadow&probe=0`，960×540，左=改前 右=改后）：
  - /workspace/work/patches/loadtime_shots/a_day_before_after.jpg、a_night_before_after.jpg
  - 像素对比：白天平均差 0.30/255、夜间 0.22/255，差 >8 的像素 0.4% / 0.2%（动画/噪点），肉眼无差别；夜间路灯光池正常。
  - 同一截图任务里首张图从开始渲染到读回：改前 **338 s**，改后 **177 s**（-48%）。
  - B 图截图：改后那次 SwiftShader 进程被系统 Killed（共享内存不足），按规范跳过；B 以回归 0 PAGEERROR 为准。

## 给 GPT 的合并说明
- 分支 `agent/hark/loadtime`，基于 main 29565d1，只动 src/loadfast.js(新)、src/main.js、src/mats.js(prep 3 行)、tools/loadtime.cjs(新)、tools/regress_fresh.cjs(1 行)。
- 与其他线的冲突点：main.js 的 boot()（别的线若改 boot 顺序需手工合并：我的改动是若干 `mark(...)` 和 Game 构造后的 precompile 段、首帧回调）；mats.js `prep()`。
- 需要恢复旧行为排查问题时：`?unrolled`、`?noprecompile`、`?nodedup`。
- 若以后给点光/聚光开阴影，`rolledLights` 会自动走原展开分支（条件编译），无需改代码。
