# AGENTS.md — Embedded Board Config

> 本文件面向 AI 编码助手。阅读者应被假设为**完全不了解本项目**。

---

## 项目概述

本项目是一个 **VS Code 扩展**，用于管理嵌入式开发板配置。扩展直接读写工作区根目录下的 `embedded_board_config.json`，管理内容包括：

- 板子型号（名称、FQBN、编译参数、引脚定义）
- 串口（枚举、自动选择、USB 优先、占用检测）
- 编译输出目录及最近使用路径
- 串口监视器参数（波特率、数据位、停止位、校验位、换行符）
- Profiles（保存、应用、删除、导入、导出）

扩展的数据格式与项目原有的 `upload.ps1` PowerShell 上传脚本保持兼容，因此该脚本无需修改即可继续读取同一配置文件。

此外，项目中还保留了一套 Python 实现的 `embedded_config` 模块（含 tkinter GUI 与 CLI），作为扩展上线前的原型实现，目前仍在维护。

本项目同时包含一个 Arduino 示例草图 `TouchButton.ino`（ESP32-S3 触摸按键 + WS2812B LED 控制），用于验证配置与上传流程。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| VS Code 扩展 | TypeScript 5.9、Node.js API、VS Code Extension API |
| 构建工具 | `tsc`（TypeScript 编译器）、`vsce`（VSIX 打包工具） |
| 扩展测试 | Mocha + Chai + Sinon（TypeScript 侧单元测试） |
| 遗留工具 | Python 3.12+（`tkinter` GUI + `argparse` CLI） |
| Python 测试 | `unittest` |
| 上传脚本 | PowerShell (`upload.ps1`)，依赖 `arduino-cli` |
| 嵌入式固件 | Arduino C++ (`TouchButton.ino`) |

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
│   ├── terminal.ts               # Pseudoterminal 封装：在 VS Code 终端中运行 arduino-cli
│   ├── statusBar.ts              # 状态栏文本格式化
│   ├── viewIds.ts                # 视图 ID 常量
│   └── test/                     # TypeScript 单元测试（Mocha/Chai/Sinon）
│       ├── configStore.store.test.ts
│       ├── configStore.compile.test.ts
│       ├── configStore.feature.test.ts
│       ├── configStore.logic.test.ts
│       ├── statusBar.test.ts
│       ├── types.test.ts
│       └── webviewView.test.ts
├── dist/                         # tsc 编译输出（CommonJS + source map）
├── embedded_config/              # Python 配置管理模块（遗留但维护中）
│   ├── __init__.py
│   ├── config.py                 # ConfigStore 核心逻辑、串口工具
│   ├── cli.py                    # 命令行入口 `python -m embedded_config.cli`
│   └── ui.py                     # tkinter GUI `python -m embedded_config.ui`
├── tests/                        # Python 单元测试
│   ├── __init__.py
│   └── test_config.py
├── docs/                         # 项目级技术文档
│   ├── embedded_config.md        # Python 配置模块使用说明
│   ├── roadmap-phase6-8.md       # 扩展功能开发路线图
│   └── tdd-dev-plan.md           # TDD 开发方案与实施记录
├── embedded_board_config.json    # 扩展直接读写的配置文件（运行时生成/更新）
├── embedded_board_config.template.json  # 配置文件模板
├── upload.ps1                    # PowerShell 上传脚本（读取上述 JSON）
├── upload_config.json            # 旧版上传配置（upload.ps1 兼容读取）
├── install-vsix.ps1              # 自动卸载旧扩展并安装最新 VSIX（支持 TRAE / VS Code）
├── TouchButton.ino               # Arduino 示例草图
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
生成 `embedded-board-config-<version>.vsix`。

**自动安装 VSIX（PowerShell）：**
```bash
npm run install:vsix        # 自动检测 TRAE / VS Code
npm run install:vsix:trae   # 强制使用 TRAE
npm run install:vsix:code   # 强制使用 VS Code
```
底层调用 `install-vsix.ps1`，会先卸载旧版本扩展再安装并提示重新加载窗口。

**手动安装扩展：**
在 VS Code / TRAE 扩展视图 → `...` → `Install from VSIX...` 选择生成的 `.vsix` 文件。


## 测试命令

**TypeScript 单元测试：**
```bash
npm test
```

当前测试覆盖（`src/test/`）：
- `configStore.store.test.ts`：ConfigStore 加载/保存、校验（board/monitor/build）、Profile 增删改查、导入导出
- `configStore.compile.test.ts`：`buildCompileArgs` / `buildUploadArgs` 参数构建与边界校验
- `configStore.feature.test.ts` / `configStore.logic.test.ts`：其他业务逻辑
- `statusBar.test.ts`：状态栏文本格式化
- `types.test.ts`：默认配置、预置板型目录常量
- `webviewView.test.ts`：package.json 视图声明校验、扩展激活与 WebviewView 注册流程

**Python 单元测试：**
```bash
python -m unittest discover -s tests -v
```

当前测试覆盖：
- `ConfigStore` 默认值加载
- 路径规范化
- 输出目录最近 5 条去重
- Profile 保存/应用/回环
- Profile 导出/导入
- FQBN 校验
- 串口 JSON 多格式解析
- 串口推荐策略

---

## 代码风格与开发约定

### TypeScript 侧
- 使用 **严格模式**（`strict: true`），禁止隐式 `any`。
- 目标 `ES2020`，输出 `CommonJS`。
- 源码放在 `src/`，编译输出到 `dist/`。
- 错误处理使用自定义 `ValidationError`，携带 `message` 和可选的 `suggestion`（建议）。
- Webview 使用内联 HTML（非外部文件），通过 `nonce` 设置 CSP。
- 所有 VS Code 命令必须在 `package.json` 的 `contributes.commands` 中注册。
- `arduino-cli` 命令通过 `terminal.ts` 的 Pseudoterminal 运行，设置 `shell: false`，避免注入。

### Python 侧
- 使用 `from __future__ import annotations` 保持前向兼容。
- 配置校验异常使用 `ValidationError(message, suggestion)`。
- `ConfigStore` 支持依赖注入 `runner`，方便单元测试 mock `subprocess.run`。
- 串口地址规范化：`COM` 前缀统一大写（`COM36`）。
- JSON 读写使用 `utf-8`（读取兼容 `utf-8-sig`）。

### 文档约定
- `docs/` 仅存放与项目直接相关的技术文档（配置说明、开发计划、路线图等）。
- 不存放通用规范、外部标准或用户操作手册——此类内容应通过链接引用，避免冗余。
- 文档命名优先使用 **kebab-case**（如 `tdd-dev-plan.md`）；与代码包/模块强对应的文档可保持同名（如 `embedded_config.md`）。
- 文档采用 Markdown 格式，保持轻量，聚焦本项目的实现细节与决策记录。

### 配置文件格式约定
- 文件名固定为 `embedded_board_config.json`。
- 顶层字段：`schemaVersion`（当前为 `1`）、`current`、`profiles`。
- `profiles` 始终包含 `default: {}`。
- `recentOutputDirs` 最多保留 5 条，去重且保留最新。
- 引脚定义 `pinDefines` 必须是 JSON 对象（`dict`），不能是数组或标量。

---

## 扩展命令清单

| 命令 ID | 标题/快捷键 | 说明 |
|---------|-------------|------|
| `embeddedBoardConfig.openPanel` | `Embedded Board Config: Open Panel`（`Ctrl+Alt+E`） | 打开侧边栏 Webview 配置面板 |
| `embeddedBoardConfig.validateConfig` | `Embedded Board Config: Validate Current Config`（`Ctrl+Alt+V`） | 校验当前配置 |
| `embeddedBoardConfig.openConfigFile` | `Embedded Board Config: Open Config File` | 在编辑器中打开 JSON 配置文件 |
| `embeddedBoardConfig.compileSketch` | `Embedded Board Config: Compile Sketch`（`Ctrl+Shift+B`） | 编译 Sketch（聚焦面板后执行） |
| `embeddedBoardConfig.uploadSketch` | `Embedded Board Config: Upload Sketch`（`Ctrl+Shift+U`） | 上传 Sketch（聚焦面板后执行） |
| `embeddedBoardConfig.refreshSidebar` | `Embedded Board Config: Refresh Sidebar`（刷新图标） | 手动刷新侧边栏视图状态 |
| `embeddedBoardConfig.openMonitor` | — | 打开串口监视器终端 |
| `embeddedBoardConfig.compileSketchSilent` | — | 静默编译（状态栏按钮直接调用） |
| `embeddedBoardConfig.uploadSketchSilent` | — | 静默上传（状态栏按钮直接调用） |

> 注：`compileSketch` / `uploadSketch` 会先聚焦侧边栏视图，再调用对应的 `Silent` 版本。

---

## 与 upload.ps1 的兼容性要求

`upload.ps1` 和 VS Code 扩展共享同一个 `embedded_board_config.json`。任何对 JSON 结构或字段名的修改，必须同时更新以下文件：

1. `src/types.ts`（TypeScript 类型定义）
2. `src/configStore.ts`（扩展读写逻辑）
3. `embedded_config/config.py`（Python 读写逻辑）
4. `upload.ps1`（PowerShell 解析逻辑）

特别注意事项：
- `schemaVersion` 用于配置迁移。新增版本时需在 `migrateConfig`（TS）和 `_migrate`（Python）中处理旧版本升级逻辑。
- `arduino-cli` 路径默认为 `arduino-cli`，PowerShell 侧同样如此。

---

## 安全注意事项

- **路径安全**：用户输入的输出目录会经过规范化（`normalizePath` / `normalize_path`），相对路径基于项目根目录解析，避免目录穿越。
- **环境变量展开**：Windows 路径支持 `%ENVVAR%` 展开（Python 侧用 `os.path.expandvars`），但仅用于已知配置项（`outputDir`）。
- **CSP**：Webview 启用 `Content-Security-Policy`，脚本源限制为 `nonce-${nonce}`，禁止内联事件处理器以外的任意脚本注入。
- **JSON 注入**：Webview 的初始状态通过 `JSON.stringify` 后替换 `<>&` 为 Unicode 转义序列，避免 HTML 注入。
- **终端执行**：`terminal.ts` 使用 `spawn` 且 `shell: false`，参数以数组传递，降低命令注入风险。
- **串口占用检测**：Python 侧 `is_port_busy` 尝试打开串口设备判断占用状态（Windows 使用 `ctypes` + `CreateFileW`），仅用于提示，不作为上传阻塞条件。

---

## 常见修改场景指引

**新增预置板型**：
- 修改 `src/types.ts` 中的 `DEFAULT_BOARD_CATALOG`。
- 同步修改 `embedded_config/config.py` 中的 `DEFAULT_BOARD_CATALOG`。

**新增配置字段**：
- 在 `src/types.ts` 中扩展对应接口。
- 在 `src/configStore.ts` 的 `validateAll` / `buildCurrentConfig` 中处理。
- 在 `embedded_config/config.py` 的 `ConfigStore` 中同步。
- 在 `upload.ps1` 的读取/保存段落中添加映射。
- 在 `src/webviewController.ts` 的 Webview HTML 中添加 UI 控件与消息处理。

**修改 Webview UI**：
- UI 完全内联在 `src/webviewController.ts` 的 `getHtml` 方法中（HTML + CSS + JavaScript）。
- 前端与后端通过 `vscode.postMessage` / `panel.webview.onDidReceiveMessage` 通信。
- 新增消息类型时，需在 `handleMessage` switch 中添加分支，并在前端 `postMessage` 中发送对应类型。

**修改 TypeScript 测试**：
- 测试文件位于 `src/test/*.test.ts`。
- 使用 Chai (`expect`) + Sinon（stub/mock）。
- 运行方式：`npm test`。

**修改 Python 测试**：
- 测试文件为 `tests/test_config.py`。
- 使用 `_Runner` mock `subprocess.run`，模拟 `arduino-cli board list` 的 JSON/文本输出。
