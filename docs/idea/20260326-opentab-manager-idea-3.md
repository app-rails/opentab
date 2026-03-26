# Idea-3: Tab 快照（手动保存/恢复一组 tab）

Parent: [20260326-opentab-manager.md](20260326-opentab-manager.md)
Status: APPROVED
Date: 2026-03-26

## Summary

一键将当前浏览器打开的 tab 保存为一个新集合（快照），可随时恢复。本质是 idea-2 集合能力的快捷操作。

## Scope

- 「保存当前 tab 为集合」一键操作
- 快照集合管理（查看、重命名、删除）
- 一键恢复（全部打开）
- 部分恢复（勾选打开）
- 快照对比（已打开 vs 未打开）

## Out of Scope

- 自动归档（已关闭 tab 自动保存）— 后续独立 idea
- 定时快照

## Dependencies

- idea-2（集合功能必须完成）

## Milestones

| # | 名称 | 文件 |
|---|------|------|
| M1 | 快照创建 | [milestone](../milestones/20260326-opentab-manager-idea-3-m1.md) |
| M2 | 快照管理 + 恢复 | [milestone](../milestones/20260326-opentab-manager-idea-3-m2.md) |
