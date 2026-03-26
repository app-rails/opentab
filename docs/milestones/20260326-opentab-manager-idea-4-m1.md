# Milestone: idea-4 / M1 — 主题 + 空状态

Parent Idea: [idea-4](../idea/20260326-opentab-manager-idea-4.md)
Status: TODO

## 目标

主题跟随系统自动切换，空状态提供有效引导。

## 任务

- [ ] Tailwind dark mode 配置（class 策略）
- [ ] Settings.theme 读写（'light' | 'dark' | 'system'）
- [ ] system 模式：监听 prefers-color-scheme 自动切换
- [ ] Settings 页面中主题切换 UI
- [ ] 空 workspace 引导提示（"拖拽 tab 到这里" 或 "点击保存快照"）
- [ ] 空集合引导提示（"添加 tab 到此集合"）
- [ ] 首次使用欢迎引导（简洁，非阻塞）

## 验收标准

- 主题跟随系统自动切换正确
- 手动切换 light/dark 即时生效，刷新后保持
- 新 workspace 和新集合显示引导提示，添加内容后消失
- 所有 UI 组件在 light 和 dark 主题下显示正常
