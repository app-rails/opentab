# Milestone: idea-3 / M2 — 快照管理 + 恢复

Parent Idea: [idea-3](../idea/20260326-opentab-manager-idea-3.md)
Status: DONE

## 目标

快照集合可管理、可恢复，支持对比已打开状态。

## 任务

- [x] 快照集合显示创建时间、tab 数量
  - tab 数量显示在标题旁；hover info 图标显示创建时间（Tooltip）
- [x] 一键恢复：点击集合「全部打开」→ chrome.tabs.create 批量创建
  - 改为在当前窗口打开（非新窗口），以支持去重逻辑
- ~~部分恢复：勾选要打开的 tab → 仅创建选中的~~（scope 精简时移除）
- [x] 快照对比：集合内每个 tab 标记「已打开」/「未打开」状态
  - 通过 URL 精确匹配当前 live tab 判断
  - 已打开的 tab 右上角显示绿点
- [x] 恢复时去重：已打开的 tab 不重复创建

## 验收标准

- [x] 恢复快照后所有 tab 正确打开
- [x] 已打开的 tab 不重复创建
- [x] 快照对比状态实时更新（打开/关闭 tab 后状态变化）
