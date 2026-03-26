# Milestone: idea-8 / M1 — 账号升级流程

Parent Idea: [idea-8](../idea/20260326-opentab-manager-idea-8.md)
Status: TODO

## 目标

匿名用户可注册账号，本地数据无缝关联。

## 任务

- [ ] Settings 中「注册账号」入口 UI
- [ ] 注册方式：邮箱 + 密码（better-auth 内置支持）
- [ ] 可选 OAuth（Google、GitHub）— 如 better-auth 支持
- [ ] 升级流程：匿名 account → 绑定邮箱 → 标记为 registered
- [ ] 升级后本地数据自动关联到注册账号（Dexie 中 Account.type 更新）
- [ ] 登录/登出 UI
- [ ] 多设备登录：新设备登录后标识为新设备，准备拉取数据

## 验收标准

- 匿名用户注册后数据不丢失，Account.type 变为 'registered'
- 登出后扩展回到匿名模式（创建新匿名账号或保留本地数据）
- 另一台设备登录同一账号可识别身份
