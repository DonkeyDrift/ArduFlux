## [0.1.0] - 2026-05-05

- 新增统一配置管理模块 `embedded_config/`（JSON 持久化、校验、Profiles、导入导出）
- 新增 tkinter 图形化配置工具 `python -m embedded_config.ui`
- 新增命令行工具 `python -m embedded_config.cli`
- `upload.ps1` 支持读取 `embedded_board_config.json`，支持编译输出目录与监视器开关
- 编译阶段增加“循环流动点”UI 动画
- 增加单元测试 `tests/`

