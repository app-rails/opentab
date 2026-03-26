# Milestone: idea-2 / M2 — 集合 + Tab 管理

Parent Idea: [idea-2](../idea/20260326-opentab-manager-idea-2.md)
Status: TODO

## 目标

中栏按集合分组显示 tab，右栏显示浏览器 live tab，支持拖拽加入和一键打开。

## 任务

- [ ] 右栏：chrome.tabs.query 获取所有 live tab 并实时显示
- [ ] 右栏：监听 chrome.tabs.onCreated/onRemoved/onUpdated 实时更新
- [ ] Background Service Worker：tab 事件监听和消息路由
- [ ] 中栏：按 TabCollection 分组显示 tab（集合名称作为分组标题）
- [ ] 集合 CRUD：创建 / 重命名 / 删除集合
- [ ] 拖拽：右栏 tab → 中栏集合（加入 workspace）
- [ ] 拖拽库集成（dnd-kit 或 @hello-pangea/dnd）
- [ ] 中栏集合内 tab 拖拽排序
- [ ] 集合「全部打开」按钮 → chrome.tabs.create 批量创建
- [ ] 手动添加 tab 到集合（输入 URL）
- [ ] 从集合中移除 tab
- [ ] Zustand store: collections + tabs 状态管理

## 验收标准

- 右栏显示浏览器所有 live tab，新开/关闭 tab 实时更新
- 拖拽 live tab 到中栏集合正常工作
- 集合 CRUD 操作正常，数据持久化
- 点击「全部打开」正确创建所有 tab
- 中栏 tab 可拖拽排序，刷新后顺序保持
