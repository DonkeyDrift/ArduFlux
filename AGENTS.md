<!-- AGENTS.md — ArduFlux -->

> 本文件面向 AI 编码助手。阅读者应被假设为**完全不了解本项目**。

---

## 项目概述

本项目是一个 **VS Code 扩展**（显示名称为「开发板配置」，扩展 ID 为 `baoshan.arduflux`，版本 `0.3.3`），用于管理嵌入式开发板配置。扩展直接读写工作区根目录下的 `ArduFlux.json`，管理内容包括：

- 板子型号（名称、FQBN、编译参数、引脚定义）
- 串口（枚举、自动选择、USB 优先）
- 编译输出目录及最近使用路径
- 串口监视器参数（波特率、数据位、停止位、校验位、换行符）
- Profiles（保存、应用、删除、导入、导出）
- Sketch 路径选择（`.ino` 文件）
- 链节开关：上传前自动编译、上传后自动打开串口监视器

扩展的数据格式与项目自带的 `src/scripts/upload.ps1` PowerShell 上传脚本保持兼容，该脚本可直接读取同一配置文件并完成编译、上传、监视器打开等操作。

本项目同时包含一个 Arduino 示例草图 `ArduFlux.ino`（ESP32-S3 触摸按键 + WS2812B LED 控制），以及一个测试用 Arduino 项目目录 `test/mus4/`，用于验证配置与上传流程。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| VS Code 扩展 | TypeScript 5.9、Node.js API、VS Code Extension API |
| 构建工具 | `tsc`（TypeScript 编译器）、`vsce`（VSIX 打包工具） |
| 扩展测试 | Mocha + Chai + Sinon（TypeScript 侧单元测试） |
| 上传脚本 | PowerShell (`src/scripts/upload.ps1`)，依赖 `arduino-cli` |
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
│   ├── extension.ts              # 扩展入口：注册命令、状态栏、输出通道、定时刷新
│   ├── editorView.ts             # WebviewViewProvider：侧边栏 Webview 视图提供者
│   ├── webviewController.ts      # Webview 控制器：内联 HTML 生成、消息路由、配置/编译/上传/Profile 操作
│   ├── panel.ts                  # 浮动 WebviewPanel（侧边栏不可用时作为 fallback）
│   ├── configStore.ts            # 配置读写、校验、串口枚举、Profile 管理、参数构建
│   ├── types.ts                  # 类型定义、默认配置、预置板型目录
│   ├── configSidebar.ts          # TreeDataProvider 实现（目前未在 extension.ts 中注册）
│   ├── events.ts                 # 全局 EventEmitter：配置变更事件
│   ├── terminal.ts               # Pseudoterminal 封装：在 VS Code 终端中运行 arduino-cli / PowerShell
│   ├── statusBar.ts              # 状态栏文本格式化纯函数
│   ├── viewIds.ts                # 视图 ID 常量（ARDUFLUX_EDITOR_VIEW_ID = "arduflux.editor"）
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
├── rel/                          # 预构建发布包
│   └── arduflux-0.3.3.vsix
├── test/                         # 测试用 Arduino 项目
│   └── mus4/                     # 示例草图（含 .ino、.cpp、.h 文件）
├── ArduFlux.json                 # 扩展直接读写的配置文件（运行时生成/更新，gitignored）
├── ArduFlux.template.json        # 配置文件模板（含示例端口/目录数据）
├── upload_config.json            # 旧版上传配置（upload.ps1 兼容读取）
├── install-vsix.ps1              # 自动卸载旧扩展并安装最新 VSIX（支持 TRAE / VS Code）
├── ArduFlux.ino                  # Arduino 示例草图
├── package.json                  # VS Code 扩展清单 + npm scripts
├── tsconfig.json                 # TypeScript 严格模式编译配置
└── .vscodeignore                 # VSIX 打包排除规则
```

### 源码模块职责详解

| 文件 | 职责 |
|------|------|
| `extension.ts` | 扩展激活入口。注册所有命令、WebviewViewProvider、状态栏（含编译/上传/监视器快捷图标和动态 spinner）、输出通道、定时刷新（5 秒间隔）。 |
| `editorView.ts` | 实现 `vscode.WebviewViewProvider`，为侧边栏 `arduflux.editor` 视图提供 Webview。处理无工作区时的占位提示，以及视图显隐切换时的状态同步。 |
| `webviewController.ts` | 核心控制器 `ConfigEditorController`。生成完整内联 HTML/CSS/JS（`getHtml`），处理前端 `postMessage`（save-config、compile-sketch、upload-sketch、refresh-ports、Profiles 操作等），调用 `terminal.ts` 执行实际任务。 |
| `panel.ts` | 浮动面板 `ArduFluxPanel`，作为侧边栏不可用时的 fallback。包装同一套 `ConfigEditorController`。 |
| `configStore.ts` | 配置持久化核心。`ConfigStore` 类负责加载/保存 `ArduFlux.json`、配置迁移（`migrateConfig`）、校验（board/port/build/monitor）、串口枚举（带 5 秒缓存）、Profile 增删改查/导入导出。同时导出大量纯工具函数（`buildCompileArgs`、`buildUploadArgs`、`buildMonitorArgs`、`normalizePath`、`validateFqbn`、`deepClone`、`recommendSerialPort` 等）。 |
| `types.ts` | 所有接口定义和默认配置工厂函数 `createDefaultConfig()`。预置板型目录 `DEFAULT_BOARD_CATALOG` 包含 ESP32-S3、ESP32 Dev Module、Arduino Uno、STM32 (Custom FQBN)。 |
| `terminal.ts` | 提供 `runInTerminal`（直接运行 arduino-cli）和 `runUploadScript`（调用 upload.ps1）。均使用 VS Code `Pseudoterminal` 实现，支持进程树强制终止（Ctrl+C）。上传脚本执行成功后，非监视器模式下终端窗口会在 3 秒后自动关闭。 |
| `statusBar.ts` | 仅含 `formatStatusBarText(boardName, portAddress)` 纯函数。 |
| `configSidebar.ts` | 已实现 `ConfigSidebarProvider`（`TreeDataProvider`），但 `extension.ts` 的 `activate()` **未注册**该 Provider。如需启用，需手动调用 `vscode.window.registerTreeDataProvider()`。 |
| `events.ts` | 导出全局 `onDidChangeArduFluxConfig` EventEmitter，用于配置变更时通知状态栏等订阅方刷新。 |
| `viewIds.ts` | 单一常量 `ARDUFLUX_EDITOR_VIEW_ID = "arduflux.editor"`。 |

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
先执行 `npm run compile`，再用 Mocha 运行 `dist/test/**/*.test.js`。当前共 103 个测试用例全部通过。

**测试监视模式：**
```bash
npm run test:watch
```

**打包 VSIX：**
```bash
npm run package
```
生成 `arduflux-<version>.vsix`。`.vscodeignore` 会排除 `src/`、`node_modules/`、`dist/test/`、`docs/`、`AGENTS.md` 等。

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

## 测试策略与测试命令

**TypeScript 单元测试：**
```bash
npm test
```

当前测试覆盖（`src/test/`）共 7 个文件、103 个用例：

| 测试文件 | 覆盖内容 |
|----------|----------|
| `configStore.store.test.ts` | `ConfigStore` 加载/保存、校验（board/monitor/build）、Profile 增删改查、导入导出 |
| `configStore.compile.test.ts` | `buildCompileArgs` / `buildUploadArgs` 参数构建与边界校验 |
| `configStore.feature.test.ts` | `buildMonitorArgs`、串口监视器参数、`execFileText` 执行 |
| `configStore.logic.test.ts` | 纯逻辑函数（`deepClone`、`dedupeKeepLatest`、`normalizePath`、`validateFqbn`、`isUsbPort`、`normalizeSerialAddress`、`mapJsonPortEntry`、`recommendSerialPort`） |
| `statusBar.test.ts` | 状态栏文本格式化 |
| `types.test.ts` | 默认配置、预置板型目录常量 |
| `webviewView.test.ts` | `package.json` 视图声明校验、扩展激活与 WebviewView 注册流程（使用 fake VS Code 模块） |

**测试原则：**
- 所有纯逻辑（参数构造、路径拼接、校验）必须先写单元测试（红→绿）。
- VS Code API 交互（Terminal、StatusBar、Webview）在单元测试通过后集成。
- 快捷键为纯声明式配置，直接修改 `package.json`，无需代码测试。
- 测试中使用 Sinon stub 拦截 `fs.promises` 等外部依赖，`webviewView.test.ts` 通过劫持 `module._load` 注入 fake `vscode` 模块。

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
- `schemaVersion` 用于配置迁移。新增版本时需在 `migrateConfig`（TS）和 PowerShell 侧同样处理旧版本升级逻辑。
- `arduino-cli` 路径默认为 `arduino-cli`，PowerShell 侧同样如此。
- upload.ps1 额外功能：自动解析 `.ino` 文件中的 `#include <...>` 并尝试通过 `arduino-cli lib install` 安装所需外部库（内置系统库已排除）。
- upload.ps1 的上传逻辑支持多端口候选重试（优先使用保存端口，失败时依次尝试其他 USB 端口）。
- upload.ps1 的编译阶段使用后台 Job + 循环流动点动画提供进度反馈。
- upload.ps1 的串口监视器使用 `arduino-cli monitor -p <port> -c baudrate=<rate>` 打开。

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
- 在 `src/configStore.ts` 的 `validateAll` / `buildCurrentConfig` / `migrateConfig` 中处理。
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

**启用/禁用 configSidebar TreeDataProvider**：
- `src/configSidebar.ts` 已实现 `ConfigSidebarProvider`，但当前 `extension.ts` **未注册**该 Provider。
- 如需启用，在 `extension.ts` 的 `activate()` 中调用 `vscode.window.registerTreeDataProvider()` 并传入 `ConfigSidebarProvider` 实例。
