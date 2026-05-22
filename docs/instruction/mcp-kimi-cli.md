# Kimi Code CLI 配置指南

## 前提条件

- Kimi Code CLI 已安装（`kimi --version` 可查看版本，建议 ≥ 1.8.0）
- 已安装 Node.js ≥ 18
- **路径选择**：根据你的安装方式选择对应的命令（见下文「安装方式与路径」）

> **注意**：ArduFlux 已发布至 npm（`arduflux`），现在可以直接 `npm install -g arduflux` 全局安装，无需克隆源码。

## 支持的传输类型

Kimi Code CLI 支持三种 MCP 传输方式：

- **stdio**（推荐）：本地进程间通信，每次会话自动启动服务器
- **http**：Streamable HTTP 远程连接
- **sse**：传统 SSE 推送（兼容旧版服务器）

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
$ardufluxPath = (Get-ChildItem "$env:USERPROFILE\.vscode\extensions\FFEdu.arduflux-*\dist\mcpServer.js" | Select-Object -First 1).FullName
Write-Host $ardufluxPath
```

**Bash：**

```bash
ls ~/.vscode/extensions/FFEdu.arduflux-*/dist/mcpServer.js | head -1
```

获取到路径后，将其填入下方命令或配置文件中。

---

### 方式一：命令行快速添加（推荐）

使用 `kimi mcp add` 命令直接注册 MCP 服务器：

**Bash / zsh / cmd（全局安装方式）：**

```bash
kimi mcp add --transport stdio arduflux -- arduflux-mcp "--stdio" "--workspace" "."
```

**Bash / zsh / cmd（本地开发方式）：**

```bash
kimi mcp add --transport stdio arduflux -- node "./dist/mcpServer.js" "--stdio" "--workspace" "."
```

**PowerShell（单行，参数用引号包裹）：**

```powershell
kimi mcp add --transport stdio arduflux -- arduflux-mcp "--stdio" "--workspace" "."
```

> **⚠️ PowerShell 注意事项**：
> - 必须使用**单行**命令，PowerShell 中 `\` 不是换行符（应使用 backtick `` ` `` 换行，但推荐直接写单行）
> - `--` 后面的参数如果以 `--` 开头（如 `--stdio`），必须用**引号包裹**（`"--stdio"`），否则 PowerShell 会将其解析为运算符导致 `Missing expression after unary operator '--'` 错误

验证是否添加成功：

```bash
kimi mcp list
kimi mcp test arduflux
```

#### HTTP 模式

如需连接远程或已启动的 HTTP 服务器：

```bash
kimi mcp add --transport http arduflux http://127.0.0.1:60503/mcp
```

带请求头（如需要 API Key）：

```bash
kimi mcp add --transport http arduflux http://127.0.0.1:60503/mcp --header "Authorization: Bearer your-token"
```

#### OAuth 授权模式

如果服务器需要 OAuth 认证：

```bash
kimi mcp add --transport http --auth oauth arduflux https://example.com/mcp
kimi mcp auth arduflux
```

第二条命令会打开浏览器完成 OAuth 授权流程。

### 方式二：用户级配置文件

编辑 Kimi CLI 的 MCP 配置文件 `~/.kimi/mcp.json`：

**npm 全局安装方式（推荐，跨电脑兼容）：**

```json
{
  "mcpServers": {
    "arduflux": {
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

修改后启动 Kimi CLI 时自动加载。

### 方式三：临时配置文件

使用 `--mcp-config-file` 参数指定临时配置：

```bash
kimi --mcp-config-file /path/to/arduflux-mcp.json
```

或直接在命令行传入 JSON：

```bash
kimi --mcp-config '{"mcpServers":{"arduflux":{"command":"node","args":["C:/Dev/OPC/ArduFlux/dist/mcpServer.js","--stdio","--workspace","C:/Dev/OPC/ArduFlux"]}}}'
```

### 方式四：SSE 模式

如需使用 SSE 模式（兼容旧版服务器）：

```bash
kimi mcp add --transport http arduflux http://127.0.0.1:60503/sse
```

> **注意**：Kimi CLI 的 `--transport http` 同时兼容 Streamable HTTP 和传统 SSE，具体行为由服务器端点决定。

## 验证连接

1. 启动 Kimi CLI：

```bash
kimi
```

2. 在对话中输入 `/mcp`，查看已连接的 MCP 服务器列表
3. 确认 `arduflux` 状态为已连接，下方显示可用的 `arduflux_*` 工具
4. 输入测试指令：

```
查看当前开发板配置状态
```

Kimi 应自动调用 `arduflux_get_state` 并返回当前 FQBN、串口等信息。

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

- **`/mcp` 不显示 arduflux**：执行 `kimi mcp list` 查看状态；若显示未连接，执行 `kimi mcp test arduflux` 查看详细错误
- **"Server is already initialized" 错误**：某些版本（如 1.8.0）在 ACP/Wire 模式下可能重复初始化同一服务器，升级 Kimi CLI 到最新版
- **stdio 模式无响应**：确认 `arduflux-mcp` 命令可执行（全局安装时）或 `dist/mcpServer.js` 存在（本地开发时）；检查 Node.js 版本 ≥ 18
- **HTTP 模式连接超时**：确认服务器已启动且端口正确；检查防火墙是否拦截；尝试使用 `127.0.0.1` 而非 `localhost`
- **OAuth 授权失败**：OAuth token 存储在 `~/.kimi/mcp-oauth/`；如升级后 token 失效，重新执行 `kimi mcp auth arduflux`
- **工具调用无结果**：Kimi CLI 的 MCP 工具异步初始化，启动后稍等几秒再试；状态栏会显示连接进度
- **路径问题**：Windows 下建议使用正斜杠 `/` 或双反斜杠 `\\`；避免包含空格的路径，必要时用引号包裹
