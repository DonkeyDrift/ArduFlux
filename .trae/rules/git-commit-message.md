---
alwaysApply: true
scene: git_message
---

# Git Commit Message 规则

## 格式规范

使用 **Conventional Commits** 标准格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

- `subject`：简短描述（中文或英文，首字母小写，末尾不加句号，不超过 50 字符）
- `body`：可选，详细说明改动原因和细节（当改动较复杂或需要解释时添加）
- `footer`：可选，关联 Issue 或破坏性变更说明

## 类型 (type)

| 类型 | 说明 |
|------|------|
| `feat` | 新功能（如新增 Webview 面板控件、新增 Profile 导入导出） |
| `fix` | Bug 修复（如修复串口枚举失败、修复 JSON 解析异常） |
| `docs` | 文档更新（README、AGENTS.md、embedded_config.md） |
| `style` | 代码格式调整（缩进、分号、空行等，不影响逻辑） |
| `refactor` | 代码重构（既不修复 bug 也不添加功能） |
| `perf` | 性能优化（如减少 Webview 重绘、优化串口扫描频率） |
| `test` | 测试相关（新增/修改 Python 单元测试） |
| `chore` | 构建/工具/依赖更新（package.json、tsconfig.json、vsce 打包） |
| `build` | 编译输出更新（dist/ 目录变更） |

## 范围 (scope)

根据项目模块选择，可选值：

- `ext` / `vscode` — VS Code 扩展主逻辑
- `panel` — Webview 配置面板（UI、HTML、CSS、JS）
- `config` — 配置读写与校验（configStore.ts / config.py）
- `types` — 类型定义
- `python` — Python 遗留工具（embedded_config/ 模块）
- `ps1` — PowerShell 上传脚本
- `arduino` — Arduino 草图（TouchButton.ino）
- `docs` — 文档
- `repo` — 仓库配置（.gitignore、CI 等）

无特定范围或跨多个模块时，可省略 `(<scope>)`。

## 示例

```
feat(panel): 添加串口监视器参数实时预览

在 Webview 中新增波特率、数据位、停止位、校验位的只读预览区域，
方便用户确认当前配置无需展开下拉框。
```

```
fix(config): 规范化 COM 端口大小写

Windows 环境下将 com36 统一转为 COM36，
确保与 arduino-cli board list 输出一致。
```

```
refactor(python): 提取串口占用检测为独立函数

将 is_port_busy 从 ConfigStore 中抽出，
便于单元测试 mock 和后续平台适配。
```

```
chore: 升级 TypeScript 至 5.9
```

## 注意事项

- 一次 commit 只做一个逻辑改动，避免混杂无关变更
- 修复 bug 时，subject 应描述问题而非解决方案，如 `fix(config): 修复相对路径未基于项目根目录解析`
- 涉及 upload.ps1 与 JSON 结构联动的修改，body 中需注明兼容性影响
- 不生成无意义的 body（如 `update` / `fix bug` / `修改代码` 等）
