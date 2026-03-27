# Milestone: idea-1 / M3 — 数据层 + UI 骨架

Parent Idea: [idea-1](../idea/20260326-opentab-manager-idea-1.md)
Status: DONE

## 目标

Dexie.js 数据库初始化，三栏全页面骨架可展示。

## 任务

- [x] Dexie.js schema 定义（Account、Workspace、TabCollection、CollectionTab、Settings）
- [x] Dexie 版本管理策略（db.version(1).stores({...})）
- [x] 首次安装初始化逻辑：创建默认 Workspace + 默认 TabCollection
- [x] 全页面（tabs.html）三栏布局骨架（Tailwind + shadcn/ui）
  - 左栏：Workspace 列表区域（placeholder）
  - 中栏：Tab 集合区域（placeholder）
  - 右栏：Live Tab 区域（placeholder）
- [x] 扩展图标点击 → 打开全页面 tab（如已打开则聚焦该 tab）
- [x] Zustand store 骨架初始化

## 验收标准

- 全页面显示三栏骨架布局（placeholder 内容）
- Dexie.js 数据库初始化成功（可在 DevTools > Application > IndexedDB 查看）
- 默认 Workspace 和默认 TabCollection 已创建
- 点击扩展图标打开全页面，重复点击聚焦已打开的页面
