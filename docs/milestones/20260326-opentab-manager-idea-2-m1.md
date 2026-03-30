# Milestone: idea-2 / M1 — Workspace CRUD

Parent Idea: [idea-2](../idea/20260326-opentab-manager-idea-2.md)
Status: DONE

## 目标

左栏 Workspace 列表完整可用，支持增删改查和排序。

## 任务

- [x] 左栏 Workspace 列表 UI（shadcn/ui 组件）
- [x] 创建 Workspace（名称 + 图标选择）
- [x] 重命名 Workspace（双击或右键菜单）
- [x] 修改 Workspace 图标
- [x] 删除 Workspace（Default 除外，确认弹窗）
- [x] Workspace 拖拽排序（fractional indexing）
- [x] 选中 Workspace 高亮显示
- [x] 右键上下文菜单（重命名 / 改图标 / 删除）
- [x] Zustand store: workspaces 状态管理
- [x] Dexie CRUD 操作封装

## 验收标准

- 可创建 5+ workspace，名称和颜色正确显示
- 重命名、改色、删除操作正常（Default workspace 删除按钮禁用）
- 拖拽排序后刷新页面顺序保持
- 数据持久化：扩展重启后 workspace 列表不丢失
