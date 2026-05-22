## [0.4.1] - 2026-05-22

### 跨平台上传核心重构（方案 B / TDD）

- **废弃 PowerShell `upload.ps1` 调用**：VS Code 扩展内部所有编译/上传/监视命令改为调用纯 Node.js 实现的 `Uploader` 核心（`src/uploader/`）
- 新增 `src/uploader/projectResolver.ts`：项目根目录查找（ArduFlux.json / .ino 向上遍历）
- 新增 `src/uploader/libraryResolver.ts`：跨平台库依赖解析与自动安装
- 新增 `src/uploader/portManager.ts`：跨平台串口释放（Windows `taskkill` / POSIX `fuser`）与 PowerShell 可执行文件检测
- 新增 `src/uploader/uploader.ts`：`Uploader` 主控类，支持编译→上传→监视流程、多端口候选重试、`compileBeforeUpload` 链节、Ctrl+C 中止
- 更新 `src/terminal.ts`：`runUploaderFlow()` 替代 `runUploadScript()`，`killProcessTree()` 支持 POSIX（`kill -9 -<pgid>`）
- `upload.ps1` 保留为独立兼容脚本，但不再被扩展直接调用

### 测试

- 严格遵循 TDD 流程开发：先写测试（红）→ 实现代码（绿）→ 重构
- 新增 40 个 uploader 单元测试，测试总数从 **135** 增至 **175** 个，全部通过
- uploader 模块采用依赖注入（DI）策略，所有 I/O 操作通过构造函数传入，便于 stub 测试

---

## [0.4.0] - 2026-05-21

### MCP (Model Context Protocol) 支持

- 新增 MCP 服务器 `dist/mcpServer.js`，支持 stdio / SSE / StreamableHTTP 三种传输
- 注册 14 个 MCP Tools：`get_state`、`list_ports`、`validate_config`、`set_config`、`compile`、`upload`、`monitor`、`get_task_status`、`apply_profile`、`list_profiles`、`save_profile`、`delete_profile`、`discover_sketches`、`health`
- 支持任务日志实时推送（`sendLoggingMessage`）和后台异步轮询
- VS Code 扩展激活时自动注册 `McpServerDefinitionProvider`（1.99+）
- 新增 `--health-check-interval` CLI 参数和全局异常捕获

### 安全增强

- 新增 `validateFqbn` 严格校验（3–4 段，仅 `a-zA-Z0-9_-=`）
- 新增 `validateCliArgs` 拦截 shell 元字符
- 新增 `validateSketchPath` 强制 `.ino` 后缀 + 工作区内防穿越
- `buildCompileArgs` / `buildUploadArgs` 统一调用 `validateCliArgs`

### 测试与文档

- 新增 MCP 端到端集成测试（stdio / SSE / StreamableHTTP）
- 测试总数从 103 增至 **135** 个，全部通过
- 新增 CLI 配置文档：`mcp-claude-cli.md`、`mcp-kimi-cli.md`、`mcp-codebuddy-cli.md`
- 新增 IDE 配置文档：`mcp-trae.md`、`mcp-codebuddy.md`
- 新增验收报告：`docs/validation/phase9-12-validation.md`

### 工程改进

- 新增 `bin/arduflux-mcp` CLI 入口脚本，修复 Windows npm wrapper 无 `node` 前缀问题
- VSIX 体积从 22 MB 优化至 **77 KB**（排除 build/test 目录）
- `.vscodeignore` 精简，确保 `dist/mcpServer.js` 和 `bin/arduflux-mcp` 被打包

---

## [0.2.0] - 2026-05-05

- 新增标准 VS Code 扩展工程：`package.json`、`tsconfig.json`、`src/`
- 新增命令面板入口与 Webview 配置面板
- 将配置读写、校验、串口枚举、Profiles 管理迁移到 TypeScript
- 支持使用 `vsce` 打包生成 `VSIX` 安装包
- 保持 `ArduFlux.json` 与 `upload.ps1` 的兼容性

## [0.1.0] - 2026-05-05

- 新增统一配置管理模块 `embedded_config/`（JSON 持久化、校验、Profiles、导入导出）
- 新增 tkinter 图形化配置工具 `python -m embedded_config.ui`
- 新增命令行工具 `python -m embedded_config.cli`
- `upload.ps1` 支持读取 `ArduFlux.json`，支持编译输出目录与监视器开关
- 编译阶段增加"循环流动点"UI 动画
- 增加单元测试 `tests/`
