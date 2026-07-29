import * as vscode from "vscode";
import { ConfigStore } from "./configStore";
import { ConfigEditorController } from "./webviewController";
import { ARDUFLUX_EDITOR_VIEW_ID } from "./viewIds";

export class ArduFluxEditorProvider implements vscode.WebviewViewProvider {
  controller: ConfigEditorController | undefined;
  private webviewView: vscode.WebviewView | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: (message: string) => void = () => {}
  ) {}

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.webviewView = webviewView;
    this.log(
      `[view] resolveWebviewView called (viewId=${ARDUFLUX_EDITOR_VIEW_ID}, visible=${webviewView.visible})`
    );

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      webviewView.webview.html = this.simpleHtml(vscode.l10n.t("Please open a workspace folder first"));
      this.log(`[view] No workspace root found for viewId=${ARDUFLUX_EDITOR_VIEW_ID}`);
      return;
    }

    webviewView.webview.options = {
      enableScripts: true
    };
    this.log(
      `[view] Webview options applied (viewId=${ARDUFLUX_EDITOR_VIEW_ID}, enableScripts=${webviewView.webview.options.enableScripts === true})`
    );

    // Show a loading placeholder first to avoid a blank view
    webviewView.webview.html = this.simpleHtml(vscode.l10n.t("Loading configuration..."));
    this.log(`[view] Placeholder HTML rendered for viewId=${ARDUFLUX_EDITOR_VIEW_ID}`);

    const store = new ConfigStore(root);
    this.controller = new ConfigEditorController(this.context, store, this.log);
    this.controller.attach(webviewView.webview);

    await this.controller.initialize().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`[view] Failed to initialize controller (viewId=${ARDUFLUX_EDITOR_VIEW_ID}): ${msg}`);
      webviewView.webview.html = this.simpleHtml(vscode.l10n.t("Loading failed: {0}", msg));
    });
    await this.controller.syncView(vscode.l10n.t("Configuration editor loaded"));
    this.log(`[view] Initial state posted for viewId=${ARDUFLUX_EDITOR_VIEW_ID}`);

    webviewView.onDidDispose(() => {
      this.log(`[view] Disposed viewId=${ARDUFLUX_EDITOR_VIEW_ID}`);
      this.controller?.dispose();
      this.controller = undefined;
      this.webviewView = undefined;
    });

    webviewView.onDidChangeVisibility(() => {
      this.log(
        `[view] Visibility changed (viewId=${ARDUFLUX_EDITOR_VIEW_ID}, visible=${webviewView.visible})`
      );
      if (webviewView.visible) {
        void this.controller?.syncView();
      }
    });
  }

  private simpleHtml(text: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><style>
body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground);background:var(--vscode-editor-background);}
</style></head>
<body><p>${text}</p></body>
</html>`;
  }

  async compileSketch(): Promise<void> {
    await this.controller?.compileSketch();
  }

  async uploadSketch(): Promise<void> {
    await this.controller?.uploadSketch();
  }
}
