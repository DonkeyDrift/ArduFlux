# Claude Code (CLI) 配置指南

## 前提条件

- Claude Code CLI 已安装（`claude --version` 可查看版本）
- 已安装 Node.js ≥ 18
- 项目已执行 `npm install && npm run compile`

## 支持的传输类型

Claude Code CLI 支持两种 MCP 传输方式：

- **stdio**（推荐）：本地进程间通信，每次会话自动启动服务器
- **http**：直接连接远程 Streamable HTTP 服务器（v2.0+ 支持）

## 配置方式

### 方式一：命令行快速添加（推荐）

使用 `claude mcp add` 命令直接注册 MCP 服务器：

```bash
# stdio 模式（推荐）
claude mcp add --transport stdio --scope user arduflux -- \
  node "C:/Dev/OPC/ArduFlux/dist/mcpServer.js" \
  --stdio --workspace "C:/Dev/OPC/ArduFlux"
```

参数说明：
- `--transport stdio`：指定传输类型为 stdio
- `--scope user`：作用域为全局用户级（也可使用 `--scope project` 项目级）
- `arduflux`：MCP 服务器名称，可自定义
- `--` 之后为实际启动命令和参数

验证是否添加成功：

```bash
claude mcp list
claude mcp get arduflux
```

如果需要重新连接：

```bash
claude mcp reconnect arduflux
```

### 方式二：用户级配置文件

编辑 Claude Code 用户配置文件：

- **macOS**: `~/.config/claude-code/mcp.json`
- **Windows**: `%APPDATA%\claude-code\mcp.json`
- **Linux**: `~/.config/claude-code/mcp.json`

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

修改后执行：

```bash
claude mcp reconnect arduflux
```

### 方式三：项目级配置文件

在项目根目录创建 `.mcp.json`：

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

在项目目录内启动 `claude` 时自动加载。

### 方式四：HTTP 模式（Streamable HTTP）

Claude Code CLI v2.0+ 支持直接连接 Streamable HTTP 服务器。先启动 SSE 服务：

```bash
node dist/mcpServer.js --sse --workspace .
# 记录端口号，如 60503
```

然后通过 HTTP 方式添加：

```bash
claude mcp add --transport http --scope user arduflux http://127.0.0.1:60503/mcp
```

或在 `~/.claude/settings.json` 中配置：

```json
{
  "mcpServers": {
    "arduflux": {
      "type": "http",
      "url": "http://127.0.0.1:60503/mcp"
    }
  }
}
```

> **注意**：Claude Code CLI 的 HTTP 模式直接支持 Streamable HTTP，无需 `mcp-remote` 桥接。但 Claude Desktop 暂不支持原生 HTTP，需要 stdio 桥接。

## 权限配置

如果 Claude Code 报告工具不可用或权限被拒绝，检查 `~/.claude/settings.json`：

```json
{
  "permissions": {
    "allow": ["mcp__arduflux"]
  }
}
```

或使用 `--dangerously-skip-permissions` 启动（开发调试用）：

```bash
claude --dangerously-skip-permissions
```

## 验证连接

1. 启动 Claude Code：

```bash
claude
```

2. 在对话中输入 `/mcp`，确认 `arduflux` 显示为已连接状态
3. 输入自然语言指令测试：

```
查看当前 ArduFlux 开发板配置状态
```

Claude 应自动调用 `arduflux_get_state` 并返回配置信息。

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

- **`/mcp` 不显示 arduflux**：执行 `claude mcp list` 查看注册状态；若显示 `Failed to connect`，检查 `dist/mcpServer.js` 是否存在
- **工具调用报错 "No such tool available"**：检查 `~/.claude/settings.json` 权限配置；确保 MCP 服务器已成功初始化（查看服务器日志）
- **多个 MCP 服务器只有一个能连接**：Claude Code CLI 某些版本存在多 stdio 服务器竞争问题，尝试单独使用 `arduflux`
- **HTTP 模式返回 406**：确认服务器端点 URL 正确（`/mcp` 而非 `/sse`）；Claude Code CLI 对 Streamable HTTP 的支持可能要求特定版本
- **企业/托管配置冲突**：如果存在 `/etc/claude-code/managed-mcp.json` 等企业级配置，CLI 可能禁止动态添加用户级 MCP，需联系管理员
- **路径问题**：Windows 下建议使用正斜杠 `/` 或双反斜杠 `\\`；相对路径仅在项目级配置中有效
