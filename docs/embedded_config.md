---
title: 嵌入式开发板配置管理模块
schemaVersion: 1
---

# 快速开始

## 1. 图形化配置（推荐）

在项目目录执行：

```bash
python -m embedded_config.ui
```

保存后会生成/更新配置文件：

- `ArduFlux.json`

## 2. 命令行（可脚本化）

```bash
python -m embedded_config.cli show
python -m embedded_config.cli validate
python -m embedded_config.cli ports
python -m embedded_config.cli profile save dev
python -m embedded_config.cli profile export profiles.json
python -m embedded_config.cli profile import profiles.json
```

## 3. 与 upload.ps1 联动

当项目根目录存在 `ArduFlux.json` 时，[upload.ps1](file:///c:/Dev/FFE/Baoshan/Example/TouchButton/upload.ps1) 会优先读取其中的配置：

- 板子型号：`current.board.fqbn`
- 串口：`current.port.address`
- 编译输出目录：`current.build.outputDir`（映射到 `arduino-cli compile --output-dir`）
- 串口监视器：`current.monitor.enabled/baudRate`

# 配置文件格式（JSON）

配置文件模板见：`ArduFlux.template.json`

核心字段：

- `schemaVersion`: 配置版本
- `current`: 当前生效配置
  - `board`: `name/fqbn/compileArgs/pinDefines`
  - `port`: `address/auto`
  - `build`: `outputDir/recentOutputDirs`（最近 5 次）
  - `monitor`: `enabled/baudRate/dataBits/stopBits/parity/newline`
- `profiles`: 预设集合 `{ name: config }`

# API 说明（Python）

模块入口：`embedded_config/config.py`

## ConfigStore

- `load() / save()`: 读写 JSON
- `validate_all()`: 全量校验并给出错误原因/建议
- `set_board(...) / set_port(...) / set_output_dir(...) / set_monitor(...)`: 设置并校验单项
- `save_profile(name) / apply_profile(name) / delete_profile(name)`: Profile 管理
- `export_profiles(path) / import_profiles(path)`: 导入导出 Profiles

## 串口工具

- `list_serial_ports()`: 通过 `arduino-cli board list` 枚举串口（跨平台）
- `is_port_busy(port)`: 尝试判断端口是否占用（Windows/类 Unix）

# 示例代码

```python
from embedded_config.config import ConfigStore

store = ConfigStore(base_dir=".")
store.load()
store.set_board(name="ESP32-S3 (Generic)", fqbn="esp32:esp32:esp32s3")
store.set_port(address="COM36", auto=True)
store.set_output_dir(output_dir="build")
store.set_monitor(enabled=True, baudRate=115200)
store.save_profile("dev")
store.save()
```

