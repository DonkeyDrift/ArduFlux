# CodeBuddy 配置指南

## 前提条件

- CodeBuddy IDE（最新版）或 CodeBuddy CLI
- 通义灵码 v2.5+（MCP 功能在智能体模式下可用）
- 已安装 Node.js ≥ 18.15.0
- 以下任一安装方式：
  - **推荐**：`npm install -g arduflux`（直接从 npm 安装）
  - 或已克隆本项目并执行 `npm install && npm run compile`

## 支持的传输类型

CodeBuddy 支持两种 MCP 传输方式：

- **stdio**（推荐）：本地进程间通信，适合 IDE 集成
- **sse**：基于 HTTP 事件流，用于远程通信

> **注意**：MCP 功能仅在 CodeBuddy 的**智能体模式**下可用，最多同时连接 **10 个** MCP 服务。

## 配置方式

### 方式一：IDE 界面配置（推荐）

1. 打开 CodeBuddy IDE 侧栏的 **对话面板**
2. 点击右上角的 **CodeBuddy Settings** 按钮（或头像 → 个人设置）
3. 切换到 **MCP** 标签页
4. 点击右侧的 **Add MCP** 按钮（或 **手动添加**）
5. 选择 **STDIO** 类型，填入以下配置：

```json
{
  "mcpServers": {
    "arduflux": {
      "type": "stdio",
      "command": "node",
      "args": [
        "${workspaceFolder}/dist/mcpServer.js",
        "--stdio",
        "--workspace",
        "${workspaceFolder}"
      ],
      "description": "ArduFlux 开发板配置 MCP"
    }
  }
}
```

> **注意**：`${workspaceFolder}` 为 CodeBuddy 内置变量。如果未被自动替换，请手动改为项目绝对路径（如 `C:/Dev/OPC/ArduFlux`）。

6. 点击 **Try to Run** 按钮进行验证
7. 验证通过后，在 MCP 列表中确认 `arduflux` 状态为启用

### 方式二：项目级配置文件

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

重启 CodeBuddy 后生效。

### 方式三：用户级配置文件

编辑 CodeBuddy 用户配置文件：

- **Windows**: `C:\Users\<用户名>\.codebuddy\.mcp.json`
- **macOS/Linux**: `~/.codebuddy/.mcp.json`

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

### 方式四：CodeBuddy CLI 命令行安装

如果你使用 CodeBuddy CLI，可通过命令快速添加：

```bash
codebuddy mcp add arduflux -s user -- node C:/Dev/OPC/ArduFlux/dist/mcpServer.js --stdio --workspace C:/Dev/OPC/ArduFlux
```

参数说明：
- `-s user`：指定用户级作用域（也可使用 `-s project` 项目级）
- `--` 之后为服务器启动命令

### 方式五：SSE 模式

如需使用 SSE 模式，先手动启动服务器：

```bash
node dist/mcpServer.js --sse --workspace .
```

记录输出中的端口号，然后在 IDE 的 MCP 配置中选择 **SSE** 类型：

```json
{
  "mcpServers": {
    "arduflux": {
      "type": "sse",
      "url": "http://127.0.0.1:60503/sse",
      "description": "ArduFlux SSE"
    }
  }
}
```

## 验证连接

1. 确保处于 CodeBuddy 的 **智能体模式**（Craft 模式）
2. 在对话面板中输入：`查看当前开发板配置`
3. AI 应自动调用 `arduflux_get_state` 工具并返回当前 FQBN、串口、编译参数等信息
4. 也可输入：`编译当前 Arduino 项目`，AI 将调用 `arduflux_compile` 启动编译任务

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

- **MCP 选项不可见**：确认已切换到 CodeBuddy 的 **智能体模式**（Craft 模式），MCP 功能仅在该模式下可用
- **工具不显示**：检查通义灵码版本是否 ≥ v2.5；确认 MCP 服务数量未超过 10 个上限
- **Try to Run 失败**：确保 `dist/mcpServer.js` 文件存在（需先执行 `npm run compile`）；确认 Node.js 版本 ≥ 18.15.0
- **路径问题**：Windows 下建议使用正斜杠 `/` 或双反斜杠 `\\`；相对路径 `./dist/mcpServer.js` 仅在项目级配置中有效
- **SSE 连接超时**：确认服务器进程已启动且未被防火墙拦截；CodeBuddy 目前 SSE 兼容端点为 `/sse`
- **CLI 配置不生效**：检查配置文件路径是否正确，重启 CodeBuddy CLI 或执行 `codebuddy mcp list` 查看已注册服务
