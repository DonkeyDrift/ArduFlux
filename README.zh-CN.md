[English](README.md) | 中文

# ArduFlux

VS Code 扩展，针对 Arduino 系列主板（UNO、Nano、ESP32、ESP8266 等）提供全流程开发支持，管理开发板配置（板型、串口、编译参数、串口监视器、Profiles）。

## 项目仓库

- **官方主仓库（GitHub）**：[DonkeyDrift/ArduFlux](https://github.com/DonkeyDrift/ArduFlux) — 项目主仓库，接受 Issue、Fork、Pull Request 等所有协作功能，所有贡献请提交到这里。
- **镜像仓库（Gitee）**：[donkeydrift/ArduFlux](https://gitee.com/donkeydrift/ArduFlux) — 仅为国内用户提供访问加速的只读镜像，只提供下载功能，不接受 Issue、Fork、Pull Request 等其他功能。

## 功能特性

- **配置管理**：可视化编辑 `ArduFlux.json` 配置文件
- **板型配置**：选择预置板型（Arduino UNO、Nano、ESP32-S3、ESP32-C3、ESP8266 等），自定义 FQBN、编译参数、引脚定义
- **串口管理**：自动枚举串口，优先推荐 USB 端口，检测端口占用
- **编译上传**：集成 arduino-cli 编译、上传功能
- **串口监视器**：配置波特率、数据位、停止位、校验位、换行符
- **Profiles**：保存、应用、删除、导入、导出配置方案
- **状态显示**：VS Code 状态栏实时显示当前配置

## 前置要求

使用前请确保已安装：

1. **VS Code 或 TRAE IDE** - 版本 ≥ 1.90.0
2. **arduino-cli** - 用于编译和上传 Arduino 固件
3. **Node.js** - 用于本地开发（仅开发时需要）

### 安装 arduino-cli

Windows 用户可通过以下方式安装：

```powershell
# 使用 scoop 安装
scoop install arduino-cli

# 或手动下载：https://arduino.github.io/arduino-cli/latest/installation/
```

安装后验证：
```bash
arduino-cli version
```

## 安装扩展

### 方式一：扩展市场安装（推荐）

直接从 IDE 的扩展市场安装：

- **VS Code Marketplace**：[DonkeyDrift.arduflux](https://marketplace.visualstudio.com/items?itemName=DonkeyDrift.arduflux)
- **Open VSX Registry**：[DonkeyDrift.arduflux](https://open-vsx.org/extension/DonkeyDrift/arduflux)

安装步骤：
1. 打开扩展视图（`Ctrl+Shift+X`）
2. 搜索 `ArduFlux`
3. 点击**安装**即可

### 方式二：自动脚本安装

在项目根目录执行 PowerShell 脚本：

```powershell
# 自动检测 IDE（TRAE 优先）
npm run install:vsix

# 强制使用 TRAE
npm run install:vsix:trae

# 强制使用 VS Code
npm run install:vsix:code
```

脚本会自动：
1. 卸载旧版本扩展（如果存在）
2. 安装最新 VSIX 包
3. 提示重新加载窗口

### 方式三：手动安装 VSIX

1. 先打包生成 VSIX 文件：
   ```bash
   npm run package
   ```
   生成文件类似 `arduflux-0.3.3.vsix`

2. 在 VS Code / TRAE 中安装：
   - 打开扩展视图（`Ctrl+Shift+X`）
   - 点击右上角 `...`
   - 选择 `Install from VSIX...`
   - 选择生成的 `.vsix` 文件

3. 重新加载窗口使扩展生效

### 方式四：CLI 全局安装（供 Kimi Code / Claude Code / MCP 使用）

```bash
npm install -g arduflux
```

安装后全局可用 `arduflux-mcp` 命令，用于通过 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 与 AI 客户端（如 Kimi Code、Claude Desktop、Cursor）交互。

#### 配置 Kimi Code

```bash
kimi mcp add --transport stdio arduflux -- arduflux-mcp "--stdio" "--workspace" "."
kimi mcp test arduflux
```

启动 Kimi Code 后输入 `/mcp` 即可看到 `arduflux` 及 14 个可用工具（如 `arduflux_get_state`、`arduflux_compile`、`arduflux_upload` 等）。

#### 配置 Claude Code

```bash
claude mcp add --transport stdio --scope user arduflux -- arduflux-mcp "--stdio" "--workspace" "."
claude mcp get arduflux
```

启动 `claude` 后输入 `/mcp` 即可看到 `arduflux` 及 14 个可用工具。

> 如果不想全局安装，也可以直接 `npx arduflux-mcp --stdio --workspace .`

### 方式五：本地开发模式

详见【本地开发】章节。

## 使用方法

### 1. 打开配置面板

有三种方式打开配置面板：

- **快捷键**：`Ctrl+Alt+E`（Mac: `Cmd+Alt+E`）
- **命令面板**：按 `F1` 或 `Ctrl+Shift+P`，输入 `ArduFlux: 打开面板`
- **活动栏**：点击左侧边栏「ArduFlux」图标（电路板图标）

### 2. 基本配置流程

配置面板分为以下几个区域：

#### 板型配置
- **选择板型**：从下拉列表选择预置板型（如 ESP32-S3、ESP32-C3 等）
- **自定义 FQBN**：手动输入完全限定板名（如 `esp32:esp32:esp32s3`）
- **编译参数**：添加额外的编译参数（如 `-DDEBUG=1`）
- **引脚定义**：JSON 格式配置引脚映射

#### 串口配置
- **自动选择**：勾选「自动选择」后，扩展会扫描并推荐 USB 串口
- **手动选择**：从下拉列表选择可用串口
- **端口检测**：自动检测端口是否被占用

#### 编译配置
- **输出目录**：设置编译输出目录（默认 `build`）
- **最近使用**：快速选择最近使用的输出目录（最多保留 5 条）

#### 串口监视器
- **波特率**：常见选项（9600、19200、38400、57600、115200、230400、460800、921600）
- **数据位**：5-8 位（默认 8）
- **停止位**：1、1.5、2（默认 1）
- **校验位**：无、奇、偶、标记、空格（默认无）
- **换行符**：CR、LF、CRLF、无（默认 CRLF）

### 3. 编译和上传

#### 使用扩展命令

- **编译**：`Ctrl+Shift+B` 或 命令 `ArduFlux: 编译 Sketch`
- **上传**：`Ctrl+Shift+U` 或 命令 `ArduFlux: 上传 Sketch`

#### 使用上传核心（跨平台）

- **完整流程（编译+上传+监视）**：`ArduFlux: 完整编译+上传+监视（脚本）`
- **仅编译**：`ArduFlux: 仅编译（脚本）`
- **仅上传+监视**：`ArduFlux: 仅上传+监视（脚本）`

这些命令调用 Node.js 实现的跨平台上传核心（`src/uploader/`），支持 Windows / macOS / Linux，具备库自动安装、多端口重试等功能。

### 4. Profiles 管理

Profiles 允许你保存多套配置方案：

- **保存当前为 Profile**：输入名称保存当前配置
- **应用 Profile**：从列表选择，一键切换配置
- **删除 Profile**：删除不再需要的配置方案
- **导出 Profile**：将配置导出为 JSON 文件，便于分享
- **导入 Profile**：从 JSON 文件导入配置

### 5. 其他功能

#### 校验配置
命令：`ArduFlux: 校验当前配置`
检查配置是否完整有效，输出错误和建议。

#### 打开配置文件
命令：`ArduFlux: 打开配置文件`
在编辑器中直接打开 `ArduFlux.json` 进行手动编辑。

#### 刷新视图
点击面板标题栏的刷新图标，重新加载配置状态。

## 命令清单

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| `ArduFlux: 打开面板` | `Ctrl+Alt+E` | 打开侧边栏配置面板 |
| `ArduFlux: 校验当前配置` | `Ctrl+Alt+V` | 校验配置有效性 |
| `ArduFlux: 打开配置文件` | - | 在编辑器中打开 JSON 配置 |
| `ArduFlux: 编译 Sketch` | `Ctrl+Shift+B` | 编译当前 Sketch |
| `ArduFlux: 上传 Sketch` | `Ctrl+Shift+U` | 上传固件到开发板 |
| `ArduFlux: 刷新侧边栏` | - | 刷新视图状态 |
| `ArduFlux: 完整编译+上传+监视（脚本）` | - | 调用 Node.js 上传核心完整流程 |
| `ArduFlux: 仅编译（脚本）` | - | 调用 Node.js 上传核心仅编译 |
| `ArduFlux: 仅上传+监视（脚本）` | - | 调用 Node.js 上传核心仅上传 |

## 配置文件说明

扩展使用 `ArduFlux.json` 作为配置文件，位于工作区根目录：

```json
{
  "schemaVersion": 1,
  "current": {
    "board": {
      "name": "ESP32-S3 (Generic)",
      "fqbn": "esp32:esp32:esp32s3",
      "compileArgs": [],
      "pinDefines": {
        "ws2812_pin": 48
      }
    },
    "port": {
      "address": "COM36",
      "auto": true
    },
    "build": {
      "outputDir": "build",
      "recentOutputDirs": ["build"]
    },
    "monitor": {
      "enabled": true,
      "baudRate": 115200,
      "dataBits": 8,
      "stopBits": 1,
      "parity": "none",
      "newline": "CRLF"
    }
  },
  "profiles": {
    "default": {}
  }
}
```

### 重要说明

- `schemaVersion` 用于配置迁移，请勿手动修改
- `profiles` 始终包含 `default` 配置
- `recentOutputDirs` 自动去重并保留最近 5 条
- `pinDefines` 必须是 JSON 对象格式

## 本地开发

### 环境搭建

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run compile

# 监视模式（自动重新编译）
npm run watch
```

### 调试扩展

1. 在 VS Code 中打开项目
2. 按 `F5` 启动扩展开发宿主
3. 在新窗口中测试扩展功能

### 运行测试

```bash
# TypeScript 单元测试
npm test

# 测试监视模式
npm run test:watch

# Python 单元测试（遗留工具）
python -m unittest discover -s tests -v
```

### 打包 VSIX

```bash
npm run package
```

生成文件位于项目根目录，命名格式 `arduflux-<version>.vsix`。

## 项目结构

```
.
├── src/                          # VS Code 扩展源码（TypeScript）
│   ├── extension.ts              # 扩展入口：注册命令、状态栏等
│   ├── editorView.ts             # 侧边栏 Webview 视图提供者
│   ├── webviewController.ts      # Webview 控制器：UI、消息路由
│   ├── configStore.ts            # 配置读写、校验、串口枚举
│   ├── types.ts                  # 类型定义、预置板型
│   ├── terminal.ts               # Pseudoterminal 封装
│   ├── statusBar.ts              # 状态栏文本格式化
│   └── test/                     # TypeScript 单元测试
├── dist/                         # 编译输出（CommonJS）
├── embedded_config/              # Python 遗留配置工具（维护中）
├── tests/                        # Python 单元测试
├── docs/                         # 技术文档
├── ArduFlux.json                 # 运行时配置文件
├── ArduFlux.template.json        # 配置文件模板
├── install-vsix.ps1              # 自动安装脚本
├── package.json                  # 扩展清单 + npm scripts
└── tsconfig.json                 # TypeScript 编译配置
```

## 常见问题

### Q: 扩展安装后找不到命令？
A: 请重新加载窗口（`Ctrl+Shift+P` → `Reload Window`）。

### Q: 串口列表为空？
A: 检查设备是否连接，驱动是否安装正确，然后点击刷新。

### Q: 编译提示 arduino-cli 未找到？
A: 确保 arduino-cli 已安装并在系统 PATH 中，或重启 IDE。

### Q: 修改 ArduFlux.json 后面板没更新？
A: 点击面板标题栏的刷新图标，或重新打开面板。

### Q: 如何回滚到默认配置？
A: 应用 `default` Profile 即可恢复。

## 贡献指南

请参阅 [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md) 了解贡献规范。

## 许可证

MIT
