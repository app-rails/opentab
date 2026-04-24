# Plan 写作指南

Plan 的唯一职责是回答 **怎么做 (how)** 和 **做完怎么验证 (verify)**。背景与取舍交给 spec，实现细节交给代码。

一份合格的 plan，实施者（人或 agent）按顺序执行就能交付。但读它的人**不需要**从 plan 学问题域（那是 spec 的事），也**不需要**从 plan 学实现（那是代码的事）。

---

## 使用场景

**什么时候写 plan**：

- 落地 spec 全部或部分工程改动（一个 feature、一次 phase、一次跨包重构）
- 多文件多步骤的改动 —— 需要显式顺序和验收分解
- 预计由 agent 执行、人类 review

**什么时候不写 plan**：

- 1~3 个文件、可在 1 小时内独立完成的散修
- 纯探索（先 spike 再决定是否写 plan）
- 没有 spec 支撑的"想到就改" —— 回去写 spec 或 brainstorm

## 这份 guideline 的作用

给 plan 作者（人或 agent）提供：plan 的结构、代码密度、验收节奏、commit 规范、agent 停手规则。

**何时加载**：写 plan 前通读一遍；落笔前对照 §十六 自查。Agent 被分派"写一个 plan"时必须先读本文件。

## 自检流程（plan 初稿完成后）

1. 对照 §十六「落笔前自查」逐条过一遍
2. 启动 subagent 调用 `/my-plan-review` 审核 plan 可行性（API/路径/依赖顺序核验）
3. 根据 review 报告修订 plan
4. 循环 2~3，终止条件：**report 无任何 risk（high/medium/low 全空）** 或 **已循环 3 轮**

**3 轮仍有 medium+ risk** → 不硬上。回头重审：plan 结构是否切错？范围是否过大？该拆子 plan？
**3 轮仍剩 low risk** → 可记录后放行，但在 plan 尾部列出"已知 low risk"让执行者知情。

---

## 一、内容边界

### 允许写

- 任务序列：改什么、按什么顺序
- 每个任务的文件范围、关键形状（接口 / 类型签名 / 关键 diff 锚点）
- 验收判据（自动化命令 + 手工剧本）
- 依赖、回滚、中断恢复策略

### 禁止写

- Spec 已经写过的背景、动机、决策 —— 用 `spec §X.Y` 引用，不要复述
- Spec 已经写过的字段语义、数据模型解释 —— 同上
- **完整的函数体 / 完整的文件内容 / JSX 树** —— 那是代码
- 决策再讨论 —— 发现 spec 不对，先改 spec 再改 plan，不在 plan 里推翻
- 教程级解释 —— plan 是指令，不是教学

**自检**：把 spec 和 plan 并读，有没有大段互相复述？把 plan 和交付代码并读，代码是不是只是 plan 的复制粘贴？有 → DRY 破了，瘦身。

---

## 二、读者与执行方式

**默认读者是 agent，人类是 review 者。** 不开第二种风格。

- 任务自包含、不依赖会话记忆
- 每个 Step 有机器可验的判据
- Review 可读性由 Task 级 `Design intent` / `Why` 一两行注解承担，不堆长段散文

如果 plan 明确只给人类读（一次性脚手架、演示用），在顶部注明；但这是例外。

---

## 三、结构

### 顶部 Header（硬规定 6 件）

```
# <特性名> Plan

Goal: <1~2 行>
Architecture: <3~5 行，不到形状不罢休；字段/函数名交给代码>
Tech Stack: <版本号关键库>
Related specs/plans: <链接 + §编号>
Scope:
  In:  <bullets>
  Not in: <bullets, 阻止 agent 自动扩范围>
```

> `Scope.Not in` 是遏制 agent 越权的主要抓手。凡是读者可能误以为"顺手也做"的事，明确列入 Not in。

### File Map（> 10 Task 的 plan 硬规定）

```
Created:  <paths>
Modified: <paths>
Deleted:  <paths>
Verified-unchanged: <paths>  # 可选，防止 agent 误改
```

File Map 的用途：开工前 scope 冻结；收尾时 orphan scan 对照；PR 描述直接复用。

### 主体骨架

```
## Prerequisites
  环境、工具、前置检查

## Group 1 — <阶段语义>
  outcome: 一句话
  - Task 1: ...
  - Task 2: ...

## Group 2 — ...

## Milestone M1 — ...（可选，见 §十三）

## Rollback（按外部副作用决定是否需要，见 §十四）

## Shipping gate
  整体完成的定义 / Handover Report 占位
```

- 按 Group 组织，Group 有语义边界。Task 编号可全局连号（Task 1..16）或 Group 前缀（F1..F5）—— 选一种，保持 plan 内一致，中途插入不 renumber。
- 超过 400 行加 TOC 锚。

---

## 四、Task 颗粒度

**一个 Task = 一个原子动作 + 一次提交 + 一组可判定的 DoD。**

硬条件：

- 改一个文件或一组语义内聚的文件
- 失败时可单独回滚
- DoD 机器或人可判

反模式：

- ❌ Task 0 "Preflight" 什么都不做 —— 合到 Prerequisites
- ❌ 一个 Task 跨多文件做语义不同的多类改动 —— 拆
- ❌ "Milestone checkpoint" 作为 Task —— 它是一次验收，不是动作
- ❌ "可以空 commit" —— 要么落产物，要么跳过

粒度应在 Group 内大致均匀；不均匀 → Group 切错。

---

## 五、Task 写法

### 结构

```
## Task X: <动词短句>

Files:
- Create/Modify/Delete: <path>

Design intent (可选, ≤ 3 行): 为什么这样切、关键约束

Steps:
- [ ] Step 1: <动词开头，做什么>
  Acceptance: <一行可执行判据>
- [ ] Step 2: ...
  Acceptance: ...

DoD: <Task 级完成线，1~2 句>
Commit: <type(scope): subject>
```

### 原则

- Step 用动词开头、祈使句。不写"应当"、"考虑"、"可能需要"。
- Step 的 Acceptance 是 DoD 的分解。DoD 覆盖整个 Task。
- **Automated 与 Manual 必须标清**。Manual 的 Step 显式标 `Manual:`，提醒 agent 暂停交给人类。
- 工具（`rg` / `jq` / `wrangler`）在 Prerequisites 声明。

---

## 六、TDD 节奏

**推荐**（非强制）用 Red/Green 二步写新增"行为"的 Task，让 AI 先尝试去写：

```
- [ ] Step N: 写 failing test for <行为>
  Acceptance: pnpm -F X test <name> → expect FAIL (reason: <一句>)
- [ ] Step N+1: 实现最小代码使 test 通过
  Acceptance: pnpm -F X test <name> → expect PASS
```

**Red 步的 Acceptance 若写了 "FAIL"，就必须明确 FAIL 原因**（"方法未实现"、"字段未添加"等），"写好了"不算判据。

**何时放弃 TDD 节奏**：

- 纯重命名 / 纯 import 调整 / 纯配置迁移 —— 无新行为
- 无法构造 failing test 的场景（如一次性 migration 生成）
- AI 判断 test-first 反而拖慢交付（如 UI 视觉类任务，测试不如人工 smoke 有效）

放弃时 Task 里显式注一行理由，便于 review 判断是否合理。

---

## 七、代码块的位置与限额

**这是 plan 最容易出问题的地方。** 很多 plan 把完整实现贴进来，于是 plan 变成了"代码副本" —— agent 执行时 OK，但 plan 会随代码漂移而立即过时。

### 允许贴的

- **接口 / 类型签名**（约束 API 形状，≤ 10 行）
- **关键 diff 锚点**（before/after 各 ≤ 5 行，标清"改的是这行")
- **伪代码 shape sketch**（3~15 行，顶部标注 `// pseudo-code` 或 `// shape only`；用于表达数据流 / 状态机 / 控制流形状，不追求可运行、不拼完整类型；目的是让 agent 按形状实现，而不是照抄）
- **一次性内联命令**（`grep` / `pnpm` / `wrangler`，用作 Acceptance）
- **依赖项 / package.json 片段**（加什么版本，结果确定）
- **新建 schema / migration SQL**（结果确定，不能模糊）

### 不允许贴的

- 完整函数体 —— 用 "输入输出 + acceptance 判据" 描述行为，让 agent 生成
- 完整文件内容 —— 用 "File Map + 接口签名 + DoD" 替代
- JSX 树 / UI 布局 —— 用可观察行为替代（"点击 X 后 toast 显示 Y"）
- i18n 文案字典 —— 那是数据资源，单独 PR

### 限额

- **单个 Task 的代码块合计 ≤ 80 行**。超了 → 你在写实现，而不是 plan。删到接口 + diff 锚点 + 伪代码 shape + 关键约束。
- **整份 plan 的代码占比 ≤ 50%**。超了 → 把实现交给 agent 判断，plan 只保留 what / acceptance / 形状约束（签名 + diff 锚点 + 伪代码 sketch）。

量测方法：代码块 = ` ``` ` 围起的部分（含 SQL / JSON / 命令）；占比按行数计。

### 判断口诀

> 代码放 plan 里，是为了**约束**，还是为了**代替实施者思考**？
> 约束 → 留；代替思考 → 删。

---

## 八、Commit message

Agent plan **必须**在需要 commit 的 Step 写明精确 commit message。

- 格式：Conventional Commits，`type(scope): subject`
- `scope` 对应 Group 或模块名
- 单行 subject；body 通常省略
- 实施者在实际变更与预期严重不符时可调整；默认路径就是字面文案

反模式：

- ❌ 一个 Task 切成多个 commit（破坏 bisect 粒度）
- ❌ commit body 里塞 HEREDOC 多段说明（该进代码注释或 PR 描述）
- ❌ 让 agent 自拟（agent 缺乏 repo 风格记忆，会漂移）

---

## 九、验收命令

**默认内嵌**。Step 的 Acceptance 写一行命令 + 预期：

```
Acceptance:
  - pnpm -F saas-edge-template test brand-logo → 4/4 pass
  - grep -r '@/blocks/auth/logo"' apps/saas-edge-template/ → no match
```

内嵌的代价是 plan 和工具链路径绑定；收益是 agent 自包含，不需要跳文件。这个权衡对 agent-first 的 plan 是对的。

### 抽成脚本的触发条件

满足其一才抽：

- 5 个以上 Task 引用同一命令序列
- 命令逻辑超过 3 行（需要 if / loop）
- 命令会被 CI 工作流复用

否则：不抽，内嵌。脚本碎片化的维护成本高于路径绑定的成本。

---

## 十、Agent 执行边界

Plan 的直接执行者常是 agent。下列动作 agent 不做，必须交给人类：

- **视觉 / UI 判断** —— 不启动 dev server 做 Chrome 视觉确认；视觉剧本标 `Manual:`
- **Scope 扩展** —— 发现 plan 有缺或描述与现实不符，停、告知；不就地扩大改动
- **反复试错安装 / 网络重试** —— 失败即停
- **决策 fallback** —— 遇到 plan 未覆盖的边界，停，不猜

Plan 作者有义务在 Task 内**显式标注**需要人类介入或需要停手的 Step。下面是四类典型停手指令（从历史 plan 提炼）：

### 类型 1：验收失败时停手（最常见）

```
- [ ] Step 3: 迁移所有 consumer 到新 import 路径
  Acceptance: grep -r '@/blocks/auth/logo"' apps/saas-edge-template/ → no match
  On failure: 命中 > 0 → STOP；说明 plan 遗漏了 consumer。回报请求者决定扩 scope 或拆 Task，不自行补。
```

### 类型 2：遇到未预期状态停手

```
- [ ] Step 2: 核对 migration 只包含新增的两个字段
  Acceptance: grep -cE '^\s*ALTER TABLE' migrations/00xx_*.sql → 1
  On unexpected DDL: STOP；可能有人并发修改了 schema，交给人类澄清再继续。
```

### 类型 3：超出 plan 边界（scope 越界防御）

```
> Pre-existing issue NOT addressed: sign-up 的 social callback 忽略 ?redirectTo=（见 F4 DoD）。
> 本 plan 不修复；若需要，开 follow-up。执行中不得顺手改。
```

### 类型 4：视觉 / 决策类任务交接

```
- [ ] Step 7 (Manual, human only): 在新 Chrome profile 打开 /zh/auth/sign-in
  Note: Agent 不启动 dev server、不做视觉判断。
  Acceptance:
    - 左上 logo 渲染为 SVG + brand.name
    - DevTools 无 hydration warning
  Handover: agent 在报告里提醒 user 执行本步，不代跑。
```

### 共性格式

每个停手指令包含三件：**触发条件**（什么命令/信号）、**动作**（STOP / 交接 / 记录）、**去向**（回报谁、降级路径在哪）。三件缺一，agent 会自行发挥。

---

## 十一、Status 标注与中断恢复

Task 级可选 Status，便于多轮执行：

- `Status: DONE (YYYY-MM-DD)` —— 跳过
- `Status: IN-PROGRESS` —— 从最近未勾选 Step 继续
- `Status: BLOCKED — <reason>` —— 待人工解除

Step 级进度用 `- [ ]` / `- [x]` 自然记录。中断后读 plan 即可恢复，不需要外部状态。

Status 标注**不替代** git 历史。标 DONE 必须有对应 commit。

---

## 十二、引用 Spec

- 用稳定编号：`spec §2.4`、`spec 决策 #17`
- **不复述引用内容**。若必须（如验收判据里的字段上限），复制一句并标 `(spec §X.Y)`，让读者知道源头
- 引用点多 → spec 没定死，回去补 spec，不在 plan 里扩写

---

## 十三、Milestone Acceptance 与 Handover Report

### 什么时候需要

- Spec 划分了 Phase / Milestone
- 某一批 Task 合起来才构成一个用户可感知的能力
- 存在外部交付节点（staging、灰度、发版）

### 三要素（与 spec / Task 的分工）

| 层级 | 回答什么 |
|------|----------|
| Spec 验收 | 做到什么算对 |
| Milestone Acceptance | 怎么证明做到了 |
| Task DoD | 这一步改对了没 |

**不要在 plan 里重写 spec 的验收标准** —— 只引用 + 给手段 + 给通过线。

### 推荐格式

```
## Milestone M1 — Phase 1 可交付

对应 spec §7.1。

Automated gates:
- pnpm -w typecheck → 6/6
- pnpm -w test → 7/7
- pnpm -w build → 4/4
- scripts/check-no-orphan.sh → 退出码 0

Manual:
- 新 Chrome profile 走 Scenario A (~5min)
- 两台真机走 Scenario B (~10min)

Pass bar: 以上全绿 + 手工剧本证据存档 + 无 P0/P1 未闭合
```

### Handover Report（大 plan 收尾推荐）

最后一个 Task 产出结构化报告回给请求者：

- Gates 结果表
- 已落地 commits 列表（含 hash / subject）
- File-level deltas（new / modified / deleted）
- 下一步 user action（通常是视觉 smoke / 生产冒烟）

### 约束

- Milestone / Handover 章节**不占 Task 编号**、不带单独 commit
- 失败不回滚，回到对应 Task 修复后重跑

---

## 十四、Rollback 分级

按外部副作用决定 Rollback 章节深度：

| Plan 类型 | Rollback 写法 |
|-----------|---------------|
| 纯代码（无 DB / 无 secret / 无三方调用） | 可省略；默认 `git reset --hard <base>` |
| 有 DB migration | 按 Group 列 migration 回滚步骤（反向 SQL 或 `drizzle migrate down`） |
| 有外部资源（secret、三方账号、DNS） | 按 Task 列清理步骤，每个资源一条明确的 `rm` / `revoke` 指令 |

**幂等性标注**：有外部副作用的 Task 显式标 `(idempotent)` 或 `(non-idempotent)`。

**清单**：涉及 `wrangler d1 create` / `wrangler secret put` / 发邮件 / 调三方 API 的 Task 必须出现在 Rollback 清单里，`git reset` 不能代替。

---

## 十五、长度节奏

- 单 Task 代码块合计 > 30 行 → 贴了实现，删到签名 + diff 锚点
- 单 Task 除代码块外 > 40 行 → 拆 Task 或证据太冗
- 单 Group > 15 Task → Group 切错
- 整份 plan > 800 行 → 抽子 plan（按 Group 拆文件）

---

## 十六、落笔前自查

1. 顶部 Header 6 件齐了吗？`Scope.Not in` 有没有预防 agent 越权？
2. File Map 对 > 10 Task 的 plan 是否到位？
3. 每个 Task 有 DoD 吗？每个 Step 有 Acceptance 吗？
4. **Task 代码块合计 ≤ 80 行吗？整份 plan 代码占比 ≤ 50% 吗？超了 → 哪段在写实现？伪代码 shape 有标注 `pseudo-code` / `shape only` 吗？**
5. 带新行为的 Task 是否用 Red/Green（或显式注明放弃理由）？Red 步标了 FAIL 原因吗？
6. 每个需要 commit 的 Step 都有字面 commit message 吗？
7. Acceptance 是一行可执行命令（或 Manual 剧本）吗？
8. Agent 不做的事（视觉、scope 扩展）是否显式标 `Manual:` 或停手指令（§十 四类之一）？
9. 外部副作用 Task 是否列入 Rollback 并标幂等？
10. Milestone / Handover 独立成节，没占 Task 编号？
11. Plan 和 spec 并读，有无大段互相复述？plan 和代码并读，plan 是不是代码副本？

**通过上述自查后**：调用 `/my-plan-review` subagent 做可行性 review；按其报告修订 plan；循环直至无 risk 或达 3 轮上限（见顶部「自检流程」）。
