# Claude Desktop 配置指南

## 前提条件

- 已安装 [Claude Desktop](https://claude.ai/download)
- 已安装 Node.js ≥ 18
- 以下任一安装方式：
  - **推荐**：`npm install -g arduflux`（直接从 npm 安装）
  - 或已安装 VS Code 扩展 **ArduFlux**
  - 或已克隆本项目并执行 `npm install && npm run compile`

## 配置方式（stdio 模式）

Claude Desktop 通过 stdio 与 MCP 服务器通信。你需要编辑 Claude Desktop 的配置文件：

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

## 配置示例

### 方式一：npm 全局安装（推荐）

如果你已通过 `npm install -g arduflux` 安装了 ArduFlux：

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

### 方式二：本地源码 / VSIX 扩展

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

> **注意**：请将路径替换为你本地的实际路径。`--workspace` 参数指向包含 `ArduFlux.json` 的 Arduino 项目根目录。

## 验证连接

1. 保存配置文件
2. 重启 Claude Desktop
3. 在对话中输入「列出可用的 Arduino 工具」
4. 若看到 `arduflux_get_state`、`arduflux_compile` 等工具，说明连接成功

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

- **连接失败**：检查 `node` 是否在系统 PATH 中
- **找不到草图**：确保 `--workspace` 指向正确的项目目录
- **工具不显示**：重启 Claude Desktop，或检查 `claude_desktop_config.json` 语法
