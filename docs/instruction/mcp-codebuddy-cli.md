# CodeBuddy CLI 配置指南

## 前提条件

- CodeBuddy CLI 已安装（`codebuddy --version` 可查看版本）
- 已安装 Node.js ≥ 18.15.0
- **路径选择**：根据你的安装方式选择对应的命令（见下文「安装方式与路径」）

> **注意**：ArduFlux 已发布至 npm（`arduflux`），现在可以直接 `npm install -g arduflux` 全局安装，无需克隆源码。

## 支持的传输类型

CodeBuddy CLI 支持两种 MCP 传输方式：

- **stdio**（推荐）：本地进程间通信，适合 CLI 集成
- **sse**：基于 HTTP 的服务器推送，用于远程通信

## 配置方式

## 安装方式与路径

根据你的 ArduFlux 安装方式，选择对应的命令路径：

| 安装方式 | 命令 | 说明 |
|----------|------|------|
| **npm 全局安装**（推荐） | `arduflux-mcp` | 执行 `npm install -g arduflux` 后全局可用，跨电脑兼容 |
| **本地源码开发** | `node ./dist/mcpServer.js` | 克隆源码后在项目根目录执行，适合开发调试 |
| **VSIX 扩展安装** | 见下方查找脚本 | 路径含版本号，需动态获取 |

### npm 全局安装（推荐，跨电脑兼容）

直接从 npm registry 安装：

```bash
npm install -g arduflux
```

这会注册全局命令 `arduflux-mcp`。

验证：

```bash
arduflux-mcp --help
```

### 本地源码开发

如需从源码运行（开发调试），先克隆项目并编译：

```bash
git clone <repo-url> && cd ArduFlux
npm install && npm run compile
```

然后使用相对路径：

```bash
node ./dist/mcpServer.js --stdio --workspace .
```

### VSIX 扩展安装后查找路径

VS Code / TRAE 安装 VSIX 后，扩展位于扩展目录，路径含版本号：

**PowerShell：**

```powershell
$ardufluxPath = (Get-ChildItem "$env:USERPROFILE\.vscode\extensions\ffedu.arduflux-*\dist\mcpServer.js" | Select-Object -First 1).FullName
Write-Host $ardufluxPath
```

**Bash：**

```bash
ls ~/.vscode/extensions/ffedu.arduflux-*/dist/mcpServer.js | head -1
```

获取到路径后，将其填入下方命令或配置文件中。

---

### 方式一：命令行快速添加（推荐）

使用 `codebuddy mcp add` 命令直接注册 MCP 服务器：

**Bash / zsh / cmd（全局安装方式）：**

```bash
codebuddy mcp add arduflux -s user -- arduflux-mcp "--stdio" "--workspace" "."
```

**Bash / zsh / cmd（本地开发方式）：**

```bash
codebuddy mcp add arduflux -s user -- node "./dist/mcpServer.js" "--stdio" "--workspace" "."
```

**PowerShell（单行，参数用引号包裹）：**

```powershell
codebuddy mcp add arduflux -s user -- arduflux-mcp "--stdio" "--workspace" "."
```

> **⚠️ PowerShell 注意事项**：
> - 必须使用**单行**命令，PowerShell 中 `\` 不是换行符（应使用 backtick `` ` `` 换行，但推荐直接写单行）
> - `--` 后面的参数如果以 `--` 开头（如 `--stdio`），必须用**引号包裹**（`"--stdio"`），否则 PowerShell 会将其解析为运算符导致 `Missing expression after unary operator '--'` 错误

参数说明：
- `arduflux`：MCP 服务器名称，可自定义
- `-s user`：用户级作用域（全局）
- `-s project`：项目级作用域（仅当前目录）
- `--` 之后为实际启动命令和参数

验证是否添加成功：

```bash
codebuddy mcp list
codebuddy mcp get arduflux
```

如需移除：

```bash
codebuddy mcp remove arduflux
```

### 方式二：手动编辑配置文件

CodeBuddy CLI 的配置文件路径：

- **Windows**: `C:\Users\<用户名>\.codebuddy.json`
- **macOS/Linux**: `~/.codebuddy.json`

编辑文件，添加 `mcpServers` 字段：

**npm 全局安装方式（推荐，跨电脑兼容）：**

```json
{
  "mcpServers": {
    "arduflux": {
      "type": "stdio",
      "command": "arduflux-mcp",
      "args": [
        "--stdio",
        "--workspace",
        "."
      ]
    }
  }
}
```

**本地开发方式：**

```json
{
  "mcpServers": {
    "arduflux": {
      "type": "stdio",
      "command": "node",
      "args": [
        "./dist/mcpServer.js",
        "--stdio",
        "--workspace",
        "."
      ]
    }
  }
}
```

保存后重启 CodeBuddy CLI 生效。

### 方式三：WorkBuddy 配置文件

某些版本的 CodeBuddy CLI 使用 WorkBuddy 配置路径：

- **Windows**: `C:\Users\<用户名>\.workbuddy\mcp.json`

```json
{
  "mcpServers": {
    "arduflux": {
      "type": "stdio",
      "command": "node",
      "args": [
        "C:/Dev/OPC/ArduFlux/dist/mcpServer.js",
        "--stdio",
        "--workspace",
        "C:/Dev/OPC/ArduFlux"
      ]
    }
  }
}
```

### 方式四：SSE 模式

如需使用 SSE 模式，先手动启动服务器：

```bash
node dist/mcpServer.js --sse --workspace .
# 记录端口号，如 60503
```

然后通过命令添加：

```bash
codebuddy mcp add arduflux -s user -- \
  npx -y mcp-remote http://127.0.0.1:60503/sse
```

> **注意**：CodeBuddy CLI 原生 SSE 支持可能有限，建议使用 `mcp-remote` 作为 stdio 到 SSE 的桥接。

或在配置文件中直接配置：

```json
{
  "mcpServers": {
    "arduflux": {
      "type": "sse",
      "url": "http://127.0.0.1:60503/sse"
    }
  }
}
```

## 验证连接

1. 启动 CodeBuddy CLI：

```bash
codebuddy
```

2. 输入测试指令：

```
查看当前 ArduFlux 开发板配置
```

CodeBuddy 应自动调用 `arduflux_get_state` 并返回当前 FQBN、串口、编译参数等信息。

3. 也可以测试编译功能：

```
编译当前 Arduino 项目
```

CodeBuddy 将调用 `arduflux_compile` 启动编译任务，并返回任务 ID 供后续查询状态。

## 可用工具清单

| 工具名 | 用途 |
|--------|------|
| `arduflux_get_state` | 获取当前配置、串口列表、板型目录 |
| `arduflux_list_ports` | 刷新并列出可用串口 |
| `arduflux_validate_config` | 校验当前配置合法性 |
| `arduflux_set_config` | 更新配置（FQBN、串口、编译参数等） |
| `arduflux_apply_profile` | 应用已保存的 Profile |
| `arduflux_list_profiles` | 列出所有 Profile |
| `arduflux_save_profile` | 保存当前配置为新 Profile |
| `arduflux_delete_profile` | 删除指定 Profile |
| `arduflux_discover_sketches` | 自动发现工作区中的 `.ino` 文件 |
| `arduflux_compile` | 编译 Sketch（异步任务） |
| `arduflux_upload` | 上传固件（异步任务） |
| `arduflux_get_task_status` | 查询编译/上传任务状态 |
| `arduflux_monitor` | 打开串口监视器 |
| `arduflux_health` | 获取服务器健康状态 |

## 故障排查

- **`codebuddy mcp list` 不显示 arduflux**：检查配置文件路径是否正确（`~/.codebuddy.json` 或 `~/.workbuddy/mcp.json`）；确认 JSON 格式无语法错误
- **添加命令失败**：确保 `--` 后的命令可独立运行；尝试先用完整路径在终端直接执行命令验证
- **stdio 模式无响应**：确认 `arduflux-mcp` 命令可执行（全局安装时）或 `dist/mcpServer.js` 存在（本地开发时）；确认 Node.js 版本 ≥ 18.15.0
- **SSE 模式桥接失败**：确认 `mcp-remote` 已安装（`npm install -g mcp-remote`）；确认服务器端口正确且未被防火墙拦截
- **工具调用报错**：CodeBuddy CLI 的 MCP 功能可能需要特定版本支持；检查 CodeBuddy CLI 是否为最新版
- **路径问题**：Windows 下建议使用正斜杠 `/` 或双反斜杠 `\\`；包含空格的路径需用引号包裹
- **作用域混淆**：`-s user` 为全局配置，`-s project` 仅在当前目录有效；若切换工作目录后工具消失，检查作用域设置
