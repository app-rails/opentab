# Milestone: idea-5 / M1 — 基础 TabGroups 映射

Parent Idea: [idea-5](../idea/20260326-opentab-manager-idea-5.md)
Status: TODO

## 目标

启用 TabGroups 模式后，workspace 自动对应 Chrome TabGroup。

## 任务

- [ ] Settings 中添加 tabGroupsEnabled 开关 UI
- [ ] 启用时：遍历所有 workspace，为每个创建 Chrome TabGroup（chrome.tabGroups API）
- [ ] TabGroup 名称 = workspace 名称，颜色 = workspace 颜色（映射到 Chrome 支持的颜色枚举）
- [ ] 将 workspace 中有 chromeTabId 的 tab 移入对应 TabGroup
- [ ] 禁用时：移除所有由 OpenTab 创建的 TabGroup（或 ungroup tabs）
- [ ] 存储 workspace → tabGroupId 的映射关系

## 验收标准

- 启用后 Chrome tab 栏显示与 workspace 同名同色的 TabGroup
- workspace 中的 active tab 正确归入对应 TabGroup
- 禁用后 TabGroup 被清理，tab 回到无分组状态
