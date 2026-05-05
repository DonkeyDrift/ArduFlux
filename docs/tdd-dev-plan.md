# 扩展核心功能 TDD 开发方案

## 目标

为 VS Code 扩展建立完整的 TypeScript 单元测试体系，覆盖 `types.ts` 与 `configStore.ts` 的核心逻辑，并确立后续功能迭代的 TDD 工作流。

## 测试策略

| 层级 | 框架 | 覆盖范围 | 运行环境 |
|------|------|----------|----------|
| 单元测试 | Mocha + Chai + Sinon | `types.ts`、`configStore.ts` 纯逻辑（校验、序列化、Profile 管理、路径处理等） | Node.js（无需 VS Code 实例） |
| 集成测试 | `@vscode/test-cli` + `mocha` | `extension.ts`、`panel.ts`（命令注册、Webview 通信） | VS Code Extension Host（后续阶段） |

**本期范围**：完成单元测试层，建立 TDD 基础设施。

## TDD 流程（红 → 绿 → 重构）

1. **红**：编写失败的测试，明确输入输出与边界条件
2. **绿**：编写最小实现使测试通过，允许临时简化
3. **重构**：在不改变行为的前提下优化代码结构，保持测试通过

---

## 实施记录

### ✅ Phase 1 — 基础设施

- **依赖安装**：`mocha`, `chai`, `sinon`, `@types/mocha`, `@types/chai`, `@types/sinon`
- **tsconfig.json**：在 `types` 数组中追加 `"mocha"`、`"chai"`，使编译器识别测试全局API
- **package.json scripts**：
  - `"test"`: `npm run compile && mocha "dist/test/**/*.test.js"`
  - `"test:watch"`: `tsc -w -p ./ & mocha --watch "dist/test/**/*.test.js"`
- **.vscodeignore**：排除 `dist/test/**`，避免测试产物进入 VSIX

### ✅ Phase 2 — types.ts 单元测试

**测试文件**：`src/test/types.test.ts`（9 例，全绿）

- `CONFIG_FILE_NAME` 常量断言
- `createDefaultConfig()`：schemaVersion、default profile、各字段默认值、深拷贝隔离性
- `DEFAULT_BOARD_CATALOG`：预置板型存在性、字段完整性

### ✅ Phase 3 — configStore.ts 纯逻辑单元测试

**测试文件**：`src/test/configStore.logic.test.ts`（28 例，全绿）

为支持测试，将以下纯工具函数改为 `export`：
- `deepClone`、`dedupeKeepLatest`、`normalizePath`、`validateFqbn`
- `isUsbPort`、`normalizeSerialAddress`、`mapJsonPortEntry`

覆盖点：
- `ValidationError`：message / suggestion / name
- `deepClone`：对象与数组深拷贝
- `dedupeKeepLatest`：去重、limit 截断、空字符串过滤
- `normalizePath`：绝对路径保留、相对路径解析、环境变量展开、空路径异常
- `validateFqbn`：合法值通过、空值/格式错误抛异常
- `isUsbPort`：label/protocol/type 含 USB 识别
- `normalizeSerialAddress`：COM 大写转换、非 COM 保持
- `mapJsonPortEntry`：字符串、对象、嵌套 port、无效输入
- `recommendSerialPort`：空列表、autoSelect true/false、USB 优先级、无 USB 回退

### ✅ Phase 4 — ConfigStore 类测试

**测试文件**：`src/test/configStore.store.test.ts`（30 例，全绿）

使用 `sinon.stub(fs.promises, "readFile" / "writeFile" / "mkdir")` 进行文件系统 Mock。

覆盖点：
- `load()`：ENOENT 生成默认配置、合法 JSON 加载、v0→v1 迁移、不支持版本抛 ValidationError
- `save()`：格式化 JSON 写入断言
- `validateBoard()`：合法 FQBN 通过、空 FQBN 抛异常
- `validateMonitor()`：禁用直接通过、各参数合法性（波特率、数据位、停止位、校验位、换行符）
- `setOutputDir()`：路径记录、recentOutputDirs 去重上限 5
- Profile 管理：`saveProfile`（含空名称边界）、`applyProfile`（含不存在边界）、`deleteProfile`（保留 default）
- `exportProfiles()`：写出内容含 profiles
- `importProfiles()`：merge=true 合并、merge=false 覆盖、非法格式抛 ValidationError

---

## 运行命令

```bash
# 运行全部单元测试
npm test

# 监视模式（Windows 建议分两个终端分别运行 tsc -w 与 mocha --watch）
npm run test:watch

# 编译 + 打包 VSIX（测试产物会自动排除）
npm run package
```

## 当前测试统计

- **总计**：67 例通过，0 失败
- **覆盖模块**：`types.ts`、`configStore.ts`
- **Mock 技术**：Sinon stub（fs.promises readFile / writeFile / mkdir）

---

## ✅ Phase 5 — 新功能 TDD 实战：串口监视器一键打开

以"新增串口监视器一键打开"功能为例，完整演示了红→绿→重构→集成的 TDD 迭代。

### 实施记录

**测试文件**：`src/test/configStore.feature.test.ts`（11 例，全绿）

- `buildMonitorArgs`：端口、FQBN、波特率、数据位、停止位、校验位参数构造
- `execFileText`：命令执行 stdout 捕获、异常命令返回非零 exitCode

**实现变更**：

1. `src/configStore.ts`
   - 导出 `execFileText`（便于独立测试）
   - 新增并导出 `buildMonitorArgs(opts)`：纯函数，按 arduino-cli monitor 规范构造参数数组，跳过 `parity=none`，仅保留合法数据位/停止位

2. `src/panel.ts`
   - HTML toolbar 新增「打开串口监视器」按钮
   - Webview script 新增 `open-monitor` 消息发送
   - `handleMessage` 新增 `open-monitor` 分支
   - 新增 `openMonitor()` 方法：
     - 校验 `monitor.enabled` 与 `port.address`
     - 调用 `buildMonitorArgs` 构造参数
     - 使用 `vscode.window.createTerminal` 在集成终端中启动 `arduino-cli monitor`，用户可实时查看输出并 Ctrl+C 停止

---

## 验收标准

- [x] `npm test` 可一键运行，零报错
- [x] 核心纯逻辑模块具备完整单元测试
- [x] VSIX 打包正常，测试产物不混入安装包
- [x] package.json scripts 包含 `test` 与 `test:watch`
- [ ] 集成测试（extension / panel）—— 后续阶段用 `@vscode/test-cli` 补充
