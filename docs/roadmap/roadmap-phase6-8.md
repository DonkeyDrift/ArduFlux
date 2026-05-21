# 扩展功能开发路线图：Phase 6~8

> 基于 TDD 流程推进：编译上传按钮、状态栏快捷入口、快捷键绑定。

---

## 总体策略

| 功能 | 主要文件 | 测试策略 | 复杂度 |
|------|----------|----------|--------|
| Phase 6 — 编译上传按钮 | `configStore.ts`, `panel.ts` | 纯函数单元测试 + 终端集成 | 高 |
| Phase 7 — 状态栏快捷入口 | `extension.ts` | 集成测试（后续补充）+ 手动验证 | 中 |
| Phase 8 — 快捷键绑定 | `package.json` | 纯配置，无需代码测试 | 低 |

**原则**：
- 所有**纯逻辑**（参数构造、路径拼接、校验）必须先写单元测试（红→绿）
- 所有**VS Code API 交互**（Terminal、StatusBar、Webview）在单元测试通过后集成
- 快捷键为纯声明式配置，直接修改 `package.json`

---

## Phase 6 — 编译上传按钮

### 需求分析

与 `upload.ps1` 保持行为一致：
1. **编译**：`arduino-cli compile --fqbn <fqbn> [--output-dir <dir>] <sketchPath>`
2. **上传**：`arduino-cli upload -p <port> --fqbn <fqbn> <sketchPath>`
3. 编译/上传为耗时操作，使用 **VS Code Terminal** 执行，用户可见实时输出
4. 上传前自动校验端口是否已选择

### TDD 步骤

#### Step 6.1 — 红：编写参数构造测试

新建 `src/test/configStore.compile.test.ts`：

```
describe("buildCompileArgs")
  ✔ 应生成基本编译参数（仅 fqbn + sketchPath）
  ✔ 应包含 --output-dir 参数
  ✔ 应包含额外编译参数（compileArgs）
  ✔ 空 fqbn 应抛 ValidationError

describe("buildUploadArgs")
  ✔ 应生成基本上传参数（port + fqbn + sketchPath）
  ✔ 空 port 应抛 ValidationError
  ✔ 空 fqbn 应抛 ValidationError
```

运行 `npm test` → **测试失败**（函数未实现）。

#### Step 6.2 — 绿：实现纯函数

在 `src/configStore.ts` 新增：

```ts
export function buildCompileArgs(opts: {
  fqbn: string;
  sketchPath: string;
  outputDir?: string;
  extraArgs?: string[];
}): string[] { ... }

export function buildUploadArgs(opts: {
  port: string;
  fqbn: string;
  sketchPath: string;
}): string[] { ... }
```

运行 `npm test` → **测试通过**。

#### Step 6.3 — 集成到 UI

**`src/panel.ts`**：
1. HTML toolbar 新增两个按钮：
   - `<button id="compileButton" class="secondary">编译</button>`
   - `<button id="uploadButton">上传</button>`
2. Script 添加事件监听，发送 `compile-sketch` / `upload-sketch`
3. `handleMessage` 新增两个分支：
   - `compile-sketch` → `this.compileSketch()`
   - `upload-sketch` → `this.uploadSketch()`

**`src/panel.ts` 新增方法**：

```ts
private async compileSketch(): Promise<void> {
  const config = this.store.getData().current;
  this.store.validateBoard(config.board); // 确保 FQBN 合法
  const args = buildCompileArgs({
    fqbn: config.board.fqbn,
    sketchPath: this.store.baseDir,
    outputDir: config.build.outputDir || undefined,
    extraArgs: config.board.compileArgs
  });
  const terminal = vscode.window.createTerminal({ name: "Arduino Compile", cwd: this.store.baseDir });
  terminal.sendText([this.store.arduinoCliPath, ...args].join(" "));
  terminal.show();
  await this.syncView("编译任务已启动");
}

private async uploadSketch(): Promise<void> {
  const config = this.store.getData().current;
  await this.store.validatePort(config.port); // 确保端口存在
  this.store.validateBoard(config.board);
  const args = buildUploadArgs({
    port: config.port.address,
    fqbn: config.board.fqbn,
    sketchPath: this.store.baseDir
  });
  const terminal = vscode.window.createTerminal({ name: "Arduino Upload", cwd: this.store.baseDir });
  terminal.sendText([this.store.arduinoCliPath, ...args].join(" "));
  terminal.show();
  await this.syncView("上传任务已启动");
}
```

#### Step 6.4 — 扩展命令注册（可选）

如需支持命令面板/快捷键调用编译上传，在 `src/extension.ts` 注册：

```ts
vscode.commands.registerCommand("arduflux.compileSketch", ...)
vscode.commands.registerCommand("arduflux.uploadSketch", ...)
```

并在 `package.json` `contributes.commands` 中声明。

---

## Phase 7 — 状态栏快捷入口

### 需求分析

在 VS Code 底部状态栏显示嵌入式板卡的快速状态，点击可打开面板：
- 显示格式：`$(circuit-board) <boardName> @ <port>` 或 `$(circuit-board) 未配置`
- 当无工作区、无配置或端口为空时，显示引导性文本
- 点击状态栏 → 打开 `arduflux.openPanel`

### TDD 步骤

#### Step 7.1 — 红：编写纯逻辑测试

状态栏的核心逻辑是**状态文本构造**，可独立测试。

新建 `src/test/statusBar.test.ts`：

```
describe("formatStatusBarText")
  ✔ 应显示板型名称和端口
  ✔ 端口为空时应显示「未选择端口」
  ✔ 板型名称为空时应显示「未配置板型」
  ✔ 两者皆空时应显示「未配置」
```

运行 `npm test` → **测试失败**。

#### Step 7.2 — 绿：实现纯函数

在 `src/extension.ts` 同目录新建 `src/statusBar.ts`（或直接在 `extension.ts` 中）：

```ts
export function formatStatusBarText(boardName: string, portAddress: string): string {
  if (!boardName && !portAddress) return "未配置";
  if (!boardName) return `未配置板型 @ ${portAddress}`;
  if (!portAddress) return `${boardName} @ 未选择端口`;
  return `${boardName} @ ${portAddress}`;
}
```

运行 `npm test` → **测试通过**。

#### Step 7.3 — 集成到 Extension

**`src/extension.ts`**：

```ts
import { formatStatusBarText } from "./statusBar";

export function activate(context: vscode.ExtensionContext): void {
  // ... 现有命令注册 ...

  // 状态栏
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "arduflux.openPanel";
  context.subscriptions.push(statusBarItem);

  async function updateStatusBar() {
    try {
      const root = getWorkspaceRoot();
      const store = new ConfigStore(root);
      await store.load();
      const config = store.getData().current;
      statusBarItem.text = `$(circuit-board) ${formatStatusBarText(config.board.name, config.port.address)}`;
      statusBarItem.tooltip = `板型: ${config.board.name}\n端口: ${config.port.address || "未选择"}\nFQBN: ${config.board.fqbn}`;
      statusBarItem.show();
    } catch {
      statusBarItem.text = "$(circuit-board) 嵌入式配置";
      statusBarItem.tooltip = "点击打开 ArduFlux 面板";
      statusBarItem.show();
    }
  }

  // 初始更新 + 定时刷新（每 5 秒）或文件监听
  void updateStatusBar();
  const interval = setInterval(updateStatusBar, 5000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}
```

> **注意**：更优雅的刷新方式是使用 `vscode.workspace.createFileSystemWatcher` 监听 `ArduFlux.json` 变化，但为简化可先使用轮询。

---

## Phase 8 — 快捷键绑定

### 需求分析

为常用命令绑定默认快捷键，用户可在「文件 > 首选项 > 键盘快捷方式」中修改。

### 实现步骤

直接修改 `package.json`，无需 TypeScript 代码：

```json
"contributes": {
  "commands": [ ... ],
  "keybindings": [
    {
      "command": "arduflux.openPanel",
      "key": "ctrl+shift+e",
      "mac": "cmd+shift+e",
      "when": "editorTextFocus || explorerViewletVisible"
    },
    {
      "command": "arduflux.validateConfig",
      "key": "ctrl+shift+v",
      "mac": "cmd+shift+v",
      "when": "editorTextFocus"
    },
    {
      "command": "arduflux.compileSketch",
      "key": "ctrl+shift+c",
      "mac": "cmd+shift+c",
      "when": "editorTextFocus"
    },
    {
      "command": "arduflux.uploadSketch",
      "key": "ctrl+shift+u",
      "mac": "cmd+shift+u",
      "when": "editorTextFocus"
    }
  ]
}
```

> **冲突检查**：
> - `ctrl+shift+e` 可能与「在文件夹中查找」冲突，建议改为 `ctrl+shift+b`（Build）或 `ctrl+alt+e`
> - 实际绑定前需验证与 VS Code 默认快捷键不冲突

### 验证方式

1. 打包安装 VSIX
2. 打开「文件 > 首选项 > 键盘快捷方式」
3. 搜索 "ArduFlux"，确认快捷键已绑定
4. 在编辑器中按下快捷键，验证命令执行

---

## 实施优先级建议

| 顺序 | Phase | 预计耗时 | 原因 |
|------|-------|----------|------|
| 1 | **8** 快捷键绑定 | 10 分钟 | 纯配置变更，零风险，可立即提升用户体验 |
| 2 | **7** 状态栏入口 | 30 分钟 | 纯展示逻辑，与现有代码耦合低 |
| 3 | **6** 编译上传按钮 | 1.5 小时 | 涉及参数构造、校验、Terminal API，需完整 TDD 迭代 |

---

## 验收标准

- [ ] `npm test` 全绿（新增 `buildCompileArgs`、`buildUploadArgs`、`formatStatusBarText` 测试）
- [ ] Webview 面板出现「编译」「上传」按钮，点击后在 Terminal 中执行正确命令
- [ ] 底部状态栏显示当前板型与端口，点击打开面板
- [ ] `package.json` 包含 4 组以上快捷键绑定，安装后可在快捷键设置中查看
- [ ] VSIX 打包成功，无测试产物混入
