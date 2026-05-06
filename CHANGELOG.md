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
- 编译阶段增加“循环流动点”UI 动画
- 增加单元测试 `tests/`
