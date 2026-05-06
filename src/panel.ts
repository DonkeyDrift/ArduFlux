import * as vscode from "vscode";
import { ConfigStore } from "./configStore";
import { ConfigEditorController } from "./webviewController";

export class EmbeddedBoardConfigPanel {
  static currentPanel: EmbeddedBoardConfigPanel | undefined;
  private controller: ConfigEditorController;

  static async createOrShow(context: vscode.ExtensionContext, store: ConfigStore): Promise<void> {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (EmbeddedBoardConfigPanel.currentPanel) {
      EmbeddedBoardConfigPanel.currentPanel.panel.reveal(column);
      await EmbeddedBoardConfigPanel.currentPanel.controller.syncView();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "embeddedBoardConfig",
      "Embedded Board Config",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    const instance = new EmbeddedBoardConfigPanel(panel, context, store);
    EmbeddedBoardConfigPanel.currentPanel = instance;
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
      EmbeddedBoardConfigPanel.currentPanel = undefined;
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
