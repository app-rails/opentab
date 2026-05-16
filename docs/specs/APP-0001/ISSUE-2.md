---
id: APP-0001/ISSUE-2
parent: APP-0001/PRODUCT
category: enhancement
status: needs-triage
---

# 完整 wire protocol schemas + endpoints 落 @opentabai/api

## What to build

把 wire protocol 所有业务端点的 zod request / response schemas、长度上限常量、`endpoints` 对象（key 为业务名，value 为 `defineEndpoint` 返回值）全部落到 `@opentabai/api`。范围至少含 sync 簇（push / pull / snapshot）和 auth 簇（与 opentab-server APP-0001 v1 PRD + ADR-0003 中定义的端点保持 1:1 对应）。本切片不动扩展端，纯 schema 拓宽。覆盖 PRODUCT.UserStory #4、PRODUCT.Behavior #6。

## Acceptance

- [ ] 覆盖 PRODUCT.Acceptance "Behavior 6, 7" — 所有业务 endpoint 形状与 opentab-server `docs/adr/0003-trpc-contract-via-npm.md` 描述一致
- [ ] 切片特有：每条 endpoint 都有 zod 双向校验测试（合法 input pass、非法 input fail），fixtures 与 opentab-server 侧同源
- [ ] 切片特有：`ErrorCode` enum 与 opentab-server `docs/adr/0012-error-model.md` 中 11 个错误码一一对应
- [ ] 切片特有：长度上限常量 + `UUID_V7_REGEX` 在 schemas 中被显式引用，避免幻数
- [ ] 切片特有：包内仍然 grep `@trpc/`、`router(`、`procedure` 全空

## Blocked by

- APP-0001/ISSUE-1
