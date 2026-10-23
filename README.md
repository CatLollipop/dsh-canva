# dsh-canva（Canva 连接器）

> DeepSeek Harness 的 Canva 插件：**完整复刻 Codex 的 Canva 插件**——连接 Canva 官方 MCP 服务（`https://mcp.canva.com/mcp`），带 8 个 Canva 技能，并通过动态客户端注册实现真正的一键 OAuth 授权。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

## 安装

把本目录作为本地 bundle 安装进当前 profile：

```text
plugin_manager({ action: "install_bundle", target: "<本目录绝对路径>" })
```

安装后宿主行与 Client 半区由 `dsh.bundle` / `dsh.client` 自动挂载，无需手改 `cordis.patch.yml`。设置页出现 **Canva** 页签，工具以 `canva_*` 前缀进入模型可用工具表。

## 开关即授权

1. 设置 → **Canva**，把右侧 **启用** 开关打开（没有单独的授权按钮）。
2. 插件自动完成：读取 Canva MCP 的授权元数据 → 用 `POST /register` 动态注册本机客户端（public client，`token_endpoint_auth_method: none`）→ 生成 PKCE → 在侧边栏「Agent 浏览器」打开 Canva 同意页（没有该插件时用系统浏览器）。
3. 同意后 Canva 回调本机固定端口（`http://127.0.0.1:47653/canva/oauth/callback`），插件自动换取 access/refresh token、连接 MCP、拉取工具列表并注册。
4. 卡片自动变成「已连接 · 有效期至 · N 个工具」。令牌过期前自动用 refresh token 续期。
5. 关掉开关只断开连接、保留授权；点 **清除授权** 才会删除令牌。

**不需要**创建 Canva 应用、不需要填 Client ID/Secret。

## 复刻了什么

| Codex Canva 插件 | dsh-canva |
|---|---|
| `.mcp.json` → `https://mcp.canva.com/mcp` | 同样的 MCP 服务 |
| 8 个 skills | `skills/` 下原样移植，注册进 Harness 技能目录 |
| 连接器 OAuth（平台托管） | 本机 DCR + PKCE OAuth（无需平台） |
| 模型直接调用 Canva 工具 | 授权后把 MCP 工具注册为 `canva_*` 原生工具 |

技能列表：`canva-resize-for-social-media`、`canva-bulk-create`、`canva-edit-design`、`canva-design-feedback`、`canva-implement-feedback`、`canva-brand-check`、`canva-branded-presentation`、`canva-translate-design`。

实测授权后从 Canva MCP 拉到 **48 个工具**（设计创建/搜索/导出、评论、品牌模板、图片生成、去背景、编辑事务等）。

## 工具

- 授权后每个 Canva MCP 工具注册为 `canva_<tool>`（参数 schema 会被裁剪到宿主支持的子集）。
- 兜底工具 `canva`：`status` / `tools` / `test` / `call`（`tool` + JSON 字符串 `arguments`），用于查看状态、列出工具或直接调用任意 Canva 工具。

## 安全与存储

- 令牌：本机凭证库记录 `canva/canva-oauth`；不写设置文件、不回显。
- 客户端注册信息（client_id、回调地址）与启用状态：`$DSH_HOME/canva.json`。
- 授权记录仅在令牌过期时用 refresh token 单次兑换并替换存储。

## 目录

| 文件 | 作用 |
|---|---|
| `index.js` | 宿主入口：`canva` 工具、MCP 工具动态注册、8 个技能注册、系统提示 |
| `service.js` | OAuth（discovery / DCR / PKCE / refresh）与 MCP Streamable HTTP 客户端 |
| `oauth-server.js` | 本机固定端口回调服务器（47653–47657） |
| `rpc.js` | 设置页 ↔ 宿主的 RPC（`/api/canva`） |
| `client.js` | 设置页（开关即授权、状态 hero、工具 chips） |
| `skills/` | 从 Codex Canva 插件移植的 8 个技能 |
| `locale/`、`icon.svg` | 插件元数据与图标 |

## 开发验证

```text
node --check index.js service.js rpc.js oauth-server.js client.js
node --test service.test.js rpc.test.js
```

测试覆盖：discovery → DCR → PKCE 授权 URL、回调换取 token、MCP initialize/tools-list/tools-call、令牌过期自动 refresh、伪造 state 拒绝、RPC 信封与错误码、MCP schema 裁剪。

## 仓库

- GitHub: <https://github.com/CatLollipop/dsh-canva>

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
