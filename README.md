# Embedded Board Config

将当前项目里的嵌入式开发板配置工具改造成标准 VS Code 扩展，并可打包为 `VSIX` 安装包。

## 功能

- 管理 `embedded_board_config.json`
- 编辑板型名称、`FQBN`、编译参数、引脚定义
- 枚举串口并推荐 USB 端口
- 管理编译输出目录和最近使用路径
- 配置串口监视器参数
- 保存、应用、删除、导入、导出 `Profiles`
- 与现有 `upload.ps1` 保持兼容

## 命令

安装扩展后，在命令面板中可用：

- `Embedded Board Config: Open Panel`
- `Embedded Board Config: Validate Current Config`
- `Embedded Board Config: Open Config File`

## 本地开发

在项目根目录执行：

```bash
npm install
npm run compile
```

编译输出目录：

- `dist/`

## 打包 VSIX

```bash
npm run package
```

生成的安装包位于项目根目录，文件名类似：

- `embedded-board-config-0.2.0.vsix`

## 安装 VSIX

在 VS Code 中打开：

1. 扩展视图
2. 右上角 `...`
3. 选择 `Install from VSIX...`
4. 选择生成的 `.vsix` 文件

## 数据文件

扩展直接读写以下文件：

- `embedded_board_config.json`

数据格式保持和 `upload.ps1` 一致，因此上传脚本无需修改即可继续使用。
