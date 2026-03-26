# Milestone: idea-8 / M3 — 同步健壮性

Parent Idea: [idea-8](../idea/20260326-opentab-manager-idea-8.md)
Status: TODO

## 目标

同步在各种网络条件下可靠工作，用户有清晰的状态感知。

## 任务

- [ ] 同步状态指示器 UI（状态栏显示：已同步 / 同步中 / 离线 / 同步失败）
- [ ] 离线模式：网络断开时正常本地操作，变更记入 changeLog
- [ ] 恢复同步：网络恢复后自动 push 积累的 changeLog
- [ ] 重试策略：同步失败时指数退避重试（1s, 2s, 4s, 最大 30s）
- [ ] 同步冲突提示：当 last-write-wins 覆盖了本地修改时，toast 通知用户
- [ ] 手动同步按钮（Settings 中，强制立即 push + pull）
- [ ] 同步日志（Settings 中可查看最近 20 条同步记录）

## 验收标准

- 断网操作 5+ 次后重连，所有变更正确同步
- 状态指示器实时反映同步状态
- 同步失败后自动重试，不需用户手动操作
- 两台设备同时修改同一 workspace 名称时，一台看到覆盖通知
