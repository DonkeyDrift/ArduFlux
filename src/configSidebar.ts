import * as vscode from "vscode";
import * as path from "path";
import { ConfigStore } from "./configStore";
import { EmbeddedBoardConfig, EmbeddedCurrentConfig } from "./types";

export class ConfigTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly category: string,
    options?: {
      description?: string;
      tooltip?: string;
      iconId?: string;
    }
  ) {
    super(label, collapsibleState);
    this.description = options?.description;
    this.tooltip = options?.tooltip;
    if (options?.iconId) {
      this.iconPath = new vscode.ThemeIcon(options.iconId);
    }
    this.contextValue = category;
  }
}

export class ConfigSidebarProvider implements vscode.TreeDataProvider<ConfigTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ConfigTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private refreshInterval: NodeJS.Timeout | undefined;

  constructor(private readonly store: ConfigStore) {
    this.setupFileWatcher();
    this.setupInterval();
  }

  private setupFileWatcher(): void {
    const pattern = new vscode.RelativePattern(this.store.baseDir, "embedded_board_config.json");
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.fileWatcher.onDidChange(() => this.refresh());
    this.fileWatcher.onDidCreate(() => this.refresh());
  }

  private setupInterval(): void {
    this.refreshInterval = setInterval(() => this.refresh(), 5000);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {
    this.fileWatcher?.dispose();
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  getTreeItem(element: ConfigTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ConfigTreeItem): Promise<ConfigTreeItem[]> {
    const config = this.store.getData();
    const current = config.current;

    if (!element) {
      return this.buildRootItems(config, current);
    }

    switch (element.category) {
      case "group-board":
        return this.buildBoardChildren(current);
      case "group-port":
        return this.buildPortChildren(current);
      case "group-build":
        return this.buildBuildChildren(current);
      case "group-monitor":
        return this.buildMonitorChildren(current);
      case "group-profiles":
        return this.buildProfilesChildren(config);
      default:
        return [];
    }
  }

  private buildRootItems(config: EmbeddedBoardConfig, current: EmbeddedCurrentConfig): ConfigTreeItem[] {
    const items: ConfigTreeItem[] = [];

    items.push(
      new ConfigTreeItem(
        "板子",
        vscode.TreeItemCollapsibleState.Collapsed,
        "group-board",
        { description: current.board.name || "未配置", iconId: "circuit-board" }
      )
    );

    items.push(
      new ConfigTreeItem(
        "串口",
        vscode.TreeItemCollapsibleState.Collapsed,
        "group-port",
        { description: current.port.address || "未选择", iconId: "plug" }
      )
    );

    items.push(
      new ConfigTreeItem(
        "编译输出",
        vscode.TreeItemCollapsibleState.Collapsed,
        "group-build",
        { description: current.build.outputDir || "默认", iconId: "file-directory" }
      )
    );

    const monitorDesc = current.monitor.enabled ? `${current.monitor.baudRate}bps` : "未启用";
    items.push(
      new ConfigTreeItem(
        "监视器",
        vscode.TreeItemCollapsibleState.Collapsed,
        "group-monitor",
        { description: monitorDesc, iconId: "radio-tower" }
      )
    );

    const profileNames = Object.keys(config.profiles || {});
    items.push(
      new ConfigTreeItem(
        "Profiles",
        vscode.TreeItemCollapsibleState.Collapsed,
        "group-profiles",
        { description: `${profileNames.length} 个`, iconId: "list-unordered" }
      )
    );

    return items;
  }

  private buildBoardChildren(current: EmbeddedCurrentConfig): ConfigTreeItem[] {
    const pinCount = Object.keys(current.board.pinDefines || {}).length;
    return [
      new ConfigTreeItem(
        "名称",
        vscode.TreeItemCollapsibleState.None,
        "board-name",
        { description: current.board.name || "—" }
      ),
      new ConfigTreeItem(
        "FQBN",
        vscode.TreeItemCollapsibleState.None,
        "board-fqbn",
        { description: current.board.fqbn || "—" }
      ),
      new ConfigTreeItem(
        "编译参数",
        vscode.TreeItemCollapsibleState.None,
        "board-args",
        {
          description: current.board.compileArgs.length > 0 ? current.board.compileArgs.join(" ") : "—",
          tooltip: current.board.compileArgs.join(" ") || "无额外编译参数"
        }
      ),
      new ConfigTreeItem(
        "引脚定义",
        vscode.TreeItemCollapsibleState.None,
        "board-pins",
        { description: `${pinCount} 项` }
      ),
    ];
  }

  private buildPortChildren(current: EmbeddedCurrentConfig): ConfigTreeItem[] {
    return [
      new ConfigTreeItem(
        "地址",
        vscode.TreeItemCollapsibleState.None,
        "port-address",
        { description: current.port.address || "—" }
      ),
      new ConfigTreeItem(
        "自动选择",
        vscode.TreeItemCollapsibleState.None,
        "port-auto",
        { description: current.port.auto ? "是" : "否" }
      ),
    ];
  }

  private buildBuildChildren(current: EmbeddedCurrentConfig): ConfigTreeItem[] {
    return [
      new ConfigTreeItem(
        "输出目录",
        vscode.TreeItemCollapsibleState.None,
        "build-output",
        {
          description: current.build.outputDir || "—",
          tooltip: current.build.outputDir
            ? path.resolve(this.store.baseDir, current.build.outputDir)
            : "使用默认输出目录"
        }
      ),
      new ConfigTreeItem(
        "最近路径",
        vscode.TreeItemCollapsibleState.None,
        "build-recent",
        {
          description: `${(current.build.recentOutputDirs || []).length} 个`,
          tooltip: (current.build.recentOutputDirs || []).join("\n") || "无最近路径"
        }
      ),
    ];
  }

  private buildMonitorChildren(current: EmbeddedCurrentConfig): ConfigTreeItem[] {
    return [
      new ConfigTreeItem(
        "启用",
        vscode.TreeItemCollapsibleState.None,
        "monitor-enabled",
        { description: current.monitor.enabled ? "是" : "否" }
      ),
      new ConfigTreeItem(
        "波特率",
        vscode.TreeItemCollapsibleState.None,
        "monitor-baud",
        { description: String(current.monitor.baudRate || "—") }
      ),
      new ConfigTreeItem(
        "数据位",
        vscode.TreeItemCollapsibleState.None,
        "monitor-databits",
        { description: String(current.monitor.dataBits || "—") }
      ),
      new ConfigTreeItem(
        "停止位",
        vscode.TreeItemCollapsibleState.None,
        "monitor-stopbits",
        { description: String(current.monitor.stopBits || "—") }
      ),
      new ConfigTreeItem(
        "校验位",
        vscode.TreeItemCollapsibleState.None,
        "monitor-parity",
        { description: current.monitor.parity || "—" }
      ),
      new ConfigTreeItem(
        "换行符",
        vscode.TreeItemCollapsibleState.None,
        "monitor-newline",
        { description: current.monitor.newline || "—" }
      ),
    ];
  }

  private buildProfilesChildren(config: EmbeddedBoardConfig): ConfigTreeItem[] {
    const names = Object.keys(config.profiles || {}).sort();
    if (names.length === 0) {
      return [
        new ConfigTreeItem(
          "（无）",
          vscode.TreeItemCollapsibleState.None,
          "profile-empty"
        ),
      ];
    }
    return names.map((name) =>
      new ConfigTreeItem(
        name,
        vscode.TreeItemCollapsibleState.None,
        "profile-item",
        { iconId: "symbol-variable" }
      )
    );
  }
}
