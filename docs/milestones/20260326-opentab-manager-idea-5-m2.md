# Milestone: idea-5 / M2 — 切换联动 TabGroups

Parent Idea: [idea-5](../idea/20260326-opentab-manager-idea-5.md)
Status: TODO

## 目标

切换 workspace 时 TabGroups 联动 expand/collapse，提供视觉隔离。

## 任务

- [ ] 切换 workspace 时：expand 当前 workspace 的 TabGroup，collapse 所有其他
- [ ] 新 tab 加入 workspace 时自动加入对应 TabGroup（chrome.tabs.group）
- [ ] Workspace 重命名 → 同步更新 TabGroup 名称
- [ ] Workspace 改色 → 同步更新 TabGroup 颜色
- [ ] 删除 workspace → 移除对应 TabGroup
- [ ] 处理 TabGroup 被用户手动修改的情况（名称/颜色不一致时以 OpenTab 为准）

## 验收标准

- 切换 workspace 时 tab 栏只展开当前 workspace 的 tab 组，其他折叠
- 重命名 workspace 后 TabGroup 名称同步更新
- 新 tab 自动加入当前 workspace 的 TabGroup
- 用户手动修改 TabGroup 名称后，下次 OpenTab 操作时覆盖回正确名称
