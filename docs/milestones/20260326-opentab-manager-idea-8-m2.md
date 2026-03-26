# Milestone: idea-8 / M2 — 数据同步引擎

Parent Idea: [idea-8](../idea/20260326-opentab-manager-idea-8.md)
Status: TODO

## 目标

注册账号的 workspace + 集合 + tab 数据可跨设备同步。

## 任务

- [ ] 后端 PostgreSQL schema（Workspace、TabCollection、CollectionTab 表）
- [ ] 同步 API endpoints
  - POST /api/sync/push — 上传本地变更
  - GET /api/sync/pull — 拉取远端变更
  - GET /api/sync/status — 获取同步状态
- [ ] 变更追踪：本地每次 Dexie 写操作记录 changeLog（entity, id, action, timestamp）
- [ ] Push 逻辑：将 changeLog 中未同步的变更批量上传
- [ ] Pull 逻辑：拉取远端 updatedAt > 本地 lastSyncAt 的记录
- [ ] 冲突策略：last-write-wins（比较 updatedAt 时间戳）
- [ ] 同步触发时机：本地变更后延迟 5 秒自动 push；打开扩展时自动 pull

## 验收标准

- 设备 A 创建 workspace，设备 B 登录同账号后可看到
- 设备 A 修改集合名称，设备 B 刷新后同步更新
- 同步延迟 < 3 秒（正常网络条件下）
