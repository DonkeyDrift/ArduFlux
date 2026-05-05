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

## 常见问题

- 上传提示串口被占用：先关闭串口监视器，再上传；脚本会尝试自动释放占用。
- 未识别板型：可以在 UI 中手动录入 FQBN，并保存为 Profile。
