# CodeBuddy CLI 配置指南

## 前提条件

- CodeBuddy CLI 已安装（`codebuddy --version` 可查看版本）
- 已安装 Node.js ≥ 18.15.0
- 项目已执行 `npm install && npm run compile`

## 支持的传输类型

CodeBuddy CLI 支持两种 MCP 传输方式：

- **stdio**（推荐）：本地进程间通信，适合 CLI 集成
- **sse**：基于 HTTP 的服务器推送，用于远程通信

## 配置方式

### 方式一：命令行快速添加（推荐）

使用 `codebuddy mcp add` 命令直接注册 MCP 服务器：

```bash
# 用户级作用域（全局可用）
codebuddy mcp add arduflux -s user -- \
  node "C:/Dev/OPC/ArduFlux/dist/mcpServer.js" \
  --stdio --workspace "C:/Dev/OPC/ArduFlux"

# 项目级作用域（仅当前项目可用）
codebuddy mcp add arduflux -s project -- \
  node "./dist/mcpServer.js" \
  --stdio --workspace "."
```

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
- **stdio 模式无响应**：确认 `dist/mcpServer.js` 存在（需先执行 `npm run compile`）；确认 Node.js 版本 ≥ 18.15.0
- **SSE 模式桥接失败**：确认 `mcp-remote` 已安装（`npm install -g mcp-remote`）；确认服务器端口正确且未被防火墙拦截
- **工具调用报错**：CodeBuddy CLI 的 MCP 功能可能需要特定版本支持；检查 CodeBuddy CLI 是否为最新版
- **路径问题**：Windows 下建议使用正斜杠 `/` 或双反斜杠 `\\`；包含空格的路径需用引号包裹
- **作用域混淆**：`-s user` 为全局配置，`-s project` 仅在当前目录有效；若切换工作目录后工具消失，检查作用域设置
