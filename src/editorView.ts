import * as vscode from "vscode";
import { ConfigStore } from "./configStore";
import { ConfigEditorController } from "./webviewController";

export class EmbeddedBoardConfigEditorProvider implements vscode.WebviewViewProvider {
  controller: ConfigEditorController | undefined;
  private webviewView: vscode.WebviewView | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.webviewView = webviewView;

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      webviewView.webview.html = this.simpleHtml("请先打开一个工作区文件夹");
      return;
    }

    webviewView.webview.options = {
      enableScripts: true
    };

    // 先显示加载中，避免空白
    webviewView.webview.html = this.simpleHtml("加载配置中...");

    const store = new ConfigStore(root);
    this.controller = new ConfigEditorController(this.context, store);
    this.controller.attach(webviewView.webview);

    await this.controller.initialize().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      webviewView.webview.html = this.simpleHtml(`加载失败: ${msg}`);
    });

    webviewView.onDidDispose(() => {
      this.controller?.dispose();
      this.controller = undefined;
      this.webviewView = undefined;
    });

    webviewView.onDidChangeVisibility(() => {
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
