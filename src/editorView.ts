import * as vscode from "vscode";
import { ConfigStore } from "./configStore";
import { ConfigEditorController } from "./webviewController";
import { EMBEDDED_BOARD_CONFIG_EDITOR_VIEW_ID } from "./viewIds";

export class EmbeddedBoardConfigEditorProvider implements vscode.WebviewViewProvider {
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
      `[view] resolveWebviewView called (viewId=${EMBEDDED_BOARD_CONFIG_EDITOR_VIEW_ID}, visible=${webviewView.visible})`
    );

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      webviewView.webview.html = this.simpleHtml("请先打开一个工作区文件夹");
      this.log(`[view] No workspace root found for viewId=${EMBEDDED_BOARD_CONFIG_EDITOR_VIEW_ID}`);
      return;
    }

    webviewView.webview.options = {
      enableScripts: true
    };
    this.log(
      `[view] Webview options applied (viewId=${EMBEDDED_BOARD_CONFIG_EDITOR_VIEW_ID}, enableScripts=${webviewView.webview.options.enableScripts === true})`
    );

    // 先显示加载中，避免空白
    webviewView.webview.html = this.simpleHtml("加载配置中...");
    this.log(`[view] Placeholder HTML rendered for viewId=${EMBEDDED_BOARD_CONFIG_EDITOR_VIEW_ID}`);

    const store = new ConfigStore(root);
    this.controller = new ConfigEditorController(this.context, store, this.log);
    this.controller.attach(webviewView.webview);

    await this.controller.initialize().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`[view] Failed to initialize controller (viewId=${EMBEDDED_BOARD_CONFIG_EDITOR_VIEW_ID}): ${msg}`);
      webviewView.webview.html = this.simpleHtml(`加载失败: ${msg}`);
    });
    await this.controller.syncView("配置编辑器已加载");
    this.log(`[view] Initial state posted for viewId=${EMBEDDED_BOARD_CONFIG_EDITOR_VIEW_ID}`);

    webviewView.onDidDispose(() => {
      this.log(`[view] Disposed viewId=${EMBEDDED_BOARD_CONFIG_EDITOR_VIEW_ID}`);
      this.controller?.dispose();
      this.controller = undefined;
      this.webviewView = undefined;
    });

    webviewView.onDidChangeVisibility(() => {
      this.log(
        `[view] Visibility changed (viewId=${EMBEDDED_BOARD_CONFIG_EDITOR_VIEW_ID}, visible=${webviewView.visible})`
      );
      if (webviewView.visible) {
        void this.controller?.syncView();
      }
    });
  }

  private simpleHtml(text: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
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
