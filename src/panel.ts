import * as vscode from "vscode";
import { ConfigStore } from "./configStore";
import { ConfigEditorController } from "./webviewController";

export class ArduFluxPanel {
  static currentPanel: ArduFluxPanel | undefined;
  private controller: ConfigEditorController;

  static async createOrShow(context: vscode.ExtensionContext, store: ConfigStore): Promise<void> {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (ArduFluxPanel.currentPanel) {
      ArduFluxPanel.currentPanel.panel.reveal(column);
      await ArduFluxPanel.currentPanel.controller.syncView();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "arduflux",
      "ArduFlux",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    const instance = new ArduFluxPanel(panel, context, store);
    ArduFluxPanel.currentPanel = instance;
    await instance.controller.initialize();
  }

  private constructor(
    public readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly store: ConfigStore
  ) {
    this.controller = new ConfigEditorController(context, store);
    this.controller.attach(panel.webview);

    this.panel.onDidDispose(() => {
      ArduFluxPanel.currentPanel = undefined;
      this.controller.dispose();
    }, null, this.context.subscriptions);
  }

  async compileSketch(): Promise<void> {
    return this.controller.compileSketch();
  }

  async uploadSketch(): Promise<void> {
    return this.controller.uploadSketch();
  }
}
