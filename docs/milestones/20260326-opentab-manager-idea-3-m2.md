# Milestone: idea-3 / M2 — 快照管理 + 恢复

Parent Idea: [idea-3](../idea/20260326-opentab-manager-idea-3.md)
Status: TODO

## 目标

快照集合可管理、可恢复、可部分恢复，支持对比已打开状态。

## 任务

- [ ] 快照集合显示创建时间、tab 数量
- [ ] 一键恢复：点击集合「全部打开」→ chrome.tabs.create 批量创建
- [ ] 部分恢复：勾选要打开的 tab → 仅创建选中的
- [ ] 快照对比：集合内每个 tab 标记「已打开」/「未打开」状态
  - 通过 URL 匹配当前 live tab 判断
  - 已打开的 tab 灰色/勾选显示
- [ ] 恢复时去重：已打开的 tab 不重复创建，而是聚焦已有 tab

## 验收标准

- 恢复快照后所有 tab 正确打开
- 已打开的 tab 不重复创建
- 部分恢复只打开勾选的 tab
- 快照对比状态实时更新（打开/关闭 tab 后状态变化）
