# MCP 服务器迭代路线图

> 基于已交付的 MCP v1.0（9 个 Tools + stdio/SSE 双传输层），规划后续增强与生态适配。

---

## Phase 9 — 生态适配与稳定性强化

### 9.1 VS Code 原生 MCP 注册表适配

**背景**：VS Code 1.99+ 开始内置 MCP 客户端，支持通过 `mcp` 配置项或扩展 API 注册服务器。

**目标**：让 VS Code 内置 AI（Copilot / Chat）零配置发现 ArduFlux MCP 工具集。

**实现要点**：
- 研究 VS Code `McpServer` API（若已开放）或 `vscode.extensions.getExtension` 方案
- 在 `extension.ts` 中，SSE 服务器启动后通过 `vscode.workspace.getConfiguration("mcp")` 动态注入服务器配置
- 支持 `settings.json` 热更新，用户无需手动编辑配置

**验收标准**：
- 安装扩展后，VS Code Chat 侧边栏的 `#工具` 列表自动出现 `arduflux_*` 工具
- 卸载扩展后，MCP 配置自动清理

---

### 9.2 stdio 模式稳定性增强

**背景**：当前 stdio 传输层直接复用 SDK 的 `StdioServerTransport`，但缺少进程级健康检查和自动重启。

**目标**：确保 Claude Desktop / Cursor 等外部客户端在长时间会话中不会因进程崩溃而失联。

**实现要点**：
- 在 CLI 入口添加 `--health-check-interval` 参数（默认 30 秒）
- 心跳机制：向 stderr 输出 `[arduflux-mcp] ping` 日志，便于外部进程管理器监控
- 捕获未处理异常，退出前输出 JSON 错误摘要到 stderr
- 考虑添加 `arduflux_health` tool，返回服务器运行时长、内存占用、活跃任务数

**验收标准**：
- 手动 `kill` MCP 进程后，外部客户端能感知连接断开
- 10 分钟空闲会话后，再次调用 tool 仍能正常响应

---

### 9.3 SSE 传输层升级至 StreamableHTTP

**背景**：`SSEServerTransport` 已被 SDK 标记为 `@deprecated`，未来版本可能移除。

**目标**：迁移到 `StreamableHTTPServerTransport`，兼容 MCP 协议 2025-03 及后续版本。

**实现要点**：
- 替换 `src/mcp/transports.ts` 中的 `SSEServerTransport` 为 `StreamableHTTPServerTransport`
- 复用现有 HTTP 服务器基础设施，但改用 `POST /mcp` 单一端点（GET SSE + POST message 合并）
- 保持 `startSseServer` 函数签名不变，对 `extension.ts` 零侵入

**验收标准**：
- 所有现有 SSE 测试（`transports.test.ts`）无需修改即可通过
- 同时兼容旧版 SSE 客户端和新版 StreamableHTTP 客户端

---

## Phase 10 — 工具能力扩展

### 10.1 批量 Profile 管理

**新增 Tools**：
- `arduflux_list_profiles` — 返回所有 Profile 名称列表
- `arduflux_save_profile` — 将当前配置保存为新 Profile（支持覆盖）
- `arduflux_delete_profile` — 删除指定 Profile

**Schema 设计**：
```json
{
  "name": "arduflux_list_profiles",
  "description": "列出当前所有可用的 Profile 名称"
}
{
  "name": "arduflux_save_profile",
  "description": "将当前配置保存为指定名称的 Profile",
  "inputSchema": {
    "name": "string",
    "overwrite": "boolean (optional)"
  }
}
```

**验收标准**：AI 可通过自然语言指令完成"保存当前配置为 dev 版本"等操作。

---

### 10.2 Sketch 路径智能发现

**背景**：当前 `sketchPath` 需手动指定，AI 无法自动推断工作区中的 `.ino` 文件。

**新增 Tool**：
- `arduflux_discover_sketches` — 扫描工作区及子目录，返回所有 `.ino` 文件路径列表

**实现要点**：
- 使用 `fs.promises.readdir` + `glob` 模式递归搜索
- 排除 `node_modules`、`.git`、`dist` 等目录
- 返回结果按目录深度排序（根目录优先）

**联动改造**：
- `arduflux_compile` / `arduflux_upload` 的 `sketch_path` 参数改为可选
- 若未提供，自动使用 `discover_sketches` 的第一个结果（若唯一）

**验收标准**：
- 工作区根目录只有一个 `.ino` 时，AI 可直接说"编译"，无需指定路径

---

### 10.3 任务日志实时推送（SSE / Progress）

**背景**：当前 `arduflux_get_task_status` 采用轮询模式，AI 需多次调用才能获取完整编译日志。

**目标**：支持 MCP `notifications/progress` 或 SSE 流式推送，让 AI 客户端实时看到编译进度。

**实现要点**：
- 研究 SDK `server.sendLoggingMessage` 和 `server.notification` API
- 在 `TaskManager` 中，每当子进程输出新日志，调用 `server.sendLoggingMessage` 向客户端推送
- 客户端通过 `notifications/message` 接收实时日志

**兼容性 fallback**：
- 若客户端未声明 `logging` capability，回退到现有轮询模式

**验收标准**：
- Claude Desktop 调用 compile 后，可在对话窗口中看到实时编译输出流

---

## Phase 11 — 安全与隔离

### 11.1 命令执行白名单

**背景**：当前 `arduflux_compile` / `upload` 直接调用 `arduino-cli`，若配置被恶意篡改可能执行任意命令。

**目标**：增加命令和参数校验层，防止命令注入。

**实现要点**：
- 在 `buildCompileArgs` / `buildUploadArgs` 返回后，增加参数合法性二次校验
- 禁止 `--build-property` 等可能包含 shell 元字符的参数值
- 校验 `fqbn` 严格匹配 `vendor:arch:board[:option]` 格式
- 校验 `sketchPath` 必须为 `.ino` 文件且位于工作区内（防止目录穿越）

**验收标准**：
- 构造恶意配置（fqbn 包含 `; rm -rf /`）时，MCP 工具返回明确错误，不执行任何命令

---

### 11.2 工作区隔离验证

**背景**：`createMcpServer` 接收 `workspaceRoot`，但工具内部未严格限制文件操作范围。

**目标**：确保所有文件读写（`ArduFlux.json`、草图文件、输出目录）均限制在指定工作区内。

**实现要点**：
- 在 `ConfigStore` 层增加 `baseDir` 前缀校验
- `normalizePath` 已具备此能力，但需在 `set_config` 中显式调用
- `arduflux_set_config` 的 `sketch_path` 若指向工作区外，返回 `ValidationError`

---

## Phase 12 — 测试与文档

### 12.1 集成测试覆盖

**当前缺口**：所有 MCP 测试使用 `InMemoryTransport`，未覆盖真实 stdio/SSE 进程间通信。

**目标**：补充端到端集成测试。

**测试矩阵**：

| 场景 | 测试内容 |
|------|---------|
| stdio 端到端 | spawn `dist/mcpServer.js --stdio`，通过管道发送 initialize + tools/list，验证响应 |
| SSE 端到端 | spawn `dist/mcpServer.js --sse`，HTTP GET `/sse` + POST `/message?sessionId=xxx`，验证完整握手 |
| 扩展集成 | 激活 VS Code 扩展，验证 `startMcpSseServer` 成功解析端口，且进程可被 dispose 终止 |

---

### 12.2 用户配置文档

**目标**：为 AI 用户和终端用户分别编写配置指南。

**文档清单**：
- `docs/mcp-claude-desktop.md` — Claude Desktop `claude_desktop_config.json` 配置示例
- `docs/mcp-cursor.md` — Cursor `.cursor/mcp.json` 配置示例
- `docs/mcp-vscode.md` — VS Code `settings.json` MCP 服务器配置（待原生支持稳定后）

---

## 实施优先级建议

| 顺序 | Phase | 预计耗时 | 原因 |
|------|-------|----------|------|
| 1 | **9.3** SSE 升级 StreamableHTTP | 2 小时 | 技术债，越早迁移成本越低 |
| 2 | **9.1** VS Code 原生注册表 | 3 小时 | 生态壁垒，直接影响 IDE AI 可用性 |
| 3 | **10.1** 批量 Profile 管理 | 2 小时 | 高频需求，完善配置管理闭环 |
| 4 | **10.2** Sketch 智能发现 | 1.5 小时 | 降低 AI 使用门槛 |
| 5 | **10.3** 任务日志实时推送 | 4 小时 | 体验提升显著，但涉及 SDK 实验性 API |
| 6 | **11.1** 命令执行白名单 | 2 小时 | 安全基线，上线前必须完成 |
| 7 | **12.1** 集成测试 | 3 小时 | 长期可维护性保障 |

---

## 验收总标准

- [ ] `npm test` 全绿（原有 103 + 新增 MCP 测试）
- [ ] SSE 模式通过 `StreamableHTTPServerTransport` 完成至少一次完整 initialize → tools/list → tool/call 握手
- [ ] VS Code 扩展激活后，OutputChannel 打印 `MCP SSE server listening on port XXXX`
- [ ] 恶意 FQBN / sketchPath 被拦截，返回 `isError: true`
- [ ] Claude Desktop 配置示例可直接复制使用，无需额外调试
