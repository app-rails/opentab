# Milestone: idea-3 / M1 — 快照创建

Parent Idea: [idea-3](../idea/20260326-opentab-manager-idea-3.md)
Status: TODO

## 目标

用户可一键将当前打开的 tab 保存为一个新集合。

## 任务

- [ ] 右栏顶部「保存当前 tab 为集合」按钮
- [ ] 点击后：chrome.tabs.query 获取所有 live tab → 创建新 TabCollection → 批量写入 CollectionTab
- [ ] 默认集合名："Snapshot YYYY-MM-DD HH:mm"（可编辑）
- [ ] 保存后中栏立即显示新集合
- [ ] 保存确认反馈（toast 通知）

## 验收标准

- 一键保存 10+ tab 为集合，耗时 < 1 秒
- 保存后中栏立即出现新集合，tab 信息（title + favicon + URL）完整
- 集合名称可在保存后编辑
