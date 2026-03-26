# Idea-1: 基础骨架（Monorepo + WXT + Auth）

Parent: [20260326-opentab-manager.md](20260326-opentab-manager.md)
Status: APPROVED
Date: 2026-03-26

## Summary

搭建项目基础设施：Monorepo 结构、Chrome 扩展（WXT + React）、轻量后端（Hono + better-auth）、本地数据层（Dexie.js）、三栏 UI 骨架。

## Scope

- Monorepo 搭建（pnpm workspace + turborepo）
  - `packages/extension` — WXT Chrome 扩展
  - `packages/server` — Hono 后端
  - `packages/shared` — 共享类型定义
- WXT + React + TypeScript + Tailwind + shadcn/ui 初始化
- Hono 后端 + better-auth 匿名账号
- Dexie.js schema 定义（Account、Workspace、TabCollection、CollectionTab、Settings）
- 三栏全页面骨架 UI
- 扩展图标点击打开全页面

## Out of Scope

- Workspace CRUD 逻辑（idea-2）
- Tab 管理和拖拽（idea-2）
- 任何业务功能

## Dependencies

无（首个 idea）

## Milestones

| # | 名称 | 文件 |
|---|------|------|
| M1 | 项目初始化 | [milestone](../../milestones/20260326-opentab-manager-idea-1-m1.md) |
| M2 | 认证体系 | [milestone](../../milestones/20260326-opentab-manager-idea-1-m2.md) |
| M3 | 数据层 + UI 骨架 | [milestone](../../milestones/20260326-opentab-manager-idea-1-m3.md) |
