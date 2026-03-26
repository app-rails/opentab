# Milestone: idea-1 / M1 — 项目初始化

Parent Idea: [idea-1](../idea/20260326-opentab-manager-idea-1.md)
Status: DONE

## 目标

Monorepo 搭建完成，扩展和后端可同时启动。

## 任务

- [x] pnpm workspace + turborepo 配置
- [x] `app-extension`: WXT 项目初始化 + React + TypeScript
- [x] `app-extension`: Tailwind CSS + shadcn/ui 集成
- [x] `app-server`: Hono 后端初始化
- [x] `packages/shared`: 共享类型定义包
- [x] turborepo tasks 配置（dev / build / lint）

## 验收标准

- `pnpm dev` 可同时启动扩展开发服务器 + 后端服务器
- 扩展可加载到 Chrome（chrome://extensions，开发者模式）
- 后端 `/api/health` 返回 200
- `packages/shared` 的类型可在 extension 和 server 中导入使用
