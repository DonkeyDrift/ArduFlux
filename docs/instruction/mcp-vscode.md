# VS Code 配置指南

## 前提条件

- VS Code 1.99+（内置 MCP 客户端支持）
- 已安装 VS Code 扩展 **开发板配置 (ArduFlux)** v0.4.2+

## 自动发现（推荐）

ArduFlux 扩展在激活时会自动向 VS Code 注册 MCP 服务器，无需手动编辑配置文件。

1. 打开一个包含 Arduino 项目的文件夹
2. 扩展会自动启动内部 SSE 服务器
3. VS Code 内置 AI（Copilot / Chat）在对话中自动发现 `arduflux_*` 工具

你可以在 **输出面板**（`Ctrl+Shift+U`）→ 选择「开发板配置」通道中查看：

```
[activate] MCP SSE server listening on port XXXX
[activate] MCP provider registered with VS Code lm registry
```

## 手动配置（备用）

如果自动发现不可用，可在工作区创建 `.vscode/mcp.json`：

### npm 全局安装方式（推荐）

如果你已通过 `npm install -g arduflux` 安装了 ArduFlux：

```json
{
  "servers": {
    "arduflux": {
      "type": "stdio",
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

### 本地源码方式

```json
{
  "servers": {
    "arduflux": {
      "type": "stdio",
      "command": "node",
      "args": [
        "${workspaceFolder}/dist/mcpServer.js",
        "--stdio"
      ]
    }
  }
}
```

或使用 SSE 模式（需手动启动服务器）：

```bash
node dist/mcpServer.js --sse --workspace .
# 记录输出中的端口号，如 60503
```

然后在 `.vscode/mcp.json` 中配置：

```json
{
  "servers": {
    "arduflux": {
      "type": "http",
      "url": "http://127.0.0.1:60503/mcp"
    }
  }
}
```

> **注意**：SSE 模式的端口号每次启动都会变化，stdio 模式更稳定。

## 验证连接

1. 打开 VS Code Chat 侧边栏（`Ctrl+Alt+I`）
2. 输入 `#工具` 或点击工具图标
3. 在可用工具列表中查找 `arduflux_get_state`、`arduflux_compile` 等

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

- **工具不显示**：确保 VS Code 版本 ≥ 1.99，并检查「开发板配置」输出面板是否有 MCP 启动日志
- **自动注册失败**：扩展会在旧版 VS Code 中静默跳过 MCP 注册，不影响其他功能
- **stdio 模式失败**：确保项目根目录已执行 `npm install && npm run compile`
