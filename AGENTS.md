<!-- AGENTS.md — ArduFlux -->

> 本文件面向 AI 编码助手。阅读者应被假设为**完全不了解本项目**。

---

## 项目概述

本项目是一个 **VS Code 扩展**（显示名称为「ArduFlux」，扩展 ID 为 `DonkeyDrift.arduflux`，版本 `0.4.2`），用于管理嵌入式开发板配置。扩展直接读写工作区根目录下的 `ArduFlux.json`，管理内容包括：

- 板子型号（名称、FQBN、编译参数、引脚定义）
- 串口（枚举、自动选择、USB 优先）
- 编译输出目录及最近使用路径
- 串口监视器参数（波特率、数据位、停止位、校验位、换行符）
- Profiles（保存、应用、删除、导入、导出）
- Sketch 路径选择（`.ino` 文件）
- 链节开关：上传前自动编译、上传后自动打开串口监视器

扩展内部使用纯 Node.js 实现编译/上传/监视核心流程（`src/uploader/`），`src/scripts/upload.ps1` PowerShell 脚本保留为独立兼容脚本，可直接读取同一配置文件完成相同操作。

本项目同时包含一个 Arduino 示例草图 `ArduFlux.ino`（ESP32-S3 触摸按键 + WS2812B LED 控制），以及一个测试用 Arduino 项目目录 `test/mus4/`，用于验证配置与上传流程。

此外，项目还内嵌了一个 **MCP (Model Context Protocol) 服务器**，提供 14 个 AI 可调用的 Tools，支持 stdio、SSE、StreamableHTTP 三种传输层，使外部 AI 客户端（Claude Desktop、Cursor、Kimi CLI 等）能够零配置或低配置地操控开发板配置、编译、上传和监视器。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| VS Code 扩展 | TypeScript 5.9、Node.js API、VS Code Extension API |
| 构建工具 | `tsc`（TypeScript 编译器）、`vsce`（VSIX 打包工具） |
| 扩展测试 | Mocha + Chai + Sinon（TypeScript 侧单元测试） |
| MCP 服务器 | `@modelcontextprotocol/sdk` + `zod`（Schema 校验） |
| 上传核心 | Node.js `src/uploader/`（跨平台），原 PowerShell 脚本 `src/scripts/upload.ps1` 保留兼容 |
| 嵌入式固件 | Arduino C++ (`ArduFlux.ino`、`test/mus4/*.ino`) |

### TypeScript 编译配置

`tsconfig.json` 关键选项：
- `target`: `ES2020`
- `module`: `CommonJS`
- `outDir`: `dist`
- `rootDir`: `src`
- `strict`: `true`（严格模式，禁止隐式 `any`）
- `sourceMap`: `true`
- `esModuleInterop`: `true`
- `moduleResolution`: `node`
- `skipLibCheck`: `true`
- `types`: `["node", "vscode", "mocha", "chai"]`

---

## 项目结构

```
.
├── src/                          # VS Code 扩展 TypeScript 源码
│   ├── extension.ts              # 扩展入口：注册命令、状态栏、输出通道、定时刷新、启动 MCP SSE 服务器
│   ├── editorView.ts             # WebviewViewProvider：侧边栏 Webview 视图提供者
│   ├── webviewController.ts      # Webview 控制器：内联 HTML 生成、消息路由、配置/编译/上传/Profile 操作
│   ├── panel.ts                  # 浮动 WebviewPanel（侧边栏不可用时作为 fallback）
│   ├── configStore.ts            # 配置读写、校验、串口枚举、Profile 管理、参数构建、Sketch 自动发现
│   ├── types.ts                  # 类型定义、默认配置、预置板型目录
│   ├── configSidebar.ts          # TreeDataProvider 实现（目前未在 extension.ts 中注册）
│   ├── events.ts                 # 全局 EventEmitter：配置变更事件
│   ├── terminal.ts               # Pseudoterminal 封装：在 VS Code 终端中运行 arduino-cli / PowerShell
│   ├── statusBar.ts              # 状态栏文本格式化纯函数
│   ├── viewIds.ts                # 视图 ID 常量（ARDUFLUX_EDITOR_VIEW_ID = "arduflux.editor"）
│   ├── mcpServer.ts              # MCP 服务器核心：14 个 Tools、任务管理、CLI 入口
│   ├── mcp/
│   │   ├── extensionIntegration.ts  # VS Code 扩展内启动 MCP SSE 子进程
│   │   └── transports.ts            # SSE / StreamableHTTP / stdio 传输层实现
│   ├── uploader/                 # 跨平台上传核心（替代 upload.ps1）
│   │   ├── projectResolver.ts    # 项目根目录查找（ArduFlux.json / .ino）
│   │   ├── libraryResolver.ts    # 库依赖解析、已安装库查询、缺失库安装
│   │   ├── portManager.ts        # 串口释放（跨平台进程终止）、PowerShell 可执行文件检测
│   │   └── uploader.ts           # Uploader 主控类：编译/上传/监视流程协调、多端口重试
│   ├── scripts/                  # 项目级脚本
│   │   └── upload.ps1            # PowerShell 上传脚本（保留兼容，扩展不再直接调用）
│   └── test/                     # TypeScript 单元测试（Mocha/Chai/Sinon）
│       ├── configStore.store.test.ts
│       ├── configStore.compile.test.ts
│       ├── configStore.feature.test.ts
│       ├── configStore.logic.test.ts
│       ├── statusBar.test.ts
│       ├── types.test.ts
│       ├── webviewView.test.ts
│       ├── uploader/
│       │   ├── projectResolver.test.ts
│       │   ├── libraryResolver.test.ts
│       │   ├── portManager.test.ts
│       │   └── uploader.test.ts
│       └── mcp/
│           ├── mcpServer.test.ts
│           ├── transports.test.ts
│           ├── extensionIntegration.test.ts
│           └── integration.test.ts
├── dist/                         # tsc 编译输出（CommonJS + source map）
│   ├── *.js / *.js.map           # 各模块编译产物
│   ├── mcpServer.js              # MCP 服务器可执行入口
│   └── test/                     # 编译后的测试文件
├── bin/
│   └── arduflux-mcp              # CLI shebang 脚本（`#!/usr/bin/env node`，调用 `dist/mcpServer.js`）
├── docs/                         # 项目级技术文档
│   ├── instruction/              # MCP 各客户端配置指南（claude-desktop、cursor、kimi-cli、trae、vscode 等）
│   ├── roadmap/                  # 开发路线图（phase6-8、phase9-12）
│   └── validation/               # 验收报告
├── rel/                          # 预构建发布包
│   ├── arduflux-0.3.3.vsix
│   ├── arduflux-0.3.4.vsix
│   └── arduflux-0.4.0.vsix
├── test/                         # 测试用 Arduino 项目
│   └── mus4/                     # 示例草图（含 .ino、.cpp、.h 文件）
├── .trae/                        # TRAE IDE 相关配置
│   ├── rules/
│   └── skills/
├── ArduFlux.json                 # 扩展直接读写的配置文件（运行时生成/更新，gitignored）
├── ArduFlux.template.json        # 配置文件模板（含示例端口/目录数据）
├── install-vsix.ps1              # 自动卸载旧扩展并安装最新 VSIX（支持 TRAE / VS Code）
├── ArduFlux.ino                  # Arduino 示例草图
├── package.json                  # VS Code 扩展清单 + npm scripts
├── tsconfig.json                 # TypeScript 严格模式编译配置
└── .vscodeignore                 # VSIX 打包排除规则
```

### 源码模块职责详解

| 文件 | 职责 |
|------|------|
| `extension.ts` | 扩展激活入口。注册所有命令、WebviewViewProvider、状态栏（含编译/上传/监视器快捷图标和动态 spinner）、输出通道、定时刷新（5 秒间隔）。激活时自动启动 MCP SSE 子进程，并尝试向 VS Code 1.99+ 的 `lm.registerMcpServerDefinitionProvider` 注册 MCP 服务器定义。 |
| `editorView.ts` | 实现 `vscode.WebviewViewProvider`，为侧边栏 `arduflux.editor` 视图提供 Webview。处理无工作区时的占位提示，以及视图显隐切换时的状态同步。 |
| `webviewController.ts` | 核心控制器 `ConfigEditorController`。生成完整内联 HTML/CSS/JS（`getHtml`），处理前端 `postMessage`（save-config、auto-save-config、compile-sketch、upload-sketch、refresh-ports、save-profile、apply-profile、delete-profile、export-profiles、import-profiles、open-config-file、open-monitor、select-sketch、toggle-compile-link、toggle-monitor-link 等），调用 `terminal.ts` 执行实际任务。 |
| `panel.ts` | 浮动面板 `ArduFluxPanel`，作为侧边栏不可用时的 fallback。包装同一套 `ConfigEditorController`。 |
| `configStore.ts` | 配置持久化核心。`ConfigStore` 类负责加载/保存 `ArduFlux.json`、配置迁移（`migrateConfig`）、校验（board/port/build/monitor）、串口枚举（带 5 秒缓存）、Profile 增删改查/导入导出、Sketch 自动发现（`discoverSketches`）。同时导出大量纯工具函数（`buildCompileArgs`、`buildUploadArgs`、`buildMonitorArgs`、`normalizePath`、`validateFqbn`、`validateCliArgs`、`validateSketchPath`、`deepClone`、`recommendSerialPort`、`isUsbPort`、`normalizeSerialAddress`、`mapJsonPortEntry` 等）。 |
| `types.ts` | 所有接口定义和默认配置工厂函数 `createDefaultConfig()`。预置板型目录 `DEFAULT_BOARD_CATALOG` 包含 ESP32-S3、ESP32 Dev Module、Arduino Uno、STM32 (Custom FQBN)。 |
| `terminal.ts` | 提供 `runInTerminal`（直接运行 arduino-cli）和 `runUploaderFlow`（调用 Node.js Uploader 核心）。均使用 VS Code `Pseudoterminal` 实现，支持进程树强制终止（Ctrl+C）。上传执行成功后，非监视器模式下终端窗口会在 3 秒后自动关闭。 |
| `statusBar.ts` | 仅含 `formatStatusBarText(boardName, portAddress)` 纯函数。 |
| `configSidebar.ts` | 已实现 `ConfigSidebarProvider`（`TreeDataProvider`），但 `extension.ts` 的 `activate()` **未注册**该 Provider。如需启用，需手动调用 `vscode.window.registerTreeDataProvider()`。 |
| `events.ts` | 导出全局 `onDidChangeArduFluxConfig` EventEmitter，用于配置变更时通知状态栏等订阅方刷新。 |
| `viewIds.ts` | 单一常量 `ARDUFLUX_EDITOR_VIEW_ID = "arduflux.editor"`。 |
| `mcpServer.ts` | MCP 服务器实现。`createMcpServer(workspaceRoot)` 创建 `McpServer` 实例，注册 14 个 Tools（arduflux_get_state / list_ports / validate_config / set_config / apply_profile / list_profiles / save_profile / delete_profile / discover_sketches / compile / upload / get_task_status / monitor / health）。支持后台任务（`startTask`）和日志实时推送（`sendLoggingMessage`）。CLI 入口支持 `--stdio`、`--sse`、`--workspace`、`--health-check-interval` 参数。 |
| `mcp/extensionIntegration.ts` | `startMcpSseServer(extensionPath, workspaceRoot)`： spawn 子进程启动 `dist/mcpServer.js --sse`，解析 stderr/stdout 中的端口信息，返回 `{ process, port }`。 |
| `mcp/transports.ts` | `startSseServer(mcpServer, port, serverFactory?)`：启动 Node.js `http.Server`，同时支持 Legacy SSE (`/sse` + `/message`) 和 StreamableHTTP (`/mcp`)。`startStdioServer(mcpServer)`：启动 stdio 传输层。 |

---

## 构建、打包与安装命令

**安装依赖：**
```bash
npm install
```

**编译 TypeScript（开发）：**
```bash
npm run compile
```
输出到 `dist/` 目录。

**监视模式：**
```bash
npm run watch
```

**运行 TypeScript 单元测试：**
```bash
npm test
```
先执行 `npm run compile`，再用 Mocha 运行 `dist/test/**/*.test.js`。当前共 **175** 个测试用例全部通过（原有 103 个 + MCP 相关 32 个 + uploader 相关 40 个）。

**测试监视模式：**
```bash
npm run test:watch
```

**打包 VSIX：**
```bash
npm run package
```
生成 `arduflux-<version>.vsix`。`.vscodeignore` 会排除 `src/`、`node_modules/`、`dist/test/`、`docs/`、`AGENTS.md` 等，但确保 `dist/mcpServer.js` 和 `bin/arduflux-mcp` 被打包。

**自动安装 VSIX（PowerShell）：**
```bash
npm run install:vsix        # 自动检测 TRAE / VS Code
npm run install:vsix:trae   # 强制使用 TRAE
npm run install:vsix:code   # 强制使用 VS Code
```
底层调用 `install-vsix.ps1`，会先卸载旧版本扩展再安装并提示重新加载窗口。

> 注意：TRAE IDE 不支持 `--reload-window` CLI 参数，安装完成后需手动执行 `Developer: Reload Window` 命令重新加载窗口。

**手动安装扩展：**
在 VS Code / TRAE 扩展视图 → `...` → `Install from VSIX...` 选择生成的 `.vsix` 文件。

**MCP 服务器独立运行（开发调试）：**
```bash
# stdio 模式（供 Claude Desktop / Cursor 等外部客户端使用）
npm run mcp:stdio

# SSE 模式（供 IDE 或浏览器客户端使用）
npm run mcp:sse
```
底层分别为 `node dist/mcpServer.js --stdio` 和 `node dist/mcpServer.js --sse`。

---

## 测试策略与测试命令

**TypeScript 单元测试：**
```bash
npm test
```

当前测试覆盖（`src/test/`）共 15 个文件、**175** 个用例：

| 测试文件 | 覆盖内容 |
|----------|----------|
| `configStore.store.test.ts` | `ConfigStore` 加载/保存、校验（board/monitor/build）、Profile 增删改查、导入导出 |
| `configStore.compile.test.ts` | `buildCompileArgs` / `buildUploadArgs` 参数构建与边界校验 |
| `configStore.feature.test.ts` | `buildMonitorArgs`、串口监视器参数、`execFileText` 执行 |
| `configStore.logic.test.ts` | 纯逻辑函数（`deepClone`、`dedupeKeepLatest`、`normalizePath`、`validateFqbn`、`isUsbPort`、`normalizeSerialAddress`、`mapJsonPortEntry`、`recommendSerialPort`、`validateCliArgs`、`validateSketchPath`） |
| `statusBar.test.ts` | 状态栏文本格式化 |
| `types.test.ts` | 默认配置、预置板型目录常量 |
| `webviewView.test.ts` | `package.json` 视图声明校验、扩展激活与 WebviewView 注册流程（使用 fake VS Code 模块） |
| `mcp/mcpServer.test.ts` | 14 个 MCP Tools 的功能测试（get_state、set_config、compile、upload、profile 管理、sketch 发现、安全拦截、health） |
| `mcp/transports.test.ts` | SSE / StreamableHTTP / stdio 传输层单元测试 |
| `mcp/extensionIntegration.test.ts` | `startMcpSseServer` 端口解析、进程终止、超时处理 |
| `mcp/integration.test.ts` | stdio、SSE、StreamableHTTP 端到端集成测试（真实子进程 spawn） |
| `uploader/projectResolver.test.ts` | 项目根目录查找（ArduFlux.json / .ino 向上遍历） |
| `uploader/libraryResolver.test.ts` | `#include` 解析、系统库排除、库名映射、缺失库检测与安装 |
| `uploader/portManager.test.ts` | 跨平台 PowerShell 检测、串口释放（taskkill / fuser） |
| `uploader/uploader.test.ts` | `Uploader` 主控流程：编译、上传、监视、多端口重试、compile-before-upload 链节 |

**测试原则：**
- 所有纯逻辑（参数构造、路径拼接、校验）必须先写单元测试（红→绿）。
- VS Code API 交互（Terminal、StatusBar、Webview）在单元测试通过后集成。
- 快捷键为纯声明式配置，直接修改 `package.json`，无需代码测试。
- 测试中使用 Sinon stub 拦截 `fs.promises`、`child_process.spawn` 等外部依赖；`webviewView.test.ts` 通过劫持 `module._load` 注入 fake `vscode` 模块；MCP 测试使用 `InMemoryTransport.createLinkedPair()` 进行内存级协议交互。

---

## MCP 服务器架构

### 14 个 Registered Tools

| Tool ID | 功能 | 备注 |
|---------|------|------|
| `arduflux_get_state` | 获取完整工作区状态（配置 + 串口 + 板型目录 + 推荐端口） | |
| `arduflux_list_ports` | 强制刷新串口列表 | 返回 USB 端口标记 |
| `arduflux_validate_config` | 校验当前配置合法性 | 返回 `{ valid: true/false, message? }` |
| `arduflux_set_config` | 原子化更新配置字段 | 未提供字段保持原值；sketch_path 强制工作区内 |
| `arduflux_apply_profile` | 应用指定 Profile | |
| `arduflux_list_profiles` | 列出所有 Profile 名称 | |
| `arduflux_save_profile` | 保存当前配置为 Profile | 支持 `overwrite` |
| `arduflux_delete_profile` | 删除指定 Profile | |
| `arduflux_discover_sketches` | 扫描工作区 `.ino` 文件 | 排除 `node_modules`、`.git`、`dist` 等目录 |
| `arduflux_compile` | 编译 Sketch | 长耗时异步任务，返回 `task_id` |
| `arduflux_upload` | 上传固件 | 自动遵循 `compile_before_upload` 链节开关 |
| `arduflux_get_task_status` | 查询任务状态与日志 | 轮询模式 |
| `arduflux_monitor` | 打开串口监视器 | 在系统终端中启动阻塞进程 |
| `arduflux_health` | 服务器健康状态 | 运行时长、内存、活跃任务数 |

### 传输层

- **stdio**：供 Claude Desktop、Cursor、Kimi CLI 等外部客户端通过子进程调用。支持 `--health-check-interval` 心跳日志。
- **SSE (Legacy)**：`GET /sse` + `POST /message?sessionId=xxx`，兼容旧版 MCP 客户端。
- **StreamableHTTP**：`POST /mcp`、`GET /mcp`、`DELETE /mcp`，支持 `mcp-session-id` 头，兼容 MCP 协议 2025-03+。

### VS Code 原生集成

扩展激活时（`extension.ts`），若检测到 `vscode.lm.registerMcpServerDefinitionProvider` API（VS Code 1.99+），会自动注册 `McpServerDefinitionProvider`，将 SSE 服务器的 `http://127.0.0.1:<port>/mcp` 地址注入 VS Code 内置 AI 工具列表，实现零配置发现。

---

## 代码风格与开发约定

### TypeScript 侧
- 使用 **严格模式**（`strict: true`），禁止隐式 `any`。
- 目标 `ES2020`，输出 `CommonJS`。
- 源码放在 `src/`，编译输出到 `dist/`。
- 深拷贝：工具函数 `deepClone` 使用 `JSON.parse(JSON.stringify(value))`；`createDefaultConfig()` 中使用 `structuredClone` 复制预置引脚定义。
- 错误处理使用自定义 `ValidationError`，携带 `message` 和可选的 `suggestion`（建议）。
- Webview 使用**内联 HTML**（非外部文件），通过 `nonce` 设置 CSP。所有 HTML、CSS、JavaScript 均在 `src/webviewController.ts` 的 `getHtml()` 方法中生成。
- 所有需要在命令面板中可见的 VS Code 命令，必须在 `package.json` 的 `contributes.commands` 中注册。
- `arduino-cli` 命令通过 `terminal.ts` 的 Pseudoterminal 运行，设置 `shell: false`，参数以数组传递，避免注入。
- 保存操作使用全局 `saveLock` 串行化（`ConfigStore.waitForSave()`），避免并发写文件。
- MCP 服务器中，长耗时任务（compile/upload/monitor）采用异步后台 `spawn`，返回 `task_id` 供轮询，同时通过 `sendLoggingMessage` 向支持该能力的客户端推送实时日志。

### 文档约定
- `docs/` 仅存放与项目直接相关的技术文档（配置说明、开发计划、路线图等）。
- 不存放通用规范、外部标准或用户操作手册——此类内容应通过链接引用，避免冗余。
- 文档命名优先使用 **kebab-case**（如 `tdd-dev-plan.md`）；与代码包/模块强对应的文档可保持同名（如 `embedded_config.md`）。
- 文档采用 Markdown 格式，保持轻量，聚焦本项目的实现细节与决策记录。

### 配置文件格式约定
- 文件名固定为 `ArduFlux.json`。
- 顶层字段：`schemaVersion`（当前为 `1`）、`current`、`profiles`。
- `profiles` 始终包含 `default: {}`。
- `recentOutputDirs` 最多保留 5 条，去重且保留最新。
- 引脚定义 `pinDefines` 必须是 JSON 对象（`dict`），不能是数组或标量。
- 当前 `build` 额外包含 `compileBeforeUpload`（布尔）、`uploadThenMonitor`（布尔）、`sketchPath`（字符串）。
- 配置文件中可包含 `cache` 字段，用于缓存串口列表和库依赖分析结果，减少重复调用 `arduino-cli`。

---

## 扩展命令清单

### package.json 中注册的命令（命令面板可见）

| 命令 ID | 标题 | 快捷键 | 说明 |
|---------|------|--------|------|
| `arduflux.openPanel` | ArduFlux: 打开面板 | `Ctrl+Alt+E` | 聚焦侧边栏 Webview 配置面板，若不可用则打开浮动面板 |
| `arduflux.validateConfig` | ArduFlux: 校验当前配置 | `Ctrl+Alt+V` | 校验当前 ArduFlux.json |
| `arduflux.openConfigFile` | ArduFlux: 打开配置文件 | — | 在编辑器中打开 JSON 配置文件 |
| `arduflux.compileSketch` | ArduFlux: 编译 Sketch | `Ctrl+Shift+B` | 聚焦面板后执行静默编译 |
| `arduflux.uploadSketch` | ArduFlux: 上传 Sketch | `Ctrl+Shift+U` | 聚焦面板后执行静默上传 |
| `arduflux.refreshSidebar` | ArduFlux: 刷新侧边栏 | — | 手动刷新侧边栏视图状态 |
| `arduflux.runUploadScript` | ArduFlux: 完整编译+上传+监视（脚本） | — | 调用 Node.js 上传核心执行完整流程 |
| `arduflux.compileOnly` | ArduFlux: 仅编译（脚本） | — | 调用 Node.js 上传核心仅编译 |
| `arduflux.uploadOnly` | ArduFlux: 仅上传+监视（脚本） | — | 调用 Node.js 上传核心仅上传并打开监视器 |

### 仅在代码中注册的内部命令（命令面板不可见）

| 命令 ID | 说明 |
|---------|------|
| `arduflux.compileSketchSilent` | 静默编译（状态栏编译按钮直接调用） |
| `arduflux.uploadSketchSilent` | 静默上传（状态栏上传按钮直接调用） |
| `arduflux.openMonitor` | 打开串口监视器终端（状态栏监视器按钮调用） |

> 注：`compileSketch` / `uploadSketch` 会先聚焦侧边栏视图，再调用对应的 `Silent` 版本；若侧边栏不可用，则通过浮动面板执行。

### 激活事件

扩展在以下场景自动激活：
- 执行任意 ArduFlux 命令（`onCommand:arduflux.*`）
- 侧边栏视图 `arduflux.editor` 被展开（`onView:arduflux.editor`）

---

## 与 upload.ps1 的兼容性要求

`src/scripts/upload.ps1` 和 VS Code 扩展共享同一个 `ArduFlux.json`。任何对 JSON 结构或字段名的修改，必须同时更新以下文件：

1. `src/types.ts`（TypeScript 类型定义）
2. `src/configStore.ts`（扩展读写逻辑）
3. `src/uploader/uploader.ts` 及相关模块（Node.js 上传核心逻辑）
4. `src/scripts/upload.ps1`（PowerShell 解析逻辑，保留兼容）

特别注意事项：
- `schemaVersion` 用于配置迁移。新增版本时需在 `migrateConfig`（TS）和 PowerShell 侧同样处理旧版本升级逻辑。
- `arduino-cli` 路径默认为 `arduino-cli`，PowerShell 侧同样如此。
- Node.js 上传核心（`src/uploader/`）和 upload.ps1 均支持：自动解析 `.ino` 文件中的 `#include <...>` 并尝试通过 `arduino-cli lib install` 安装所需外部库（内置系统库已排除）。
- 上传逻辑支持多端口候选重试（优先使用保存端口，失败时依次尝试其他 USB 端口）。
- 串口监视器统一使用 `arduino-cli monitor`（非 ESP32 使用标准参数；ESP32 通过 `--config dtr=off,rts=off` 保持端口稳定）。
- upload.ps1 保留对旧版 `upload_config.json` 的兼容读取逻辑（作为降级 fallback），但新项目应统一使用 `ArduFlux.json`。
- upload.ps1 的 ESP32 特定 workaround（自定义 `upload.pattern_args`）在 Node.js 核心中暂未移植，后续如需可扩展 `Uploader` 的 `runUpload` 方法。

---

## 安全注意事项

- **路径安全**：用户输入的输出目录会经过规范化（`normalizePath`），相对路径基于项目根目录解析，避免目录穿越。
- **环境变量展开**：Windows 路径支持 `%ENVVAR%` 展开（`normalizePath` 中用正则替换），但仅用于已知配置项（`outputDir`）。
- **草图路径校验**：`validateSketchPath` 强制要求 `.ino` 后缀，并通过 `path.relative` 校验文件必须位于工作区内，禁止访问外部文件。
- **命令参数白名单**：`validateCliArgs` 拦截包含 shell 元字符（`; | & $ \` * ? < > { } [ ] ! # ~`）的参数，防止通过 FQBN、编译参数等注入恶意命令。
- **FQBN 严格校验**：`validateFqbn` 要求 3–4 段，每段仅允许 `a-zA-Z0-9_-=`，拒绝任何异常字符。
- **CSP**：Webview 启用 `Content-Security-Policy`，脚本源限制为 `nonce-${nonce}`，禁止内联事件处理器以外的任意脚本注入。
- **JSON 注入**：Webview 的初始状态通过 `JSON.stringify` 后替换 `<>&` 为 Unicode 转义序列，避免 HTML 注入。
- **终端执行**：`terminal.ts` 使用 `spawn` 且 `shell: false`，参数以数组传递，降低命令注入风险。`Uploader` 内部同样遵循此原则。
- **跨平台进程终止**：`killProcessTree` 在 Windows 上使用 `taskkill`，在 POSIX 上使用 `kill -9 -<pgid>`。
- **MCP 工作区隔离**：`arduflux_set_config` 的 `sketch_path` 若指向工作区外，返回 `ValidationError`（`isError: true`）。

---

## 常见修改场景指引

**新增预置板型**：
- 修改 `src/types.ts` 中的 `DEFAULT_BOARD_CATALOG`。

**新增配置字段**：
- 在 `src/types.ts` 中扩展对应接口。
- 在 `src/configStore.ts` 的 `validateAll` / `buildCurrentConfig` / `migrateConfig` 中处理。
- 在 `src/webviewController.ts` 的 Webview HTML 中添加 UI 控件与消息处理。
- 在 `src/mcpServer.ts` 的 `SetConfigSchema` 和 `arduflux_set_config` 实现中处理。
- 在 `src/scripts/upload.ps1` 的读取/保存段落中添加映射。

**修改 Webview UI**：
- UI 完全内联在 `src/webviewController.ts` 的 `getHtml` 方法中（HTML + CSS + JavaScript）。
- 前端与后端通过 `vscode.postMessage` / `panel.webview.onDidReceiveMessage` 通信。
- 新增消息类型时，需在 `handleMessage` switch 中添加分支，并在前端 `postMessage` 中发送对应类型。

**修改 TypeScript 测试**：
- 测试文件位于 `src/test/*.test.ts`、`src/test/mcp/*.test.ts` 和 `src/test/uploader/*.test.ts`。
- 使用 Chai (`expect`) + Sinon（stub/mock）。
- 运行方式：`npm test`。
- `uploader` 模块测试采用依赖注入（DI）策略：所有 I/O 操作（`fs`、`spawn`、`execFile`）通过构造函数传入，便于在测试中替换为 stub。

**启用/禁用 configSidebar TreeDataProvider**：
- `src/configSidebar.ts` 已实现 `ConfigSidebarProvider`，但当前 `extension.ts` **未注册**该 Provider。
- 如需启用，在 `extension.ts` 的 `activate()` 中调用 `vscode.window.registerTreeDataProvider()` 并传入 `ConfigSidebarProvider` 实例。

**修改上传核心逻辑**：
- `src/uploader/uploader.ts` 是主控类，协调编译→上传→监视流程。
- `src/uploader/libraryResolver.ts` 处理库依赖解析与安装。
- `src/uploader/portManager.ts` 处理跨平台串口释放。
- 修改时需确保 `src/test/uploader/*.test.ts` 中对应测试同步更新（TDD）。

**新增 MCP Tool**：
- 在 `src/mcpServer.ts` 的 `createMcpServer` 中调用 `server.registerTool()`，定义 `description` 和可选的 `inputSchema`（使用 `zod`）。
- 在 `src/test/mcp/mcpServer.test.ts` 中补充对应 Tool 的功能测试。
- 如需让 VS Code 原生 AI 发现新 Tool，无需额外操作（Tool 列表由 `server` 动态提供，客户端通过 `tools/list` 获取）。

**修改 MCP 传输层**：
- `src/mcp/transports.ts` 同时维护 Legacy SSE 和 StreamableHTTP 双端点。
- 修改时需确保 `integration.test.ts` 中的端到端测试仍然通过（stdio、SSE、StreamableHTTP 三种场景）。
