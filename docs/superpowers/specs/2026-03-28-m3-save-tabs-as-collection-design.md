# M3 Design: Save Tabs as Collection

## Background

M3 原始需求包含 6 项任务，经分析后范围调整如下：

| 原任务 | 结论 |
|--------|------|
| 1. Workspace 切换 (方案 C) | 已完成 |
| 2. 新 tab 自动归属 | 改为"Save as Collection"功能 |
| 3. 删除 workspace 迁移 tab | 不需要，当前行为（确认后一起删除）已正确 |
| 4. Tab ID 对账 | 跳过——CollectionTab 是书签式记录，无 chromeTabId 字段，无需对账 |
| 5. 数据一致性检查 | 跳过——live tabs 每次从 chrome.tabs.query 重新获取，无一致性问题 |
| 6. activeWorkspaceId 管理 | 已完成 |

**M3 唯一新功能：Live Tab 面板顶部的"Save as Collection"按钮。**

## User Flow

1. 用户在 Live Tab 面板顶部点击 "Save as Collection" 按钮
2. 弹出对话框：
   - **集合名称输入框** — 默认值为当前时间（格式 `2026-03-28 14:30:05`），用户可编辑
   - **Tab 列表** — 带 checkbox，每行显示 favicon + title + url。已过滤掉无效 tab，默认全选
   - **底部全选/取消全选 toggle** + 已选数量提示
   - 确认 / 取消按钮
3. 点击确认 → 在当前 activeWorkspace 下创建新集合，批量写入选中的 tabs

## Tab Filter Rules

从 `liveTabs` 中排除以下 tab，不显示在对话框列表中：

- URL 为空、`undefined`、或 `about:blank`
- URL 以 `chrome://` 开头
- URL 以 `chrome-extension://` 开头

## File Changes

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `components/live-tabs/save-tabs-dialog.tsx` | 新建 | 对话框组件：名称输入、tab checkbox 列表、全选 toggle |
| `components/layout/live-tab-panel.tsx` | 修改 | 顶部添加按钮，传入 filtered liveTabs 并触发对话框 |
| `stores/app-store.ts` | 修改 | 新增 `saveTabsAsCollection(name, tabs[])` 方法 |

## Store Method

### `saveTabsAsCollection(name: string, tabs: {url: string, title: string, favIconUrl?: string}[])`

- 在 `activeWorkspaceId` 下创建新 `TabCollection` 记录
- 用 `generateKeyBetween` 为每个 tab 生成递增的 fractional order
- 单个 Dexie transaction 写入 collection + 所有 CollectionTab 记录
- 乐观更新 Zustand state（collections 和 tabsByCollection）

## Edge Cases

- **没有可保存的 tab**（全被过滤规则排除）→ 按钮 disabled
- **用户取消全选**（选中数为 0）→ 确认按钮 disabled
- **集合名为空** → 确认按钮 disabled
- **集合名超长** → 复用现有 `WORKSPACE_NAME_MAX_LENGTH` 截断规则

## Out of Scope

- 保存后不关闭浏览器 tab，不修改 live tab 面板状态
- 不检测重复（同一 URL 已在某个集合中）
- 不支持跨 workspace 保存（始终保存到 activeWorkspace）
