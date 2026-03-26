# Idea-5: TabGroups 集成（opt-in）

Parent: [20260326-opentab-manager.md](20260326-opentab-manager.md)
Status: APPROVED
Date: 2026-03-26

## Summary

可选的 Chrome TabGroups 集成：启用后 workspace 映射到 Chrome TabGroup，切换 workspace 时自动 collapse/expand 对应 tab 组，提供接近原生的视觉隔离体验。

## Scope

- Settings 中 tabGroupsEnabled 开关
- Workspace → Chrome TabGroup 映射（同名同色）
- 首次启用时自动为现有 workspace 创建 TabGroup
- 切换 workspace 时 expand 当前 / collapse 其他
- Workspace 重命名/改色同步到 TabGroup
- 新 tab 加入 workspace 时自动加入对应 TabGroup

## Out of Scope

- 多窗口隔离（方案 B，作为进阶选项保留）
- Tab 自动分组（AI 功能，后续独立 idea）

## Dependencies

- idea-2（workspace 核心必须完成）

## Milestones

| # | 名称 | 文件 |
|---|------|------|
| M1 | 基础 TabGroups 映射 | [milestone](../milestones/20260326-opentab-manager-idea-5-m1.md) |
| M2 | 切换联动 TabGroups | [milestone](../milestones/20260326-opentab-manager-idea-5-m2.md) |
