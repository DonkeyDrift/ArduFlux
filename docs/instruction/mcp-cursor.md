# Cursor 配置指南

## 前提条件

- 已安装 [Cursor](https://www.cursor.com/)
- 已安装 Node.js ≥ 18
- 以下任一安装方式：
  - **推荐**：`npm install -g arduflux`（直接从 npm 安装）
  - 或已安装 VS Code 扩展 **ArduFlux**
  - 或已克隆本项目并执行 `npm install && npm run compile`

## 配置方式（stdio 模式）

Cursor 支持在项目级或全局配置 MCP 服务器。推荐在项目根目录创建 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "arduflux": {
      "command": "node",
      "args": [
        "C:\\Dev\\OPC\\ArduFlux\\dist\\mcpServer.js",
        "--stdio",
        "--workspace",
        "${workspaceFolder}"
      ]
    }
  }
}
```

> **注意**：Cursor 支持 `${workspaceFolder}` 变量，可自动解析为当前打开的项目目录。如果变量不生效，请替换为绝对路径。

### npm 全局安装方式（推荐）

如果你已通过 `npm install -g arduflux` 安装了 ArduFlux，可以使用更简洁的配置：

**项目级配置**（`.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "arduflux": {
      "command": "arduflux-mcp",
      "args": [
        "--stdio",
        "--workspace",
        "${workspaceFolder}"
      ]
    }
  }
}
```

**全局配置**：

```json
{
  "mcpServers": {
    "arduflux": {
      "command": "arduflux-mcp",
      "args": [
        "--stdio",
        "--workspace",
        "C:\\Dev\\OPC\\ArduFlux"
      ]
    }
  }
}
```

## 全局配置（本地源码方式，可选）

若希望在所有项目中使用 ArduFlux MCP，可编辑全局配置：

- **Windows**: `%USERPROFILE%\.cursor\mcp.json`
- **macOS/Linux**: `~/.cursor/mcp.json`

全局配置示例：

```json
{
  "mcpServers": {
    "arduflux": {
      "command": "node",
      "args": [
        "C:\\Dev\\OPC\\ArduFlux\\dist\\mcpServer.js",
        "--stdio",
        "--workspace",
        "C:\\Dev\\OPC\\ArduFlux"
      ]
    }
  }
}
```

## 验证连接

1. 保存配置文件
2. 在 Cursor 中按 `Ctrl+Shift+P`（或 `Cmd+Shift+P`）打开命令面板
3. 运行 `MCP: Refresh Servers`
4. 打开 AI 对话框，工具列表中应出现 `arduflux_*` 工具

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

- **命令未找到**：确保 `node` 在系统 PATH 中，或使用绝对路径
- **路径变量不生效**：将 `${workspaceFolder}` 替换为实际绝对路径
- **工具不显示**：保存配置后运行 `MCP: Refresh Servers`
