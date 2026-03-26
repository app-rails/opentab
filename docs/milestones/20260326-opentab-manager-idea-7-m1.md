# Milestone: idea-7 / M1 — 文档体系

Parent Idea: [idea-7](../idea/20260326-opentab-manager-idea-7.md)
Status: TODO

## 目标

新开发者按文档可跑起项目并提交 PR。

## 任务

- [ ] README.md
  - 项目简介 + 核心功能列表
  - GIF demo（录制核心工作流）
  - 功能截图
  - 安装方式（Chrome Web Store 链接 + 开发者模式手动安装）
  - 技术栈说明
  - Star 引导 badge
- [ ] CONTRIBUTING.md
  - 开发环境搭建步骤（Node 版本、pnpm 安装、项目 clone + dev）
  - 代码规范（ESLint + Prettier 配置）
  - 分支命名规范
  - PR 流程和 review 标准
  - Issue 模板（bug report / feature request）
- [ ] LICENSE 文件（MIT 或 AGPL，根据决策）
- [ ] CHANGELOG.md 初始化（v0.1.0）

## 验收标准

- 新开发者按 README 从 clone 到 `pnpm dev` 跑起来 < 5 分钟
- 按 CONTRIBUTING.md 可成功提交一个 PR
- LICENSE 文件存在且内容正确
