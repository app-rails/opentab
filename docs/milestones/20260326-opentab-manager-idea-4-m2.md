# Milestone: idea-4 / M2 — 快捷键系统

Parent Idea: [idea-4](../idea/20260326-opentab-manager-idea-4.md)
Status: TODO

## 目标

快捷键可快速切换 workspace 和触发全局搜索。

## 任务

- [ ] 快捷键监听框架（全页面内 keydown 事件）
- [ ] Cmd/Ctrl+Shift+1~9 切换前 9 个 workspace
- [ ] Cmd/Ctrl+K 打开全局搜索（搜索框聚焦）
- [ ] 全局搜索：跨 workspace 搜索 tab title + URL
- [ ] 搜索结果按 workspace > 集合分组显示
- [ ] 快捷键自定义：Settings.shortcuts 读写
- [ ] Settings 页面中快捷键配置 UI
- [ ] 快捷键冲突检测（不与 Chrome 原生快捷键冲突）

## 验收标准

- Cmd+Shift+1 切换到第一个 workspace，响应 < 100ms
- Cmd+K 打开搜索，输入关键词可找到跨 workspace 的 tab
- 自定义快捷键后立即生效，刷新后保持
- 不与 Chrome 原生快捷键（Cmd+T, Cmd+W 等）冲突
