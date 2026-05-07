# AGENTS.md — ArduFlux

> 本文件面向 AI 编码助手。阅读者应被假设为**完全不了解本项目**。

---

## 项目概述

本项目是一个 **VS Code 扩展**（显示名称为「开发板配置」），用于管理嵌入式开发板配置。扩展直接读写工作区根目录下的 `ArduFlux.json`，管理内容包括：

- 板子型号（名称、FQBN、编译参数、引脚定义）
- 串口（枚举、自动选择、USB 优先）
- 编译输出目录及最近使用路径
- 串口监视器参数（波特率、数据位、停止位、校验位、换行符）
- Profiles（保存、应用、删除、导入、导出）

扩展的数据格式与项目自带的 `src/scripts/upload.ps1` PowerShell 上传脚本保持兼容，该脚本可直接读取同一配置文件并完成编译、上传、监视器打开等操作。

本项目同时包含一个 Arduino 示例草图 `ArduFlux.ino`（ESP32-S3 触摸按键 + WS2812B LED 控制），用于验证配置与上传流程。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| VS Code 扩展 | TypeScript 5.9、Node.js API、VS Code Extension API |
| 构建工具 | `tsc`（TypeScript 编译器）、`vsce`（VSIX 打包工具） |
| 扩展测试 | Mocha + Chai + Sinon（TypeScript 侧单元测试） |
| 上传脚本 | PowerShell (`src/scripts/upload.ps1`)，依赖 `arduino-cli` |
| 嵌入式固件 | Arduino C++ (`ArduFlux.ino`) |

---

## 项目结构

```
.
├── src/                          # VS Code 扩展 TypeScript 源码
│   ├── extension.ts              # 扩展入口：注册命令、状态栏、输出通道、定时刷新
│   ├── editorView.ts             # WebviewViewProvider：侧边栏 Webview 视图提供者
│   ├── webviewController.ts      # Webview 控制器：HTML 生成、消息路由、配置/编译/上传/Profile 操作
│   ├── panel.ts                  # 浮动 WebviewPanel（侧边栏不可用时作为 fallback）
│   ├── configStore.ts            # 配置读写、校验、串口枚举、Profile 管理、参数构建
│   ├── types.ts                  # 类型定义、默认配置、预置板型目录
│   ├── configSidebar.ts          # TreeDataProvider 实现（目前未在 extension.ts 中注册）
│   ├── events.ts                 # 全局 EventEmitter：配置变更事件
│   ├── terminal.ts               # Pseudoterminal 封装：在 VS Code 终端中运行 arduino-cli / PowerShell
│   ├── statusBar.ts              # 状态栏文本格式化
│   ├── viewIds.ts                # 视图 ID 常量
│   ├── scripts/                  # 项目级脚本
│   │   └── upload.ps1            # PowerShell 上传脚本（读取 ArduFlux.json）
│   └── test/                     # TypeScript 单元测试（Mocha/Chai/Sinon）
│       ├── configStore.store.test.ts
│       ├── configStore.compile.test.ts
│       ├── configStore.feature.test.ts
│       ├── configStore.logic.test.ts
│       ├── statusBar.test.ts
│       ├── types.test.ts
│       └── webviewView.test.ts
├── dist/                         # tsc 编译输出（CommonJS + source map）
├── docs/                         # 项目级技术文档
│   └── roadmap-phase6-8.md       # 扩展功能开发路线图
├── ArduFlux.json                 # 扩展直接读写的配置文件（运行时生成/更新）
├── ArduFlux.template.json        # 配置文件模板
├── upload_config.json            # 旧版上传配置（upload.ps1 兼容读取）
├── install-vsix.ps1              # 自动卸载旧扩展并安装最新 VSIX（支持 TRAE / VS Code）
├── ArduFlux.ino                  # Arduino 示例草图
├── package.json                  # VS Code 扩展清单 + npm scripts
├── tsconfig.json                 # TypeScript 严格模式编译配置
└── .vscodeignore                 # VSIX 打包排除规则
```

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
先执行 `npm run compile`，再用 Mocha 运行 `dist/test/**/*.test.js`。

**测试监视模式：**
```bash
npm run test:watch
```

**打包 VSIX：**
```bash
npm run package
```
生成 `arduflux-<version>.vsix`。

**自动安装 VSIX（PowerShell）：**
```bash
npm run install:vsix        # 自动检测 TRAE / VS Code
npm run install:vsix:trae   # 强制使用 TRAE
npm run install:vsix:code   # 强制使用 VS Code
```
底层调用 `install-vsix.ps1`，会先卸载旧版本扩展再安装并提示重新加载窗口。

**手动安装扩展：**
在 VS Code / TRAE 扩展视图 → `...` → `Install from VSIX...` 选择生成的 `.vsix` 文件。

---

## 测试命令

**TypeScript 单元测试：**
```bash
npm test
```

当前测试覆盖（`src/test/`）：
- `configStore.store.test.ts`：ConfigStore 加载/保存、校验（board/monitor/build）、Profile 增删改查、导入导出
- `configStore.compile.test.ts`：`buildCompileArgs` / `buildUploadArgs` 参数构建与边界校验
- `configStore.feature.test.ts`：`buildMonitorArgs`、串口监视器参数、`execFileText` 执行
- `configStore.logic.test.ts`：纯逻辑函数（`deepClone`、`dedupeKeepLatest`、`normalizePath`、`validateFqbn`、`isUsbPort`、`normalizeSerialAddress`、`mapJsonPortEntry`、`recommendSerialPort`）
- `statusBar.test.ts`：状态栏文本格式化
- `types.test.ts`：默认配置、预置板型目录常量
- `webviewView.test.ts`：package.json 视图声明校验、扩展激活与 WebviewView 注册流程

---

## 代码风格与开发约定

### TypeScript 侧
- 使用 **严格模式**（`strict: true`），禁止隐式 `any`。
- 目标 `ES2020`，输出 `CommonJS`。
- 源码放在 `src/`，编译输出到 `dist/`。
- 错误处理使用自定义 `ValidationError`，携带 `message` 和可选的 `suggestion`（建议）。
- Webview 使用内联 HTML（非外部文件），通过 `nonce` 设置 CSP。
- 所有需要在命令面板中可见的 VS Code 命令，必须在 `package.json` 的 `contributes.commands` 中注册。
- `arduino-cli` 命令通过 `terminal.ts` 的 Pseudoterminal 运行，设置 `shell: false`，避免注入。

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

---

## 扩展命令清单

以下命令在 `package.json` 的 `contributes.commands` 中注册，可在命令面板中调用：

| 命令 ID | 标题 | 快捷键 | 说明 |
|---------|------|--------|------|
| `arduflux.openPanel` | 开发板配置: 打开面板 | `Ctrl+Alt+E` | 聚焦侧边栏 Webview 配置面板，若不可用则打开浮动面板 |
| `arduflux.validateConfig` | 开发板配置: 校验当前配置 | `Ctrl+Alt+V` | 校验当前 ArduFlux.json |
| `arduflux.openConfigFile` | 开发板配置: 打开配置文件 | — | 在编辑器中打开 JSON 配置文件 |
| `arduflux.compileSketch` | 开发板配置: 编译 Sketch | `Ctrl+Shift+B` | 聚焦面板后执行静默编译 |
| `arduflux.uploadSketch` | 开发板配置: 上传 Sketch | `Ctrl+Shift+U` | 聚焦面板后执行静默上传 |
| `arduflux.refreshSidebar` | 开发板配置: 刷新侧边栏 | — | 手动刷新侧边栏视图状态 |
| `arduflux.runUploadScript` | 开发板配置: 完整编译+上传+监视（脚本） | — | 调用 upload.ps1 执行完整流程 |
| `arduflux.compileOnly` | 开发板配置: 仅编译（脚本） | — | 调用 upload.ps1 仅编译 |
| `arduflux.uploadOnly` | 开发板配置: 仅上传+监视（脚本） | — | 调用 upload.ps1 仅上传并打开监视器 |

以下命令**仅在代码中注册**，不在 `package.json` 声明，因此不会在命令面板中出现，专供内部调用：

| 命令 ID | 说明 |
|---------|------|
| `arduflux.compileSketchSilent` | 静默编译（状态栏编译按钮直接调用） |
| `arduflux.uploadSketchSilent` | 静默上传（状态栏上传按钮直接调用） |
| `arduflux.openMonitor` | 打开串口监视器终端（状态栏监视器按钮调用） |

> 注：`compileSketch` / `uploadSketch` 会先聚焦侧边栏视图，再调用对应的 `Silent` 版本；若侧边栏不可用，则通过浮动面板执行。

---

## 与 upload.ps1 的兼容性要求

`src/scripts/upload.ps1` 和 VS Code 扩展共享同一个 `ArduFlux.json`。任何对 JSON 结构或字段名的修改，必须同时更新以下文件：

1. `src/types.ts`（TypeScript 类型定义）
2. `src/configStore.ts`（扩展读写逻辑）
3. `src/scripts/upload.ps1`（PowerShell 解析逻辑）

特别注意事项：
- `schemaVersion` 用于配置迁移。新增版本时需在 `migrateConfig`（TS）中处理旧版本升级逻辑。
- `arduino-cli` 路径默认为 `arduino-cli`，PowerShell 侧同样如此。

---

## 安全注意事项

- **路径安全**：用户输入的输出目录会经过规范化（`normalizePath`），相对路径基于项目根目录解析，避免目录穿越。
- **环境变量展开**：Windows 路径支持 `%ENVVAR%` 展开（`normalizePath` 中用正则替换），但仅用于已知配置项（`outputDir`）。
- **CSP**：Webview 启用 `Content-Security-Policy`，脚本源限制为 `nonce-${nonce}`，禁止内联事件处理器以外的任意脚本注入。
- **JSON 注入**：Webview 的初始状态通过 `JSON.stringify` 后替换 `<>&` 为 Unicode 转义序列，避免 HTML 注入。
- **终端执行**：`terminal.ts` 使用 `spawn` 且 `shell: false`，参数以数组传递，降低命令注入风险。

---

## 常见修改场景指引

**新增预置板型**：
- 修改 `src/types.ts` 中的 `DEFAULT_BOARD_CATALOG`。

**新增配置字段**：
- 在 `src/types.ts` 中扩展对应接口。
- 在 `src/configStore.ts` 的 `validateAll` / `buildCurrentConfig` 中处理。
- 在 `src/webviewController.ts` 的 Webview HTML 中添加 UI 控件与消息处理。
- 在 `src/scripts/upload.ps1` 的读取/保存段落中添加映射。

**修改 Webview UI**：
- UI 完全内联在 `src/webviewController.ts` 的 `getHtml` 方法中（HTML + CSS + JavaScript）。
- 前端与后端通过 `vscode.postMessage` / `panel.webview.onDidReceiveMessage` 通信。
- 新增消息类型时，需在 `handleMessage` switch 中添加分支，并在前端 `postMessage` 中发送对应类型。

**修改 TypeScript 测试**：
- 测试文件位于 `src/test/*.test.ts`。
- 使用 Chai (`expect`) + Sinon（stub/mock）。
- 运行方式：`npm test`。
