# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

ArduFlux 是一个 VS Code / TRAE IDE 扩展，用于 Arduino、ESP32、ESP8266 等嵌入式开发板的配置、编译、上传和串口监视管理。运行时配置的单一来源是工作区根目录的 `ArduFlux.json`，并保持与遗留 `upload.ps1` 配置格式兼容。

项目同时提供三条入口：
- VS Code / TRAE 扩展：侧边栏 Webview、命令、状态栏和终端输出。
- MCP 服务：面向 Claude Code、Kimi Code、Cursor 等客户端的 stdio / SSE 工具接口。
- 跨平台上传核心：基于 Node.js 的编译、上传、串口监视流程，可脱离 VS Code API 运行。

运行环境要求：Node.js `>=18.0.0`，VS Code 引擎 `^1.90.0`；实际编译和上传依赖本机已安装 `arduino-cli`。

## 常用命令

| 操作 | 命令 |
|------|------|
| 安装依赖 | `npm install` |
| 编译 TypeScript | `npm run compile` |
| 监视编译 | `npm run watch` |
| 运行全部测试 | `npm test` |
| 测试监视模式 | `npm run test:watch` |
| 运行单个测试文件 | `npm run compile && npx mocha "dist/test/<路径>/<文件名>.test.js"` |
| 打包 VSIX | `npm run package` |
| 发布前校验 | `npm run prepublishOnly` |
| 安装 VSIX 到本地 IDE（TRAE 优先） | `npm run install:vsix` |
| 强制安装到 TRAE | `npm run install:vsix:trae` |
| 强制安装到 VS Code | `npm run install:vsix:code` |
| 启动本地 MCP（stdio） | `npm run mcp:stdio` |
| 启动本地 MCP（SSE） | `npm run mcp:sse` |

当前 `package.json` 未定义单独的 lint / format 脚本；提交或交付前至少运行 `npm run compile` 和相关测试。

测试源码位于 `src/test/`，编译后输出到 `dist/test/`。运行单个测试时要使用编译后的文件路径，例如：

```bash
npm run compile && npx mocha "dist/test/uploader/uploader.test.js"
```

## 调试与本地运行

- VS Code 扩展调试：在 VS Code 中打开项目后按 `F5`，启动扩展开发宿主窗口并在新窗口中验证命令、侧边栏和状态栏行为。
- 扩展命令入口在 `package.json` 的 `contributes.commands` 和 `activationEvents` 中声明。
- `main` 指向 `dist/extension.js`，因此调试或运行测试前需要确保 TypeScript 已编译。
- MCP CLI 本地调试前先执行 `npm run compile`，再使用 `npm run mcp:stdio` 或 `npm run mcp:sse`。

## 架构要点

### 扩展主机层

`src/extension.ts` 是 VS Code 扩展入口，负责注册命令、状态栏、侧边栏视图和 MCP provider。扩展 UI 的用户操作不直接读写配置文件，而是经由控制器和状态层处理。

### 配置与状态层

`src/configStore.ts` 管理 `ArduFlux.json` 的读取、写入、校验、迁移和串口枚举，是项目状态的单一来源。配置类型、Zod schema 和预置板型定义集中在 `src/types.ts`。状态变化通过事件总线广播给状态栏、Webview、MCP 和上传核心。

### Webview UI 层

侧边栏由 Webview view provider、Webview controller 和 HTML/CSS/JS 生成逻辑组成。Webview 负责展示与发送消息；扩展主机侧负责消息路由、配置更新、校验和命令执行，避免浏览器上下文直接触碰文件系统。

### 上传核心

`src/uploader/` 是跨平台上传核心，负责编排 Sketch 路径解析、输出目录解析、arduino-cli 编译 / 上传、库依赖检测安装、串口枚举、端口占用检测和串口监视器启动。该层不依赖 VS Code API，因此可被扩展命令和 MCP 工具复用。

### MCP 层

`src/mcpServer.ts` 提供独立 MCP 服务入口，`src/mcp/extensionIntegration.ts` 提供扩展内 MCP 集成，`src/mcp/transports.ts` 封装 stdio / SSE 传输。新增或修改 MCP 工具时，需要同步检查独立 CLI 模式和扩展内 MCP 模式，避免两边能力不一致。

## 跨模块变更注意事项

修改 `ArduFlux.json` 字段结构时通常需要同步更新：
1. `src/types.ts`：类型定义、Zod schema、默认结构。
2. `src/configStore.ts`：读写、校验、迁移、默认值处理。
3. `src/uploader/`：上传核心对配置字段的读取和行为。
4. `src/scripts/upload.ps1`：遗留 PowerShell 脚本兼容逻辑，仍保留时尽量同步。
5. `src/test/`：配置解析、迁移、Webview、MCP 或上传流程的相关测试。

新增扩展命令时通常需要检查：
- `package.json` 的 `contributes.commands`、`activationEvents`、快捷键或菜单声明。
- `src/extension.ts` 的命令注册。
- Webview 或状态栏是否需要展示新状态。
- 是否需要 MCP 暴露同等能力。

新增 MCP 工具时通常需要检查：
- `src/mcpServer.ts` 的独立服务实现。
- `src/mcp/extensionIntegration.ts` 的扩展内实现。
- 对应的 `src/test/mcp/` 测试。

## 项目约束

- TypeScript 使用 `strict: true`，新增代码不要使用 `any`。
- `tsconfig.json` 的 `rootDir` 是 `src`，输出目录是 `dist`，测试也从 `src/test` 编译到 `dist/test`。
- 该仓库当前没有 `.cursor/rules/`、`.cursorrules` 或 `.github/copilot-instructions.md`。
