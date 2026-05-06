---
name: "embedded-board-config"
description: "统一管理嵌入式开发板配置（板型/FQBN、串口、编译输出目录、串口监视器、Profiles、导入导出）。当你要为 Arduino/ESP32/STM32 等项目做配置选择、校验、保存并驱动编译/上传脚本时调用。"
---

# Embedded Board Config

本技能用于在项目内统一管理“板子型号 + 串口 + 编译输出路径 + 串口监视器参数”，并支持将这些配置保存为可切换的 Profile（预设）。同时提供导入/导出 JSON、校验与错误提示，并可驱动项目脚本（如 upload.ps1）完成编译/上传/监视器。

## 何时调用

- 需要新增/修改开发板型号（FQBN）并希望自动带出相关参数（如编译参数、引脚定义）
- 需要枚举/刷新串口列表、自动选择或校验串口占用
- 需要选择/校验编译输出目录，并维护最近使用路径
- 需要一键控制上传后是否自动打开串口监视器，并配置监视器参数
- 需要把一组配置保存为 Profile 并快速切换，或做 JSON 导入/导出

## 交付物（本项目内）

- Python 配置模块：`embedded_config/config.py`
- 图形化配置工具（tkinter）：`embedded_config/ui.py`
- 命令行入口：`embedded_config/cli.py`
- 配置文件：`embedded_board_config.json`（自动生成/更新）
- 配置模板：`embedded_board_config.template.json`
- 测试：`tests/`

## 快速使用

### 1) 打开图形化配置

```bash
python -m embedded_config.ui
```

### 2) 仅查看/校验当前配置（CLI）

```bash
python -m embedded_config.cli show
python -m embedded_config.cli validate
python -m embedded_config.cli ports --refresh
```

### 3) 与 upload.ps1 联动

当 `embedded_board_config.json` 存在时，`upload.ps1` 会优先读取其中的配置（板型/FQBN、串口、输出目录、监视器开关与波特率等），实现统一管理。

## 开发工作流（VSIX 打包与安装）

本项目为 VS Code 扩展（VSIX）。每次代码修改后，按以下步骤打包并安装到当前 IDE：

### 1) 编译 + 打包

```bash
npm run package
```

- 自动执行 `vscode:prepublish` → `tsc -p ./` 编译 TypeScript
- 使用 `vsce package` 生成 `embedded-board-config-*.vsix`

### 2) 安装到 IDE 并 reload

```bash
npm run install:vsix
```

内部调用 `install-vsix.ps1`，自动完成：
1. 检测 IDE CLI（优先 TRAE `trae`， fallback VS Code `code`）
2. 卸载旧版扩展（如果已安装）
3. 安装当前目录下最新的 `.vsix` 文件
4. 提示手动 reload 窗口（Ctrl+Shift+P → "Developer: Reload Window"）

> **约定：每次开发完成后，必须顺序执行 `npm run package` 和 `npm run install:vsix`，确保修改生效。**

### 快捷命令

| 命令 | 作用 |
|------|------|
| `npm run compile` | 仅编译 TypeScript |
| `npm run package` | 编译 + 打包 VSIX |
| `npm run install:vsix` | 安装 VSIX 到当前 IDE |
| `npm run install:vsix:trae` | 强制安装到 TRAE |
| `npm run install:vsix:code` | 强制安装到 VS Code |

## 常见问题

- 上传提示串口被占用：先关闭串口监视器，再上传；脚本会尝试自动释放占用。
- 未识别板型：可以在 UI 中手动录入 FQBN，并保存为 Profile。
