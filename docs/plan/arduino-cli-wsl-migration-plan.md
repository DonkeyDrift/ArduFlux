# arduino-cli-wsl.ps1 移植可行性方案

## 1. 摘要结论

**结论：移植可行，但不应照搬 PowerShell 脚本。**

推荐将 `arduino-cli-wsl.ps1` 的核心能力迁移为 ArduFlux 的 **Node.js 原生 "WSL 编译后端"**：

- 编译阶段：通过 WSL 在 Linux 原生文件系统上执行 `arduino-cli compile`，获得更稳定/更快的编译体验。
- 上传与串口监视：继续复用 ArduFlux 现有 Windows 本地流程，不做改动。
- 库同步：作为默认关闭的可选增强功能。
- UI 呈现：WSL 编译配置归入现有"显示高级选项"区域，默认不展示、不激活。
- 持久化：修改后通过现有 `collectForm()` → `saveConfig()` → `ConfigStore.save()` 链路写入 `ArduFlux.json`。

---

## 2. `arduino-cli-wsl.ps1` 功能分析

### 2.1 核心目标

脚本解决的核心问题：**Windows 文件系统（尤其是 `/mnt/c`）下直接调用 WSL 编译存在性能和路径兼容问题**，因此：

1. 将 Windows 工程通过 `rsync` 同步到 WSL 原生目录（如 `$HOME/arduino-build/mus4`）。
2. 在 WSL 中运行 `~/bin/arduino-cli compile`。
3. 编译完成后把 `.bin` / `.elf` 产物同步回 Windows `build_wsl` 目录。
4. 可选同步 Windows Arduino libraries 到 WSL libraries 路径。
5. 上传和串口监视仍委托 Windows 侧 `python arduino-cli.py` 处理。

### 2.2 参数表

| 参数 | 别名 | 默认值 | 用途 | 移植建议 |
|------|------|--------|------|----------|
| `$SyncLibs` | `Sync` | `$false` | 是否同步 Arduino libraries | 转为 ArduFlux 配置项，默认关闭 |
| `$WinLibPath` | — | `$env:USERPROFILE\Documents\Arduino\libraries` | Windows libraries 路径 | 转为配置项，可从现有 `libraryResolver` 推导 |
| `$WslLibPath` | — | `~/Arduino/libraries` | WSL libraries 路径 | 转为配置项 |
| `$OverwriteLibs` | — | `$true` | 是否覆盖已有库 | 转为同步策略（copy-missing / overwrite / mirror） |
| `$BackupLibs` | — | `$false` | 同步前备份 WSL 已有库 | 可作为高级选项 |
| `$ExcludeLibs` | — | `@("^\.", "^tmp$")` | 排除库列表（正则） | 转为配置项或 CLI 参数 |
| `$SyncMode` | — | `rsync` | 同步方式：rsync 或 robocopy | Node.js 中抽象为 sync provider |
| `$ExtraArgs` | — | `""` | 传给同步命令的额外参数 | 对接现有 compile args |
| `$Serial` | `-s` | `$false` | 打开串口监视 | 复用 ArduFlux monitor |
| `$Compile` | `-c` | `$false` | 执行编译 | 对接 WSL compile backend |
| `$Upload` | `-u` | `$false` | 执行上传 | 复用 ArduFlux upload |
| `$Sketch` | `-i` | `"mus4/mus4.ino"` | Sketch 路径 | 对接 `projectResolver` |
| `$FQBN` | `-b` | `"esp32:esp32:esp32"` | 目标板 FQBN | 对接现有配置 schema |

### 2.3 默认行为

- **未指定 `-c`、`-u`、`-s` 任何参数时，默认执行编译 + 上传**。
- 这与 ArduFlux 当前默认行为（无 flag 时执行 upload + monitor）有差异，移植时需保持 ArduFlux 自身默认行为不变，WSL 只影响编译后端选择。

### 2.4 硬编码项（移植时必须配置化）

| 硬编码项 | 当前值 | 移植要求 |
|----------|--------|----------|
| Windows 项目根 | `C:\Dev\DDC\mus4` | 改为 `workspaceRoot`，由扩展上下文动态获取 |
| WSL 发行版 | `DKC` | 改为用户可配置，支持自动探测默认发行版 |
| WSL 工作目录 | `$HOME/arduino-build/mus4` | 改为用户可配置，默认建议 `$HOME/arduino-build/<project>` |
| arduino-cli 路径 | `~/bin/arduino-cli` | 改为用户可配置，默认建议 `arduino-cli`（依赖 PATH） |
| WSL mount 根 | `/mnt/c/Dev/DDC/mus4` | 由 `workspaceRoot` 自动转换 |

### 2.5 主流程

```
1. 解析命令行参数 → 初始化配置
2. [可选] SyncLibs → Sync-ArduinoLibraries()
   ├── 预检查 Windows 库路径、WSL 发行版状态
   ├── 创建 WSL 目标目录
   ├── [可选] 备份已有库
   ├── 执行同步（rsync 或 robocopy）
   └── 校验同步完整性（文件数/大小，允许 1% 误差）
3. 默认行为处理（未指定操作时启用编译+上传）
4. [编译] 编译流程
   ├── rsync 同步项目源码到 WSL 原生目录（排除 build_wsl、.git、.venv）
   ├── WSL 中执行 arduino-cli compile
   ├── cp .bin/.elf 产物回 Windows build_wsl 目录
   └── 输出性能统计
5. [上传/监视] 调用 python arduino-cli.py
   ├── -u 上传（传入 .bin 路径、--sketch、--fqbn）
   └── -s 串口监视
```

### 2.6 错误处理与输出

- **全局错误策略**：`$ErrorActionPreference = "Stop"`，遇到任何错误立即终止。
- **分步校验**：每个关键操作检查返回码（WSL 启动、目录创建、rsync/robocopy、编译产物）。
- **失败输出**：`Run-WithAnimation` 在非零退出码时输出错误码、标准错误流内容。
- **性能报告**：编译完成后输出同步、编译、回传各阶段耗时和总耗时。
- **彩色输出**：青色阶段提示、灰色详细信息、黄色警告/性能报告、绿色成功、红色错误。

---

## 3. 架构逻辑拆解

将脚本拆为 5 个逻辑子系统，便于逐项映射到 ArduFlux：

### 3.1 命令执行器

对应 `Run-WithAnimation`（行 76–148）。

- 封装 `System.Diagnostics.Process` 启动命令。
- 异步收集 stdout/stderr 到 `StringBuilder`。
- 显示旋转动画和实时耗时。
- 非零退出码时输出错误详情并返回 `$false`。

**移植映射**：Node.js `child_process.spawn` / `execFile` + `write` 回调，不需要动画逻辑，但应保留耗时统计和结构化错误。

### 3.2 库同步器

对应 `Sync-ArduinoLibraries`（行 150–288）。

- 预检查 Windows 源路径、WSL 发行版运行状态。
- 可选备份 WSL 已有库。
- 支持 `rsync`（-av，可选 --delete）和 `robocopy`（/E，可选 /MIR）两种同步方式。
- 排除指定正则模式的库。
- 同步后校验：对比 Windows 和 WSL 侧的文件数量/大小，允许 1% 误差。

**移植映射**：作为可选增强功能，不应阻塞 WSL 编译最小可用版本。优先复用/扩展 `libraryResolver.ts` 的库解析能力。

### 3.3 项目同步器

主流程行 301–343 中的 `rsync` 调用。

- 使用 `rsync -av --delete --exclude=build_wsl --exclude=.git --exclude=.venv` 将 `/mnt/c/...` 同步到 `$HOME/arduino-build/...`。
- 同步前确保 WSL 工作目录存在（`mkdir -p`）。

**移植映射**：新增 WSL 项目同步能力，排除列表可配置化（`.git`、`node_modules`、`.vscode`、`.trae`、build 输出目录等）。

### 3.4 WSL 编译器

主流程行 313–317 中的 `arduino-cli compile` 调用。

- 命令：`~/bin/arduino-cli compile --fqbn $FQBN --build-path "$WSLBuildDir" --output-dir "$WSLBuildDir" "$WSLSketchPath"`
- 在 WSL 原生文件系统上执行，获得接近原生 Linux 的编译性能。

**移植映射**：复用 `buildCompileArgs()` 构造参数，但将其中 Windows 路径替换为 WSL 路径；通过 `wsl.exe -d <distro> -- arduino-cli compile ...` 执行。

### 3.5 Windows 侧上传/监视委托

主流程行 355–386。

- 上传和串口监视通过 `python arduino-cli.py` 在 Windows 侧执行。
- 传入 `.bin` 路径、`--sketch`、`--fqbn`。

**移植映射**：不需要迁移此部分，ArduFlux 已有完整的 Windows 本地上传和串口监视能力。

---

## 4. ArduFlux 架构对照

### 4.1 上传主流程

**文件**：`src/uploader/uploader.ts`

当前 `Uploader.run()` 已串联 compile → upload → monitor 完整流程：
- 默认无 flag 时执行 upload + monitor。
- `compileBeforeUpload` 联动：上传前可自动编译。
- 编译阶段通过 `buildCompileArgs()` 构造参数，`spawnWithOutput("arduino-cli", compileArgs, ...)` 执行。

**插入点**：在编译阶段，根据配置选择 `local` 或 `wsl` 后端。WSL 后端不改变 upload/monitor 流程。

### 4.2 配置与参数构造

**文件**：`src/configStore.ts`

- `buildCompileArgs(opts, baseDir?)`：构造 arduino-cli 编译参数，包含 FQBN、sketch 路径、输出目录、额外参数，并有完整的校验逻辑。
- `buildUploadArgs(opts, baseDir?)`：构造上传参数。
- `buildMonitorArgs(opts)`：构造监视参数。
- `execFileText(command, args, timeoutMs)`：通用命令执行。

**可复用点**：`buildCompileArgs` 的参数构造逻辑可直接复用，WSL 后端只需将结果中的路径替换为 WSL 路径。`execFileText` 可作为 WSL 命令执行器的基础参考。

### 4.3 类型与配置模型

**文件**：`src/types.ts`

当前 `ArduFluxCurrentConfig` 结构：

```ts
interface ArduFluxCurrentConfig {
  board: ArduFluxBoardState;     // name, fqbn, compileArgs, pinDefines
  port: ArduFluxPortState;       // address, auto, lastSuccessfulAddress
  build: ArduFluxBuildState;     // outputDir, recentOutputDirs, sketchPath, compileBeforeUpload, uploadThenMonitor
  monitor: ArduFluxMonitorState; // enabled, baudRate, dataBits, stopBits, parity, newline, resetOnConnect
}
```

**需新增**：WSL 编译后端配置结构（详见第 8 节配置设计草案）。

### 4.4 项目路径解析

**文件**：`src/uploader/projectResolver.ts`

当前 `findProjectRoot(startDir, fsImpl)` 向上查找包含 `ArduFlux.json` 或 `.ino` 文件的目录。

**需扩展**：
- Windows 路径到 WSL mount 路径转换（如 `C:\Dev\OPC\ArduFlux` → `/mnt/c/Dev/OPC/ArduFlux`）。
- Windows 项目名到 WSL 原生工作目录映射（如 `ArduFlux` → `$HOME/arduino-build/ArduFlux`）。
- 推荐使用 WSL 原生工作目录而不是直接在 `/mnt/c` 下编译。

### 4.5 库依赖解析

**文件**：`src/uploader/libraryResolver.ts`

已有能力：
- `parseRequiredLibraries(sketchPath)`：从 `.ino` 文件解析 `#include <Lib>` 依赖。
- `getInstalledLibraries(arduinoCliPath)`：获取已安装库列表。
- `installLibraries(libs, arduinoCliPath, cwd, onOutput, spawnImpl)`：安装缺失依赖。
- `resolveMissingLibraries(required, installed)`：计算缺失库集合。

**建议**：库同步不应替代现有依赖解析/安装能力，而应作为补充：在 WSL 环境下检测库可用性，缺失时可选择同步 Windows libraries 或在 WSL 中安装。

### 4.6 MCP 集成

**文件**：`src/mcpServer.ts`、`src/mcp/extensionIntegration.ts`

现有 MCP 工具已暴露 compile/upload 等能力。WSL 编译后端应通过统一流程继承，不建议新增完全独立的 `arduino-cli-wsl` 工具。

MCP 响应中应明确返回：
- 使用的后端：`local` 或 `wsl`
- WSL distro
- WSL workspace
- compile command summary
- artifact path
- elapsed time
- errors/warnings

### 4.7 Webview UI 与持久化链路

**文件**：`src/webviewController.ts`

现有"显示高级选项"机制：
- `<input id="showAdvanced" type="checkbox" />` 勾选后为 `body` 添加 `show-advanced` 类。
- `.advanced-item` 默认 `display: none`，`body.show-advanced .advanced-item` 时显示。
- UI 状态通过 `vscode.setState({ showAdvanced: ... })` 保存。

现有配置持久化链路：
1. 前端 `collectForm()` 收集表单字段。
2. 通过 `vscode.postMessage({ type: "auto-save-config", payload: collectForm() })` 发送。
3. `ConfigEditorController.handleMessage()` 接收，调用 `saveConfig(form)`。
4. `buildCurrentConfig(form, current)` 合并到 `ArduFluxCurrentConfig`。
5. `ConfigStore.setData(nextConfig)` → `ConfigStore.save()` → 写入 `ArduFlux.json`。

**WSL 配置接入方式**：
- WSL 编译相关字段使用 `.advanced-item` 类，默认不展示。
- 勾选"显示高级选项"后可见 `启用 WSL 编译` 开关及后续字段。
- 修改后通过同一 `collectForm()` → `saveConfig()` 链路持久化到 `ArduFlux.json`。
- **重要区分**：`showAdvanced` 的勾选状态是 Webview UI 状态（`vscode.setState`），WSL 配置值是业务数据（`ArduFlux.json`），两者不要混淆。

---

## 5. UI 与持久化要求

### 5.1 核心原则

- **WSL 编译是可选项，默认不激活。**
- WSL 相关配置只在用户勾选"显示高级选项"后展示。
- 修改后必须走现有持久化链路写入 `ArduFlux.json`。

### 5.2 高级选项区域规划

在现有高级选项区域（编译输出、串口高级配置之后）新增 **"WSL 编译"** 区块，包含以下字段：

| 字段 | 控件类型 | 默认值 | 说明 |
|------|----------|--------|------|
| 启用 WSL 编译 | checkbox | `false` | 总开关，不启用时后续字段灰显 |
| WSL 发行版 | input | `""` | 留空时自动探测默认发行版，不能写死 `DKC` |
| WSL 工作目录 | input | `""` | 留空时使用 `$HOME/arduino-build/<project>`，不能写死 `mus4` |
| arduino-cli 路径 | input | `arduino-cli` | WSL 内 arduino-cli 可执行文件路径，不能强依赖 `~/bin/arduino-cli` |
| 项目同步排除项 | input | `.git,node_modules` | 逗号分隔的排除列表 |
| 库同步 | checkbox | `false` | 独立于总开关，默认关闭 |
| Windows 库路径 | input | `""` | 库同步源路径，启用库同步时显示 |
| WSL 库路径 | input | `~/Arduino/libraries` | 库同步目标路径 |
| 库同步模式 | select | `copy-missing` | copy-missing / overwrite / mirror |
| 同步前备份 | checkbox | `false` | 仅 overwrite/mirror 模式下生效 |

### 5.3 持久化保障

- 所有 WSL 配置字段纳入 `collectForm()` 收集范围。
- 通过 `buildCurrentConfig()` 合并到 `ArduFluxCurrentConfig` 的 `wsl` 字段。
- `ConfigStore.save()` 将完整配置写入 `ArduFlux.json`。
- 配置文件中 `wsl` 字段缺失或 `wsl.enabled === false` 时，行为与当前版本完全一致。

---

## 6. 可行性评估

### 6.1 高度可行

| 能力 | 说明 |
|------|------|
| WSL 中运行 `arduino-cli compile` | `wsl.exe -d <distro> -- arduino-cli compile ...` 即可实现 |
| 项目同步到 WSL native filesystem | 通过 `wsl.exe` 执行 `rsync` 或 Node.js 文件操作 |
| 编译产物回传到 Windows | 通过 `wsl.exe` 执行 `cp` 或使用 `\\wsl.localhost` 网络路径 |
| 保留 Windows 本地上传和监视 | 不需要任何改动 |
| 将脚本参数迁移为配置项 | 现有 `types.ts` + `configStore.ts` 完全支持 |
| 高级选项 UI 展示 | 现有 `.advanced-item` 机制直接复用 |
| 配置持久化 | 现有 `collectForm()` → `saveConfig()` → `ConfigStore.save()` 链路直接复用 |

### 6.2 需要改造

| 项目 | 说明 |
|------|------|
| 路径转换 | Windows ↔ WSL 路径双向转换，需专门工具函数和单元测试 |
| 命令转义 | WSL 命令拼接需正确处理 shell quoting，避免命令注入 |
| 同步策略抽象 | rsync/robocopy 差异需要抽象为 sync provider，不应让业务流程直接依赖某个同步命令 |
| 结构化日志 | PowerShell 动画输出需改为 VS Code output channel / MCP 友好的日志和进度模型 |
| 配置 schema | `ArduFluxCurrentConfig` 需新增 `wsl` 字段和 Zod 校验 |
| 测试注入 | WSL 命令执行需可注入 mock executor，避免测试依赖真实 WSL 环境 |
| `buildCurrentConfig()` | 需扩展以合并 WSL 表单字段 |
| `collectForm()` | 需扩展以收集 WSL 相关字段 |

### 6.3 不建议直接迁移

| 项目 | 原因 |
|------|------|
| 原样复制 PowerShell 脚本到项目 | 违背 Node.js 原生架构，无法与现有上传/监视/配置流程集成 |
| WSL 编译作为单独 PowerShell 外壳由 Node.js 简单调用 | 增加外部依赖，错误处理和输出捕获不可控 |
| 第一阶段接管 WSL 上传/串口 | WSL 串口映射与 Windows COM 口不对应，超出本次移植范围 |
| 保留硬编码路径和发行版名称 | 违背配置化原则，无法适配不同用户环境 |
| 默认开启 WSL 编译 | 会破坏不使用 WSL 的用户体验 |
| 默认启用库同步 | 可能覆盖用户 WSL 中已有库，造成不可逆影响 |

---

## 7. 推荐移植路线

### Phase 1：compile backend 概念

- 在 `src/uploader/uploader.ts` 的编译阶段引入 backend 概念。
- 默认 backend 为 `local`（现有行为），`wsl` 为可选。
- `wsl` backend 关闭时，所有现有行为完全不变。

### Phase 2：WSL 命令执行器与路径转换

- 新增 WSL 命令执行器：封装 `wsl.exe -d <distro> -- <command>` 调用。
- 新增路径转换工具：
  - `winToWslMount(winPath)` → `/mnt/c/...`
  - `winToWslWorkspace(winPath, wslWorkspaceRoot)` → `$HOME/arduino-build/<project>`
  - `wslToWinPath(wslPath, distro)` → `\\wsl.localhost\<distro>\...`
- 检查 WSL 可用性、distro 存在性、arduino-cli 可用性。

### Phase 3：项目同步到 WSL native workspace

- 使用 `wsl.exe` 执行 `rsync` 或 Node.js `fs` 操作同步项目。
- 排除列表可配置（`.git`、`node_modules`、`.vscode`、`.trae`、build 输出目录等）。
- 同步前确保 WSL 工作目录存在。

### Phase 4：WSL 中执行 compile，同步产物回 Windows

- 复用 `buildCompileArgs()` 构造参数，将 Windows 路径替换为 WSL 路径。
- 通过 WSL 命令执行器运行 `arduino-cli compile`。
- 同步 `.bin` / `.elf` 产物回 Windows output 目录。

### Phase 5：上传/监视走现有 Windows 本地逻辑

- 编译完成后，上传和串口监视仍走现有 `buildUploadArgs()` / `buildMonitorArgs()` + Windows 本地 `arduino-cli` 流程。
- 无需修改任何上传/监视代码。

### Phase 6：库同步作为默认关闭的增强功能

- 检测 WSL libraries 可用性。
- 支持 `copy-missing`（只补缺）、`overwrite`（覆盖）、`mirror`（镜像+删除）三种模式。
- `mirror` 和 `overwrite` 模式默认关闭，需显式启用。
- 可选同步前备份。

### Phase 7：MCP 与扩展输出增强

- 现有 MCP compile/upload 工具的返回值中补充 backend 信息。
- 不新增独立的 WSL 工具。
- 返回值中包含：backend 类型、distro、workspace、编译命令摘要、产物路径、耗时。

---

## 8. 配置设计草案

建议在 `ArduFluxCurrentConfig` 中新增 `wsl` 字段：

```ts
interface ArduFluxWslState {
  /** 是否启用 WSL 编译后端，默认 false */
  enabled: boolean;
  /** WSL 发行版名称，留空时自动探测默认发行版 */
  distro: string;
  /** WSL 工作目录，留空时使用 $HOME/arduino-build/<project> */
  workspaceRoot: string;
  /** WSL 内 arduino-cli 可执行文件路径，默认 "arduino-cli" */
  arduinoCliPath: string;
  /** 项目同步配置 */
  syncProject: {
    /** 排除列表（逗号分隔或数组） */
    excludes: string[];
  };
  /** 库同步配置 */
  syncLibraries: {
    /** 是否启用库同步，默认 false */
    enabled: boolean;
    /** Windows Arduino libraries 源路径 */
    windowsPath: string;
    /** WSL Arduino libraries 目标路径 */
    wslPath: string;
    /** 同步模式：copy-missing / overwrite / mirror */
    mode: "copy-missing" | "overwrite" | "mirror";
    /** 同步前是否备份 WSL 已有库 */
    backup: boolean;
    /** 排除列表 */
    exclude: string[];
  };
}
```

在 `ArduFluxCurrentConfig` 中：

```ts
interface ArduFluxCurrentConfig {
  board: ArduFluxBoardState;
  port: ArduFluxPortState;
  build: ArduFluxBuildState;
  monitor: ArduFluxMonitorState;
  wsl?: ArduFluxWslState;  // 新增，可选，缺失时等同 enabled=false
}
```

**默认值**：

```ts
const DEFAULT_WSL_STATE: ArduFluxWslState = {
  enabled: false,
  distro: "",
  workspaceRoot: "",
  arduinoCliPath: "arduino-cli",
  syncProject: {
    excludes: [".git", "node_modules", ".vscode", ".trae"],
  },
  syncLibraries: {
    enabled: false,
    windowsPath: "",
    wslPath: "~/Arduino/libraries",
    mode: "copy-missing",
    backup: false,
    exclude: ["^\\.", "^tmp$"],
  },
};
```

**需同步更新的文件**（按 CLAUDE.md 联动要求）：

1. `src/types.ts` — TypeScript 类型 + Zod 校验 schema
2. `src/configStore.ts` — 读写逻辑、迁移逻辑、默认值
3. `src/uploader/uploader.ts` — 编译后端选择逻辑
4. `src/webviewController.ts` — 表单字段、`collectForm()`、`buildCurrentConfig()`

---

## 9. 风险表

| 风险 | 影响 | 缓解方案 |
|------|------|----------|
| WSL 未安装 | 编译无法启动 | 启动前检测 WSL 可用性，给出明确错误提示 |
| 指定的 distro 不存在 | 编译无法启动 | 检测已安装发行版列表，校验用户配置 |
| WSL 内未安装 arduino-cli | 编译失败 | 执行前检查 `which arduino-cli`，缺失时提示安装 |
| Windows/WSL 路径转换错误 | 找不到 sketch 或产物 | 建立路径转换单元测试，覆盖中文路径、空格路径 |
| shell quoting 错误 | 命令失败或命令注入 | 使用参数数组、严格转义、复用现有 `validateCliArgs` |
| `rsync --delete` 误删文件 | 数据丢失 | 默认不使用 `--delete`；如需 mirror 行为，必须显式配置并在 UI 中标注风险 |
| 库同步覆盖用户修改 | 库丢失或版本错乱 | 默认 `copy-missing`；overwrite/mirror 前提示风险 |
| WSL 编译产物与 Windows 上传输入不匹配 | 上传失败 | 明确 artifact 回传目录和 upload 输入路径，产物回传后校验文件存在性 |
| 多项目并发构建冲突 | 构建目录污染 | workspace 按项目名/路径隔离 |
| local 和 WSL arduino-cli 版本不一致 | 编译行为差异 | 在结果中输出 local/wsl arduino-cli 版本，供用户排查 |
| `src/scripts/upload.ps1` 未找到 | 文档依据不稳 | 标记为待核实项，不作为核心设计依赖 |

---

## 10. 验证方案

### 10.1 静态验证

- 配置 schema 校验通过（Zod）。
- 默认配置不改变现有本地编译上传行为。
- `wsl` 字段缺失或 `enabled: false` 时，所有现有测试保持通过。
- WSL 配置缺失时错误信息清晰。

### 10.2 单元测试

| 测试项 | 说明 |
|--------|------|
| Windows path → WSL mount path | `C:\Dev\OPC\ArduFlux` → `/mnt/c/Dev/OPC/ArduFlux` |
| Windows path → WSL workspace path | `C:\Dev\OPC\ArduFlux` → `$HOME/arduino-build/ArduFlux` |
| WSL path → Windows UNC path | `/home/user/arduino-build` → `\\wsl.localhost\DKC\home\user\arduino-build` |
| compile args 路径替换 | 将 `buildCompileArgs()` 结果中的 Windows 路径替换为 WSL 路径 |
| sync excludes 生成 | 默认排除 `.git`、`node_modules` 等 |
| WSL command builder | `wsl.exe -d <distro> -- arduino-cli compile ...` |
| WSL 执行结果解析 | 结构化返回 exitCode、stdout、stderr、elapsedMs |
| 配置默认值 | `wsl.enabled` 默认为 `false` |
| 配置迁移 | 旧版配置文件无 `wsl` 字段时正常加载 |

### 10.3 集成测试

| 场景 | 预期 |
|------|------|
| 本地 backend 编译 | 行为与当前完全一致 |
| WSL backend 环境检测失败 | 返回可读错误，不 crash |
| WSL backend 使用 mock executor | sync → compile → artifact sync 流程正确 |
| compile 成功后 upload | 仍调用现有 Windows 上传逻辑 |
| compile 失败 | 不执行 upload |
| monitor | 不依赖 WSL |

### 10.4 手工验证

在真实 Windows + WSL 环境下验证：

1. 未安装 WSL 时的错误提示。
2. WSL 存在但 distro 配错时的错误提示。
3. WSL 存在但无 arduino-cli 时的错误提示。
4. 正常同步小型 Arduino sketch 到 WSL。
5. WSL 中正常编译。
6. 编译产物回传到 Windows。
7. 使用 Windows 本地端口上传。
8. 上传后启动串口监视。
9. 启用库同步 copy-missing 模式。
10. 启用 exclude list。
11. 含空格路径的项目。
12. 含中文字符路径的项目。

### 10.5 项目验证命令

```bash
npm run compile
npm test
# 单文件测试
npm run compile && npx mocha dist/test/<具体文件名>.test.js
```

---

## 11. 待核实项

| 项目 | 说明 |
|------|------|
| `src/scripts/upload.ps1` | 项目 CLAUDE.md 提及此文件但当前未找到，需确认是否已删除、迁移或文档过期 |
| `arduino-cli.py` | WSL 脚本末尾调用的本地 Python 脚本，需确认其路径和能力是否与 ArduFlux 上传/监视功能重叠 |
| WSL distro 自动探测 | 需确认 `wsl.exe --list` 输出格式和默认发行版标记方式 |
| `\\wsl.localhost` 网络路径 | 需确认不同 Windows 版本（Win10/Win11）的兼容性 |
| rsync 可用性 | 需确认 WSL 默认是否包含 rsync，或是否需要安装提示 |
