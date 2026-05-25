# 串口监视器启动日志丢失修复方案

## 背景

用户反馈“打开串口还是丢失最初打印的内容”。此前已在 `src/uploader/uploader.ts` 中移除了 VS Code 上传核心路径的 monitor 前手动 `resetBoard()` 与 100ms 延迟，但分析发现 MCP 入口 `src/mcpServer.ts` 的 `arduflux_monitor` 仍在启动 `arduino-cli monitor` 前执行 `resetBoard(port)` 并等待 100ms。

这会让开发板在监听进程与 stdout/stderr 监听器建立之前复位，启动早期串口输出因此可能被错过。

目标是统一所有串口监视入口的语义：不在 monitor 进程启动前预复位；`resetOnConnect=true` 时由 monitor 打开串口过程处理 DTR/RTS；`resetOnConnect=false` 时通过 `buildMonitorArgs()` 传入 `dtr=off`、`rts=off`，避免连接时复位。

## 推荐实现

### 1. 修复 MCP monitor 预复位路径

修改 `src/mcpServer.ts`：

- 删除 `resetBoard` import。
- 删除 `arduflux_monitor` 中的预复位逻辑：
  - `await resetBoard(port)`
  - `await new Promise((resolve) => setTimeout(resolve, 100))`
- 保留：
  - `const resetOnConnect = args.reset_on_connect ?? config.current.monitor.resetOnConnect`
  - `buildMonitorArgs({ ..., resetOnConnect })`
- 调整 `arduflux_monitor` 返回 JSON 的 `note`，说明不会在监听前预复位，复位由 monitor 连接过程或串口控制线配置决定。

### 2. 保持现有参数语义

复用 `src/configStore.ts` 的 `buildMonitorArgs()`：

- `resetOnConnect === false` 时添加：
  - `--config dtr=off`
  - `--config rts=off`
- `resetOnConnect` 为 `true` 或 `undefined` 时不添加这两个参数，让 `arduino-cli monitor` 使用默认 DTR/RTS 行为。

保持 `src/uploader/uploader.ts` 当前 monitor 分支不调用 `resetBoard()`。

### 3. 梳理 legacy 入口风险

当前仓库没有 `src/scripts/upload.ps1`，但 `src/terminal.ts` 的 `runUploadScript()` 仍可能在外部脚本存在时绕过 `Uploader`。

本次不重构 legacy 入口，仅在实现后确认扩展主命令仍走 `runUploaderFlow -> Uploader.run`，并记录 `runUploadScript()` 不作为串口监视主路径。

## 测试计划

### 1. MCP 回归测试

修改 `src/test/mcp/mcpServer.test.ts`：

- 使用 `createMcpServer(workspaceRoot, { spawn })` 注入 fake spawn。
- 准备带 `current.port.address = "COM3"` 的配置。
- 调用 MCP `tools/call` 的 `arduflux_monitor`。

覆盖场景：

1. `reset_on_connect: true`
   - 断言 spawn 使用 `arduino-cli` 与包含 `monitor` 的参数启动。
   - 断言参数不包含 `dtr=off`、`rts=off`。
   - 断言返回 note 不再表示“先重置再打开”。
2. `reset_on_connect: false`
   - 断言 spawn 参数包含 `--config dtr=off` 与 `--config rts=off`。

### 2. Uploader 主路径测试

修改 `src/test/uploader/uploader.test.ts`：

- 保留 `resetOnConnect` 启用时 monitor 前不应输出或执行额外手动重置的回归测试。
- 增加 `resetOnConnect=false` 时 monitor 参数包含 `dtr=off/rts=off` 的断言，确保 VS Code 主路径与 MCP 语义一致。

### 3. 参数构造测试

检查 `src/test/configStore.compile.test.ts` 或现有 monitor 参数测试：

- 默认/true 不添加 `dtr=off/rts=off`。
- false 添加 `dtr=off/rts=off`。

如已有等价测试，不重复新增。

## 端到端验证

### 自动化验证

依次运行：

```bash
npm run compile
npx mocha "dist/test/mcp/mcpServer.test.js"
npx mocha "dist/test/uploader/uploader.test.js"
npm test
```

### 真实串口验证

使用立即打印启动标记的 sketch：

```cpp
void setup() {
  Serial.begin(115200);
  Serial.println("BOOT_MARKER_0");
  Serial.println("BOOT_MARKER_1");
}

void loop() {
  Serial.println("LOOP_MARKER");
  delay(1000);
}
```

验证路径：

1. VS Code/TRAE 打开串口监视器
   - `resetOnConnect=true` 时确认不再出现预重置日志，并尽可能捕获启动标记。
2. MCP `arduflux_monitor`
   - `reset_on_connect=true` 时确认任务直接启动 monitor，不在启动前预复位。
   - `reset_on_connect=false` 时确认不触发复位；如需启动日志，应先打开 monitor 再手动按板子 reset。

## 风险说明

`arduino-cli monitor` 对“先注册 data listener 再切换 DTR/RTS”的控制粒度有限。本方案能消除 ArduFlux 自己造成的监听前预复位空窗，但无法承诺捕获硬件或驱动层面发生在进程完成串口打开前的每个极早字节。

如果修复 MCP 预复位后仍有极早字节丢失，下一阶段可考虑引入 Node 串口库实现内部 monitor：先打开串口并注册 data listener，再通过同一串口句柄切换 DTR/RTS 触发复位。该方案实现成本较高，不作为本次首选。
