import * as vscode from "vscode";
import * as path from "path";
import { ConfigStore } from "./configStore";
import { ArduFluxConfig, ArduFluxCurrentConfig } from "./types";

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
    const pattern = new vscode.RelativePattern(this.store.baseDir, "ArduFlux.json");
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

  private buildRootItems(config: ArduFluxConfig, current: ArduFluxCurrentConfig): ConfigTreeItem[] {
    const items: ConfigTreeItem[] = [];

    items.push(
      new ConfigTreeItem(
        vscode.l10n.t("Board"),
        vscode.TreeItemCollapsibleState.Collapsed,
        "group-board",
        { description: current.board.name || vscode.l10n.t("Not configured"), iconId: "circuit-board" }
      )
    );

    items.push(
      new ConfigTreeItem(
        vscode.l10n.t("Serial Port"),
        vscode.TreeItemCollapsibleState.Collapsed,
        "group-port",
        { description: current.port.address || vscode.l10n.t("Not selected"), iconId: "plug" }
      )
    );

    items.push(
      new ConfigTreeItem(
        vscode.l10n.t("Build Output"),
        vscode.TreeItemCollapsibleState.Collapsed,
        "group-build",
        { description: current.build.outputDir || vscode.l10n.t("Default"), iconId: "file-directory" }
      )
    );

    const monitorDesc = current.monitor.enabled ? `${current.monitor.baudRate}bps` : vscode.l10n.t("Disabled");
    items.push(
      new ConfigTreeItem(
        vscode.l10n.t("Monitor"),
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
        { description: vscode.l10n.t("{0} item(s)", String(profileNames.length)), iconId: "list-unordered" }
      )
    );

    return items;
  }

  private buildBoardChildren(current: ArduFluxCurrentConfig): ConfigTreeItem[] {
    const pinCount = Object.keys(current.board.pinDefines || {}).length;
    return [
      new ConfigTreeItem(
        vscode.l10n.t("Name"),
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
        vscode.l10n.t("Compile Args"),
        vscode.TreeItemCollapsibleState.None,
        "board-args",
        {
          description: current.board.compileArgs.length > 0 ? current.board.compileArgs.join(" ") : "—",
          tooltip: current.board.compileArgs.join(" ") || vscode.l10n.t("No extra compile arguments")
        }
      ),
      new ConfigTreeItem(
        vscode.l10n.t("Pin Defines"),
        vscode.TreeItemCollapsibleState.None,
        "board-pins",
        { description: vscode.l10n.t("{0} item(s)", String(pinCount)) }
      ),
    ];
  }

  private buildPortChildren(current: ArduFluxCurrentConfig): ConfigTreeItem[] {
    return [
      new ConfigTreeItem(
        vscode.l10n.t("Address"),
        vscode.TreeItemCollapsibleState.None,
        "port-address",
        { description: current.port.address || "—" }
      ),
      new ConfigTreeItem(
        vscode.l10n.t("Auto-select"),
        vscode.TreeItemCollapsibleState.None,
        "port-auto",
        { description: current.port.auto ? vscode.l10n.t("Yes") : vscode.l10n.t("No") }
      ),
    ];
  }

  private buildBuildChildren(current: ArduFluxCurrentConfig): ConfigTreeItem[] {
    return [
      new ConfigTreeItem(
        vscode.l10n.t("Output Directory"),
        vscode.TreeItemCollapsibleState.None,
        "build-output",
        {
          description: current.build.outputDir || "—",
          tooltip: current.build.outputDir
            ? path.resolve(this.store.baseDir, current.build.outputDir)
            : vscode.l10n.t("Using default output directory")
        }
      ),
      new ConfigTreeItem(
        vscode.l10n.t("Recent Paths"),
        vscode.TreeItemCollapsibleState.None,
        "build-recent",
        {
          description: vscode.l10n.t("{0} item(s)", String((current.build.recentOutputDirs || []).length)),
          tooltip: (current.build.recentOutputDirs || []).join("\n") || vscode.l10n.t("No recent paths")
        }
      ),
    ];
  }

  private buildMonitorChildren(current: ArduFluxCurrentConfig): ConfigTreeItem[] {
    return [
      new ConfigTreeItem(
        vscode.l10n.t("Enabled"),
        vscode.TreeItemCollapsibleState.None,
        "monitor-enabled",
        { description: current.monitor.enabled ? vscode.l10n.t("Yes") : vscode.l10n.t("No") }
      ),
      new ConfigTreeItem(
        vscode.l10n.t("Baud Rate"),
        vscode.TreeItemCollapsibleState.None,
        "monitor-baud",
        { description: String(current.monitor.baudRate || "—") }
      ),
      new ConfigTreeItem(
        vscode.l10n.t("Data Bits"),
        vscode.TreeItemCollapsibleState.None,
        "monitor-databits",
        { description: String(current.monitor.dataBits || "—") }
      ),
      new ConfigTreeItem(
        vscode.l10n.t("Stop Bits"),
        vscode.TreeItemCollapsibleState.None,
        "monitor-stopbits",
        { description: String(current.monitor.stopBits || "—") }
      ),
      new ConfigTreeItem(
        vscode.l10n.t("Parity"),
        vscode.TreeItemCollapsibleState.None,
        "monitor-parity",
        { description: current.monitor.parity || "—" }
      ),
      new ConfigTreeItem(
        vscode.l10n.t("Newline"),
        vscode.TreeItemCollapsibleState.None,
        "monitor-newline",
        { description: current.monitor.newline || "—" }
      ),
    ];
  }

  private buildProfilesChildren(config: ArduFluxConfig): ConfigTreeItem[] {
    const names = Object.keys(config.profiles || {}).sort();
    if (names.length === 0) {
      return [
        new ConfigTreeItem(
          vscode.l10n.t("(none)"),
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
