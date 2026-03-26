# Idea-2: Workspace 核心（CRUD + 集合 + Tab 管理）

Parent: [20260326-opentab-manager.md](20260326-opentab-manager.md)
Status: APPROVED
Date: 2026-03-26

## Summary

实现 workspace 和集合的完整管理功能：workspace CRUD、集合 CRUD、tab 分配与拖拽、workspace 切换（方案 C：纯 Dashboard）、新 tab 自动归属。

## Scope

- Workspace CRUD（创建、重命名、改色、删除、排序）
- TabCollection CRUD（创建、重命名、删除）
- 右栏 live tab 列表（实时同步浏览器 tab）
- 拖拽 tab 从右栏到中栏集合
- 中栏按集合分组显示 tab
- 集合内 tab 排序
- 集合「全部打开」功能
- Workspace 切换（方案 C：仅更新中栏显示）
- 新 tab 自动归入当前 workspace 的默认集合
- Tab ID 对账机制

## Out of Scope

- Tab 快照功能（idea-3）
- TabGroups 浏览器集成（idea-5）
- 快捷键（idea-4）

## Dependencies

- idea-1（基础骨架必须完成）

## Milestones

| # | 名称 | 文件 |
|---|------|------|
| M1 | Workspace CRUD | [milestone](../../milestones/20260326-opentab-manager-idea-2-m1.md) |
| M2 | 集合 + Tab 管理 | [milestone](../../milestones/20260326-opentab-manager-idea-2-m2.md) |
| M3 | 切换 + 自动归属 + 健壮性 | [milestone](../../milestones/20260326-opentab-manager-idea-2-m3.md) |
