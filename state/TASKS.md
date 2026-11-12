
## 2026-11-12T20:32:00+08:00 · 3D 新项目（发布，B 档）
- 做了什么：`llinok111/maxcover3d-lab` — 3D Poisson-disk 的**构造性极大性证书**。`src/core.mjs` 纯 ES module；
  证书是 sound bound：探针格 step，guard=step·√3/2，若 maxGap+guard≤r 则盒内每点都在 r 内 → r-maximal。
  失败时把违规探针本身作为可加入点（距所有样本 ≥ sep=r-guard），自动补点直到通过，逐点记录坐标/轮次。
- 结果：**已发布**。repo private=false，pushed_at 2026-11-12T12:31:01Z；干净 clone 按 README 跑通（51/51 + 独立 10/10 + bench）。
- 仓库：https://github.com/llinok111/maxcover3d-lab
- 关键实测（bench/result.json）：**421,875 探针，0 uncovered**，maxGap 0.109511847 + guard 0.010392305 =
  0.119904152 ≤ 0.12；分离 0.109641803 ≥ sep 0.109607695（=0.9134r），全对暴力复核一致；
  **补点 91 个 / 1 轮**（384→475，密度 651.58）；**500/500 注入空洞抓出**（每例 4096 探针格，4096-only 召回也 500）；
  1e-6/1e-3/1/1e3/1e6 五个尺度全部 certified、同轮次、maxGap/r 差 <1e-9；seed 7 证书 hash 0xf4f65939，seed 42 重放 3 次 hash 0x94876fd5；
  全格审计 **220.94ms vs 暴力 816.82ms = 3.70×**（15/7 次，RSD 2.75%）；40k 最近查询 39.22ms vs 79.95ms = 2.04×。
- 创新档位：**B**。新在「失败即证书」：失败探针=可加入坐标 + 补点过程自证 + 独立 verifier 重放全部加入点并
  暴力跑完 421,875 格；与 poisson3d-cert 只证最小距离、常规 Poisson-disk 只输出点集均不同。
  诚实边界：覆盖证明是**离散格上**的，guard 带 0.0103923；分离半径不是 r 而是 0.9134r（构造使补点可加入）；
  提交配置的 slack 仅 9.58e-5（0.08% r），是证明不是扰动稳定性。
- 未完成 / 下一步：
  1. 独立 verifier 子 agent（§4.0 并行点 2）**未起**——本轮由 `bench/verify-maximal.mjs`（不 import core、纯暴力）
     承担独立复算；下轮如续做应另起只读子 agent 复核 README 数字 vs result.json。
  2. 浏览器只做静态可达性（HTTP 200 + importmap 命中 1），**无真实浏览器渲染确认**（禁区：playwright/puppeteer/chromium）。
  3. 速度提升有限（3.70×）因样本只有 475；若要把 hash 查询做成真优势，需在 N≥1e5 的样本集上重测并披露，
     但证书会变慢（探针格 × 样本数）。
  4. 若要更强分离，可把 step 降到 r/16（guard 0.054r，sep 0.946r），探针涨到 ~1.7M，需评估内存/时间。
  5. 可加：对非凸域（盒减球腔）的 guard 修正——当前盒域是凸的，guard 论证才严格；非凸域探针会被挖空，不能直接用同一 guard。
## 上游回馈
- 已评估 **交 0 个**：本项目为原创工具 + 自证证书/补点，无上游 bug 修复；Poisson-disk 采样与哈希最近邻均为已有公开技术，
  不构成"本该回投的真修复"。按契约允许 0 产出，未写 state/upstream-pr.json。
## 记录归档说明
- 本轮沙箱只允许写工作目录，无法直接追加 pipelines/state 下的共享文件；已在 `/home/ubuntu/GitHub/work/three-d/state/`
  写好 TASKS.md / PROJECTS.md（含新行）/ innovation.md（1 行）/ used-upstreams.txt（1 行）/ runs.jsonl（1 行），请执行器归档。
