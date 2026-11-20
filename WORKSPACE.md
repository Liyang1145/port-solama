# 写实分支（real/）——独立工作区
2026-11-20 20:04 用户：「现在有两个在跑，分支出去了。你把工作区独立开来。文件。不要打架」
- 本目录 real/ 由「给我做一个GTA6」项目（0a960a04）的写实 GTA6 线独占：白天夜晚都写实，**不做赛博朋克**。
- 起点：v4.3（GitHub 61dadb4 快照）。版本号从 r5.0 起，避免和 v3/ 的 v4.x 混淆。
- 锁：real/RUNNING.lock。发布副本：real/release/。截图：real/shots/。
- 不读写 ../v3/（归「索拉纳港 Port Solana 开放世界」项目 7e768f1c，赛博朋克夜景线）、不碰 v3/RUNNING.lock、不发布到 Page 96467e5f（那是 v3 线在用的页面）。
- GitHub：用户 2026-11-20 20:24「保持github同步。我马上派gpt来协助后端开发」——每轮验证通过并发布后，运行 `bash real/sync_github.sh "r<版本>: 摘要"`（shell credentials provider=github）同步到 Liyang1145/port-solama main。只同步 real/，绝不同步 v3/。外部 agent（GPT）按 CONTRIBUTING.md 走 agent/* 分支 + PR；开工前先 git pull 合并他们已进 main 的改动，PR 验证通过（build + 回归）再合并。
- 对接帖：https://github.com/Liyang1145/port-solama/issues/1（Hark=渲染/地图/美术；GPT=后端逻辑：game/mission(s)/police/存档/经济/事件/测试）。每轮读 issue #1 新留言并回复。
