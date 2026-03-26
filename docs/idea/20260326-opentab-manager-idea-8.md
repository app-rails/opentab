# Idea-8: 云同步（注册账号 + 跨设备）

Parent: [20260326-opentab-manager.md](20260326-opentab-manager.md)
Status: APPROVED
Date: 2026-03-26

## Summary

匿名账号升级为注册账号，支持跨设备同步 workspace、集合和 tab 数据。

## Scope

- 匿名 → 注册账号升级路径
- 后端 PostgreSQL 数据存储
- 本地 → 云上传同步
- 云 → 本地拉取同步
- 冲突策略（last-write-wins）
- 离线操作 + 恢复后自动同步
- 同步状态指示器

## Out of Scope

- CRDT / OT 高级冲突解决（后续评估）
- 付费订阅（后续独立 idea）
- 团队/组织功能

## Dependencies

- idea-1（auth 基础）
- idea-2（workspace 和集合数据）
- idea-7 M2（自部署后端）

## Milestones

| # | 名称 | 文件 |
|---|------|------|
| M1 | 账号升级流程 | [milestone](../../milestones/20260326-opentab-manager-idea-8-m1.md) |
| M2 | 数据同步引擎 | [milestone](../../milestones/20260326-opentab-manager-idea-8-m2.md) |
| M3 | 同步健壮性 | [milestone](../../milestones/20260326-opentab-manager-idea-8-m3.md) |
