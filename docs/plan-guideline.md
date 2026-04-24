# Plan 写作指南

Plan 的唯一职责是回答 **怎么做 (how)** 和 **做完怎么验证 (verify)**。背景和取舍交给 spec。

一份合格的 plan，实施者（人或 agent）按顺序执行就能交付。但读它的人**不需要**再从 plan 学一遍问题域 —— 那是 spec 的事。

---

## 一、内容边界

### 允许写

- 任务序列：改什么、按什么顺序
- 每个任务的文件范围 & 关键动作
- 验收脚本（自动化命令 + 手工剧本）
- 依赖、回滚、中断恢复策略

### 禁止写

- Spec 已经写过的背景、动机、决策理由 —— 用引用 `spec §X.Y` 代替，**不要复述**
- Spec 已经写过的数据模型解释、字段语义 —— 同上
- 决策再讨论 —— 实施时发现 spec 不对，先改 spec，再重写 plan，不在 plan 里推翻
- 教程级代码解释 —— plan 是指令，不是教学

自检：把 spec 和 plan 并列读，有没有大段互相复述？有 → 违反 DRY，plan 该瘦身成引用。

---

## 二、定位与读者

开头第一句必须交代**读者是谁、执行方式是什么**，二选一，不要模糊：

- 给人工程师：可以写"为什么选这个顺序"，允许少量决策上下文
- 给 agent：纯指令式，任务自包含、不依赖会话记忆、每步有机器可验的判据

两种读者的 plan **不应混写**。风格不同，精度要求不同。

---

## 三、结构

标准骨架：

```
# <特性名> Plan
目标 / 对应 spec / 读者 & 执行方式 (10 行以内)

## Prerequisites
  环境、工具、前置检查

## Group 1 — <阶段语义>
  outcome: 一句话
  - Task 1.1 ...
  - Task 1.2 ...

## Group 2 — ...

## Rollback
  按 Group 维度给出回滚语义

## Shipping gate
  整体完成的定义
```

- **按 Group 组织，Group 内按 Task 组织**。Group 有语义边界（"Phase 0 清理"、"协议包"、"Web 编辑"）。
- **Task 编号用 `<Group>.<Seq>` 形式**（Task 3.2），不要全局连号。后续插入 Task 不破坏引用。
- **顶部给 TOC**。超过 400 行必须有目录锚。

---

## 四、Task 颗粒度

**一个 Task = 一个原子动作 + 一次提交 + 一组可判定的验收**。

粒度判据：

- 改一个文件或一组语义内聚的文件
- 验收能在 15 分钟内跑完
- 失败时可以单独回滚

反模式：

- ❌ Task 0 "Preflight" 什么都不做 —— 合到 Prerequisites
- ❌ 一个 Task 跨 6 个文件做语义不同的多类改动 —— 拆
- ❌ "Milestone checkpoint" 作为 Task —— 它是一次验收，不是动作，应该并入前一个 Task 的 Acceptance
- ❌ "可以空 commit" —— 要么落产物，要么跳过，不给噪音

粒度应在 **Group 内大致均匀**。均匀不了，说明边界画错了。

---

## 五、Task 写法

每个 Task 固定四段：

```
### Task X.Y — <动词短句>

Files: <受影响文件，就近列出>
Action: <做什么，指令式，3~6 行>
Acceptance:
  Automated:
    - <一条命令 或 一个脚本 调用，每条判据单独一行>
  Manual:
    - <按需，人工剧本>
```

原则：

- **Action 用祈使句**："Replace X with Y"、"Add dep Z"。不写"应当"、"考虑"、"可能需要"。
- **Automated 和 Manual 分开列**。不要混写 `unit test pass + 打开 Chrome 看一眼` 在同一条里。
- **Acceptance 判据必须可执行**。"代码正确"、"行为合理" 不算判据；"`pnpm -F X test` 退出码 0" 才算。
- **命令行工具要在 Prerequisites 声明**。用到 `rg` / `jq` / `curl` / `wrangler`，Preflight 得列它们。

---

## 六、Commit message 的态度

**不要硬编码 commit message**。

- Commit 规范归 commitlint / 仓库约定管。plan 规定字面等于越权，也剥夺了实施者根据实际变更调整 scope 的空间。
- Plan 里至多写约束："使用 Conventional Commits、scope 对应 Group 名"，不写精确文案。
- 如果团队就是要求精确文案，那应当放在 `CONTRIBUTING.md` 或提交钩子里，不是 plan 每个 Task 里各抄一份。

---

## 七、验收命令的落地位置

Plan 里的自动化判据倾向于**引用脚本而非内嵌命令**。

### 反例

```
Acceptance:
  - grep -c "FOREIGN KEY" apps/cloud/drizzle/migrations/0001_*.sql 返回 0
  - rg -n "@opentab/(api|db)" packages/shared/src 无匹配
  - curl http://localhost:5173/api/health | jq '.protocolVersion' 输出 1.0.0
```

Plan 和工具链、路径绑死，脚本变化就得改 plan。

### 正例

```
Acceptance:
  - scripts/check-no-fk.sh 退出码 0
  - scripts/check-no-legacy-imports.sh 退出码 0
  - scripts/smoke-health.sh 退出码 0
```

脚本放仓库，plan 引用。好处：脚本本身可版本化、可 CI 化、可复用。

**例外**：单次性的 grep 断言（全仓库只出现一次）可以内嵌，避免脚本碎片化。

---

## 八、引用 Spec 的规矩

- 引用用稳定编号：`spec §2.4`、`spec 决策 #17`
- **不复述引用内容**。若必须复述（例如验收判据里的字段上限），就从 spec 复制**一句**并标注 `(spec §X.Y)`，让读者知道源头。
- 引用多了说明 spec 没定死 —— 回去补 spec，不是在 plan 里扩写。

---

## 九、阶段验收（Milestone Acceptance）

Task 级 Acceptance 解决"这一步做对了没"。但多数 plan 需要**阶段 / 里程碑级验收**来解决"这一批做到一起是不是真的交付了 spec 要求的行为"。

**什么时候需要阶段验收**：

- Spec 划分了 Phase / Milestone
- 某一批 task 连起来才构成一个用户可感知的能力
- 存在外部交付节点（staging 上线、灰度开关、发版）

### 阶段验收必须写到的三要素

和 spec 验收一致，但**下沉到可执行层**：

1. **验收标准（对应 spec 哪条）** — 明确引用 spec 里该 Phase 的验收条目，不重新编写
2. **如何验收（手段 + 脚本 / 剧本）** — 自动化脚本 + 手工剧本，列到可复现的粒度
3. **通过条件** — 机器可判或操作者可勾的判据，留下可归档的证据

### 和 spec 验收的分工

| 层级 | 回答什么 | 举例 |
|------|----------|------|
| Spec 验收 | 做到什么算对 | "两台设备改同一工作区名，应收敛到后到值" |
| Plan 阶段验收 | 怎么证明做到了 | "跑 scripts/scenario-b.sh，两台真机完成剧本，输出 diff 为空" |
| Plan Task Acceptance | 这一步改对了没 | "`pnpm -F cloud test` 退出码 0；文件 X 含 import Y" |

**不要在 plan 里重写 spec 的验收标准**。只引用 + 给手段 + 给通过线。

### 推荐格式

```
## Milestone M1 — Phase 1 可交付

对应 spec §7.1 验收标准。

How:
- Automated:
  - scripts/scenario-a.sh 退出码 0（单设备上传链路）
  - scripts/scenario-b.sh 退出码 0（双设备收敛）
  - scripts/scenario-c.sh 退出码 0（吊销链路）
  - scripts/check-compat-window.sh 退出码 0（兼容窗口一致性）
- Manual:
  - 在新 Chrome profile 手动走一遍 Scenario A 全流程（约 5 分钟）
  - 在两台真机走 Scenario B（约 10 分钟）

Pass bar:
- 四个自动化脚本全绿
- 两个手工剧本记录到 docs/.../acceptance/M1/ 目录
- CI 最近 3 次在 main 分支全绿
- 无 P0/P1 缺陷未闭合
```

### 阶段验收不是 task

- 不占 Task 编号，单独成节
- 不带 commit message
- 失败不回滚，而是回到相关 Task 修复后重跑

---

## 十、Rollback 和中断恢复

54 个 Task 的 plan 配一句 `git reset --hard` 是敷衍。

要给：

- **按 Group 的回滚语义**：在 Group N 中断，需要回退哪些 Task？数据侧有无残留（schema 已改、外部资源已创建）？
- **外部副作用清单**：Task 涉及 `wrangler d1 create`、`secret put`、发邮件、调三方 API —— 这些不是 `git reset` 能回滚的，必须单列清理步骤。
- **可重入性标注**：Task 如果重跑是幂等的（多数自动化任务），显式标注 `(idempotent)`。

---

## 十一、长度

- 单个 Group 超过 15 个 Task，先问"是不是 Group 切错了"
- 整份 plan 超过 800 行，抽子 plan（按 Group 拆文件）
- 单 Task 的 Action + Acceptance 合计超过 40 行，拆 Task

---

## 十二、落笔前自查

1. Plan 里的每段话，是不是能在 spec 里找到对应的 what/why？找不到 → plan 里长出了不该有的决策，回 spec 补。
2. 每个 Task 的 Acceptance 是不是都能被机器判定（至少自动化那一列）？
3. Task 粒度在 Group 内是否可比？
4. Spec 里每个 Phase / Milestone 是否都有对应的阶段验收章节？阶段验收三要素（引用 spec 标准、手段、通过条件）齐全吗？
5. Plan 里有没有在重写 spec 的验收标准？有 → 改成引用。
6. 有没有把阶段验收硬塞成 task（带编号 + commit）？有 → 抽出来单独成节。
7. 有没有被硬编码的 commit message？删掉，只保留规范约束。
8. Rollback 是不是按 Group 给了语义？只有一句全量 reset → 不合格。
9. 工具链（`rg` / `jq` / `wrangler` / `curl`）是否都在 Prerequisites 声明？
