# Milestone: idea-2 / M3 — 切换 + 自动归属 + 健壮性

Parent Idea: [idea-2](../idea/20260326-opentab-manager-idea-2.md)
Status: TODO

## 目标

Workspace 切换流畅，新 tab 自动归属，扩展重启后数据一致。

## 任务

- [ ] 点击左栏 workspace → 中栏切换显示对应 workspace 的集合和 tab（方案 C）
- [ ] 新打开的 tab 自动归入当前活跃 workspace 的默认集合
- [ ] 删除 workspace 时，其中的 tab 数据迁移到 Default workspace 的默认集合
- [ ] Tab ID 对账机制：chrome.runtime.onStartup 时全量对比 Dexie active tab 与 chrome.tabs.query 结果
  - 通过 URL 匹配重新关联 chromeTabId
  - 无法匹配的 tab 清除 chromeTabId
- [ ] 数据一致性检查：定期（或页面加载时）对比 Dexie 与浏览器实际 tab 状态
- [ ] Zustand store: activeWorkspaceId 管理

## 验收标准

- 切换 workspace 时中栏内容正确更新，无闪烁
- 新开 tab 自动出现在当前 workspace 的默认集合中
- 删除 workspace 后其 tab 出现在 Default workspace
- 扩展重启（或 Chrome 重启）后数据一致，无孤立 tab 记录
- 100+ tab 时切换和显示流畅
