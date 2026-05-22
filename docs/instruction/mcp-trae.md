# TRAE 配置指南

## 前提条件

- TRAE IDE v1.3.0+（MCP 支持从该版本开始）
- 已安装 Node.js ≥ 18（npx 依赖）
- 以下任一安装方式：
  - **推荐**：`npm install -g arduflux`（直接从 npm 安装）
  - 或已安装 VS Code 扩展 **开发板配置 (ArduFlux)**
  - 或已克隆本项目并执行 `npm install && npm run compile`

## 支持的传输类型

TRAE IDE 支持两种 MCP 传输方式：

- **stdio**（推荐）：本地进程间通信，每次会话自动启动服务器进程
- **SSE**：基于 HTTP 的服务器推送，需手动启动并指定端口

## 配置方式

### 方式一：手动配置（推荐）

1. 打开 TRAE IDE，在 AI 对话窗口右上角点击 **设置图标** > **MCP**
2. 点击 **+ 添加** 按钮进入 MCP Server 市场
3. 选择 **手动配置**
4. 在配置输入框中粘贴以下 JSON 内容：

#### stdio 模式 — npm 全局安装（推荐）

如果你已通过 `npm install -g arduflux` 安装了 ArduFlux：

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

#### stdio 模式 — 本地源码

```json
{
  "mcpServers": {
    "arduflux": {
      "command": "node",
      "args": [
        "${workspaceFolder}/dist/mcpServer.js",
        "--stdio",
        "--workspace",
        "${workspaceFolder}"
      ]
    }
  }
}
```

> **注意**：`${workspaceFolder}` 为 TRAE 内置变量，指向当前打开的工作区根目录。如果自动替换失败，请手动替换为绝对路径。

#### SSE 模式

如需使用 SSE 模式，先手动启动服务器：

```bash
node dist/mcpServer.js --sse --workspace .
```

记录输出中的端口号（如 `60503`），然后在配置中填入：

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

> **注意**：SSE 模式的端口号每次启动都会变化，stdio 模式更稳定。

5. 点击 **确认** 按钮完成配置

### 方式二：项目级配置文件

在项目根目录创建 `.trae/mcp.json`：

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

重启 TRAE IDE 后自动生效。

### 方式三：复用其他 IDE 配置

如果你已在 Cursor / VS Code 中配置过 MCP，可点击 **原始配置（JSON）** 按钮，将已有的 `mcpServers` 配置粘贴至 TRAE IDE 的输入框中，TRAE 会自动识别并添加。

## 在智能体中使用 MCP

配置完成后，你需要将 ArduFlux MCP 工具添加到自定义智能体中：

1. 在 MCP 配置页面确认 `arduflux` 状态为 **已连接**（绿色）
2. 进入 **智能体** 面板，创建或编辑一个智能体
3. 在工具列表中勾选 `arduflux_*` 相关工具
4. 保存后，在该智能体的对话中即可通过自然语言调用 ArduFlux 功能

## 验证连接

1. 打开 TRAE 的 AI 对话侧边栏
2. 进入已配置 ArduFlux 工具的智能体
3. 输入：`查看当前开发板配置状态`
4. AI 应自动调用 `arduflux_get_state` 工具并返回当前配置信息

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

- **工具不显示**：确保 TRAE 版本 ≥ v1.3.0；在 Builder 模式下智能体才能使用 MCP 工具
- **连接失败**：检查 `dist/mcpServer.js` 是否存在（需先执行 `npm run compile`）
- **stdio 模式无响应**：确认 Node.js 版本 ≥ 18；检查 `"--workspace"` 参数路径是否正确
- **SSE 模式 404**：确认服务器已启动且端口正确；TRAE 目前 SSE 兼容端点为 `/sse` 而非 `/mcp`
- **路径变量未替换**：TRAE 对 `${workspaceFolder}` 的支持可能因版本而异，建议手动替换为绝对路径
