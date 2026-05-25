# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

ArduFlux 是一个 VS Code / TRAE IDE 扩展，用于嵌入式开发（Arduino/ESP32）的全流程配置管理。它同时支持：
- **扩展 UI**：侧边栏 Webview 可视化配置面板
- **MCP 服务**：通过 Model Context Protocol 为 AI 客户端（Claude Code、Kimi Code、Cursor）提供 14+ 个工具
- **上传核心**：跨平台的 Node.js 实现，替代原有 PowerShell 脚本

全局配置文件为工作区根目录的 `ArduFlux.json`，与遗留的 `upload.ps1` 数据格式完全兼容。

- **官方仓库**：[DonkeyDrift/ArduFlux](https://github.com/DonkeyDrift/ArduFlux)
- **镜像仓库**：[donkeydrift/ArduFlux](https://gitee.com/donkeydrift/ArduFlux)（只读）

### 常用快捷键

| 命令 | 快捷键 |
|------|--------|
| 打开侧边栏配置面板 | `Ctrl+Alt+E` |
| 校验当前配置 | `Ctrl+Alt+V` |
| 编译 Sketch | `Ctrl+Shift+B` |
| 上传 Sketch | `Ctrl+Shift+U` |

## 常用命令

| 操作 | 命令 |
|------|------|
| 安装依赖 | `npm install` |
| 编译 TypeScript | `npm run compile` |
| 监视编译 | `npm run watch` |
| 运行全部单元测试 | `npm test` |
| 测试监视模式 | `npm run test:watch` |
| 打包 VSIX | `npm run package` |
| 安装扩展到本地 IDE（TRAE 优先） | `npm run install:vsix` |
| 强制安装到 TRAE | `npm run install:vsix:trae` |
| 强制安装到 VS Code | `npm run install:vsix:code` |
| 本地启动 MCP 服务（stdio） | `npm run mcp:stdio` |
| 本地启动 MCP 服务（SSE） | `npm run mcp:sse` |

当前 `package.json` 未定义单独的 lint/format 脚本；提交前至少运行 `npm run compile` 和相关测试。

运行单个测试文件：
```bash
npm run compile && npx mocha dist/test/<具体文件名>.test.js
```

## 架构概览

### 核心模块分层

```
src/
├── extension.ts           # 扩展入口：注册命令、状态栏、视图、MCP 提供器
├── configStore.ts         # 核心状态层：ArduFlux.json 读写、校验、迁移、串口枚举
├── types.ts               # 全局类型定义 + Zod schema + 预置板型常量
├── statusBar.ts           # 状态栏文本渲染逻辑
├── terminal.ts            # Pseudoterminal 封装（编译/上传/监视器输出）
├── editorView.ts          # Webview 视图提供者（VS Code 侧边栏）
├── webviewController.ts   # Webview 消息路由与 UI 逻辑
├── configSidebar.ts       # 侧边栏 HTML/CSS/JS 内容生成
├── panel.ts               # 侧边栏面板聚合
├── events.ts              # 全局事件总线（配置变更等）
├── viewIds.ts             # 视图 ID 常量
│
├── uploader/              # 跨平台上传核心（Node.js 实现）
│   ├── uploader.ts        # 主流程编排：编译 → 上传 → 串口监视器
│   ├── portManager.ts     # 串口枚举、占用检测、自动选择
│   ├── projectResolver.ts # Sketch 路径、输出目录解析
│   └── libraryResolver.ts # arduino-cli 库依赖检测与自动安装
│
├── mcp/                   # MCP 协议层
│   ├── transports.ts      # stdio / SSE 传输实现
│   └── extensionIntegration.ts  # MCP 与 VS Code 扩展的集成桥
├── mcpServer.ts           # 独立 MCP 服务入口（全局 CLI 用）
│
└── test/                  # Mocha + Chai 单元测试（按模块分组）
```

### 数据流向

1. **所有状态单一来源**：`configStore.ts` 管理 `ArduFlux.json`，其他模块（状态栏、Webview、MCP、上传核心）均通过事件总线订阅变更。
2. **Webview 与扩展主机**：通过 `webviewController.ts` 做消息中转，Webview 本身不直接读写文件。
3. **MCP 层**：复用 `configStore.ts` + `uploader/` 的全部能力，不重复实现业务逻辑。
4. **上传核心**：不依赖 VS Code API，可独立在 Node.js 环境运行（便于 CLI 和 MCP 调用）。

### 配置结构变更的联动

修改 `ArduFlux.json` 字段结构时，需要同步更新以下四处：
1. `src/types.ts` — TypeScript 类型 + Zod 校验 schema
2. `src/configStore.ts` — 读写逻辑、迁移逻辑、默认值
3. `src/uploader/` — 上传核心对配置字段的读取
4. `src/scripts/upload.ps1` — 遗留 PowerShell 脚本（兼容保留，非必须但尽量同步）

## 开发注意事项

1. **VS Code 扩展调试**：按 `F5` 启动扩展开发宿主窗口即可，无需手动构建（监视模式已开启）。
2. **测试运行要求**：测试文件编译输出到 `dist/test/`，运行测试前必须先执行 `npm run compile`。
3. **MCP 工具新增**：需同时更新 `src/mcpServer.ts` 和 `src/mcp/extensionIntegration.ts` 两处，保证独立 CLI 模式和扩展内 MCP 行为一致。
4. **严格模式**：`tsconfig.json` 已启用 `strict: true`，新增代码禁止使用 `any`。
5. **Node 版本要求**：`>= 18.0.0`；VS Code 引擎版本要求 `^1.90.0`。
