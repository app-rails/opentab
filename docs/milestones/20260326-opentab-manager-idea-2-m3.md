# Milestone: idea-2 / M3 — 切换 + Save as Collection

Parent Idea: [idea-2](../idea/20260326-opentab-manager-idea-2.md)
Status: DONE

## 目标

Workspace 切换流畅，用户可将 live tabs 批量保存为集合。

## 任务

- [x] 点击左栏 workspace → 中栏切换显示对应 workspace 的集合和 tab（方案 C）
- [x] Live Tab 面板顶部"Save as Collection"按钮 — 弹窗选择 tab + 命名，批量保存到当前 workspace
- [x] Zustand store: activeWorkspaceId 管理

### 范围调整说明

以下原始任务经分析后移除：

- ~~新打开的 tab 自动归入当前活跃 workspace 的默认集合~~ → 改为用户主动的"Save as Collection"功能
- ~~删除 workspace 时迁移 tab 到 Default~~ → 当前行为（确认后一起删除）已正确
- ~~Tab ID 对账机制~~ → CollectionTab 是书签式记录，无 chromeTabId 字段，无需对账
- ~~数据一致性检查~~ → live tabs 每次从 chrome.tabs.query 重新获取，无一致性问题

## 验收标准

- [x] 切换 workspace 时中栏内容正确更新，无闪烁
- [x] 点击"Save as Collection"弹出对话框，可选择 tab 并命名
- [x] 保存后新集合出现在当前 workspace 中，包含所选 tab
- [x] chrome://、chrome-extension://、about:blank 等无效 tab 被自动过滤
