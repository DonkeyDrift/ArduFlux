import * as vscode from "vscode";
import { ConfigStore, ValidationError, buildCompileArgs, buildMonitorArgs, buildUploadArgs } from "./configStore";
import { ArduFluxEditorProvider } from "./editorView";
import { ArduFluxPanel } from "./panel";
import { onDidChangeArduFluxConfig } from "./events";
import { runInTerminal, runUploadScript } from "./terminal";
import { formatStatusBarText } from "./statusBar";
import { ARDUFLUX_EDITOR_VIEW_ID } from "./viewIds";
import { startMcpSseServer } from "./mcp/extensionIntegration";

function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new ValidationError("请先打开一个工作区文件夹，再使用 开发板配置");
  }
  return folder.uri.fsPath;
}

function formatError(error: unknown): string {
  if (error instanceof ValidationError) {
    return error.suggestion ? `${error.message}\n建议：${error.suggestion}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

async function withStore<T>(run: (store: ConfigStore) => Promise<T>): Promise<T> {
  const root = getWorkspaceRoot();
  const store = new ConfigStore(root);
  await store.load();
  return run(store);
}

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("开发板配置");
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine("[activate] Extension activating...");

  // 注册侧边栏 WebviewViewProvider
  const editorProvider = new ArduFluxEditorProvider(context, (message) => {
    outputChannel.appendLine(message);
  });
  try {
    outputChannel.appendLine(`[activate] Registering WebviewViewProvider for viewId=${ARDUFLUX_EDITOR_VIEW_ID}`);
    const registration = vscode.window.registerWebviewViewProvider(ARDUFLUX_EDITOR_VIEW_ID, editorProvider, {
        webviewOptions: { retainContextWhenHidden: true }
      });
    context.subscriptions.push(registration);
    outputChannel.appendLine(
      `[activate] WebviewViewProvider registered successfully (viewId=${ARDUFLUX_EDITOR_VIEW_ID}, disposable=${typeof registration.dispose === "function"})`
    );
  } catch (err) {
    outputChannel.appendLine(
      `[activate] FAILED to register WebviewViewProvider (viewId=${ARDUFLUX_EDITOR_VIEW_ID}): ${err}`
    );
    void vscode.window.showErrorMessage(`开发板配置: WebviewView 注册失败: ${err}`);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.refreshSidebar", async () => {
      await editorProvider.controller?.syncView();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.openMonitor", async () => {
      try {
        const root = getWorkspaceRoot();
        const store = new ConfigStore(root);
        await store.load();
        const sketchPath = store.getData().current.build.sketchPath ?? "";
        await runUploadScript(context.extensionPath, root, { monitor: true, sketchPath });
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.openPanel", async () => {
      try {
        await vscode.commands.executeCommand(`${ARDUFLUX_EDITOR_VIEW_ID}.focus`);
      } catch {
        // fallback: open floating panel
        await withStore(async (store) => {
          await ArduFluxPanel.createOrShow(context, store);
        });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.validateConfig", async () => {
      try {
        await withStore(async (store) => {
          await store.validateAll();
          void vscode.window.showInformationMessage("当前 ArduFlux.json 校验通过");
        });
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.openConfigFile", async () => {
      try {
        await withStore(async (store) => {
          await store.save();
          const document = await vscode.workspace.openTextDocument(store.configPath);
          await vscode.window.showTextDocument(document, { preview: false });
        });
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.compileSketch", async () => {
      try {
        await vscode.commands.executeCommand(`${ARDUFLUX_EDITOR_VIEW_ID}.focus`);
        await vscode.commands.executeCommand("arduflux.compileSketchSilent");
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.uploadSketch", async () => {
      try {
        await vscode.commands.executeCommand(`${ARDUFLUX_EDITOR_VIEW_ID}.focus`);
        await vscode.commands.executeCommand("arduflux.uploadSketchSilent");
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  // 静默编译/上传（不弹出面板，供状态栏按钮使用）
  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.compileSketchSilent", async () => {
      try {
        await ConfigStore.waitForSave();
        const root = getWorkspaceRoot();
        const store = new ConfigStore(root);
        await store.load();
        const sketchPath = store.getData().current.build.sketchPath ?? "";
        startStatusSpinner("正在编译");
        try {
          await runUploadScript(context.extensionPath, root, { compile: true, sketchPath });
          void vscode.window.showInformationMessage("编译完成");
        } finally {
          stopStatusSpinner();
        }
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.uploadSketchSilent", async () => {
      try {
        await ConfigStore.waitForSave();
        const root = getWorkspaceRoot();
        const store = new ConfigStore(root);
        await store.load();
        const compileBeforeUpload = store.getData().current.build.compileBeforeUpload ?? false;
        const uploadThenMonitor = store.getData().current.build.uploadThenMonitor ?? false;
        const sketchPath = store.getData().current.build.sketchPath ?? "";
        startStatusSpinner(compileBeforeUpload ? "正在编译并上传" : "正在上传");
        try {
          await runUploadScript(context.extensionPath, root, { compile: compileBeforeUpload, upload: true, sketchPath });
          void vscode.window.showInformationMessage(compileBeforeUpload ? "编译并上传完成" : "上传完成");
        } finally {
          stopStatusSpinner();
        }
        if (uploadThenMonitor) {
          await vscode.commands.executeCommand("arduflux.openMonitor");
        }
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.runUploadScript", async () => {
      try {
        const root = getWorkspaceRoot();
        const store = new ConfigStore(root);
        await store.load();
        const sketchPath = store.getData().current.build.sketchPath ?? "";
        startStatusSpinner("执行上传脚本");
        try {
          await runUploadScript(context.extensionPath, root, { compile: true, upload: true, monitor: true, sketchPath });
          void vscode.window.showInformationMessage("上传脚本执行完成");
        } finally {
          stopStatusSpinner();
        }
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.compileOnly", async () => {
      try {
        const root = getWorkspaceRoot();
        const store = new ConfigStore(root);
        await store.load();
        const sketchPath = store.getData().current.build.sketchPath ?? "";
        startStatusSpinner("编译中");
        try {
          await runUploadScript(context.extensionPath, root, { compile: true, sketchPath });
          void vscode.window.showInformationMessage("编译完成");
        } finally {
          stopStatusSpinner();
        }
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.uploadOnly", async () => {
      try {
        const root = getWorkspaceRoot();
        const store = new ConfigStore(root);
        await store.load();
        const sketchPath = store.getData().current.build.sketchPath ?? "";
        startStatusSpinner("上传中");
        try {
          await runUploadScript(context.extensionPath, root, { upload: true, monitor: true, sketchPath });
          void vscode.window.showInformationMessage("上传完成");
        } finally {
          stopStatusSpinner();
        }
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  // 状态栏
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "arduflux.openPanel";
  context.subscriptions.push(statusBarItem);

  // 快捷图标按钮（只显示图标，悬浮提示）
  const btnCompile = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  btnCompile.text = "$(play)";
  btnCompile.tooltip = "编译 Sketch";
  btnCompile.command = "arduflux.compileSketchSilent";
  context.subscriptions.push(btnCompile);

  const btnUpload = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
  btnUpload.text = "$(cloud-upload)";
  btnUpload.tooltip = "上传 Sketch";
  btnUpload.command = "arduflux.uploadSketchSilent";
  context.subscriptions.push(btnUpload);

  const btnMonitor = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
  btnMonitor.text = "$(terminal)";
  btnMonitor.tooltip = "打开串口监视器";
  btnMonitor.command = "arduflux.openMonitor";
  context.subscriptions.push(btnMonitor);

  // 动态状态栏（正在编译/上传等）
  const statusAction = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
  context.subscriptions.push(statusAction);

  const spinnerChars = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
  let spinnerInterval: NodeJS.Timeout | null = null;
  let spinnerIndex = 0;

  function startStatusSpinner(text: string): void {
    stopStatusSpinner();
    spinnerIndex = 0;
    statusAction.text = `${spinnerChars[0]} ${text}`;
    statusAction.show();
    spinnerInterval = setInterval(() => {
      spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
      statusAction.text = `${spinnerChars[spinnerIndex]} ${text}`;
    }, 100);
  }

  function stopStatusSpinner(): void {
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      spinnerInterval = null;
    }
    statusAction.hide();
  }

  async function updateStatusBar(): Promise<void> {
    try {
      const root = getWorkspaceRoot();
      const store = new ConfigStore(root);
      await store.load();
      const config = store.getData().current;
      statusBarItem.text = `$(circuit-board) ${formatStatusBarText(config.board.name, config.port.address)}`;
      statusBarItem.tooltip = `板型: ${config.board.name}\n端口: ${config.port.address || "未选择"}\nFQBN: ${config.board.fqbn}`;
      statusBarItem.show();
      btnCompile.show();
      btnUpload.show();
      btnMonitor.show();
    } catch {
      statusBarItem.text = "$(circuit-board) 嵌入式配置";
      statusBarItem.tooltip = "点击打开 开发板配置 面板";
      statusBarItem.show();
      btnCompile.hide();
      btnUpload.hide();
      btnMonitor.hide();
    }
  }

  void updateStatusBar();
  const interval = setInterval(() => void updateStatusBar(), 5000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  // 启动 MCP SSE 服务器（供 IDE AI 调用）
  void (async () => {
    try {
      const root = getWorkspaceRoot();
      outputChannel.appendLine("[activate] Starting MCP SSE server...");
      const mcp = startMcpSseServer(context.extensionPath, root);

      const port = await mcp.port;
      outputChannel.appendLine(`[activate] MCP SSE server listening on port ${port}`);

      context.subscriptions.push({
        dispose: () => {
          if (mcp.process && !mcp.process.killed) {
            mcp.process.kill();
            outputChannel.appendLine("[deactivate] MCP SSE server stopped");
          }
        },
      });

      // VS Code 原生 MCP 注册表适配（1.99+）
      if (
        vscode.lm &&
        typeof vscode.lm.registerMcpServerDefinitionProvider === "function" &&
        typeof (vscode as unknown as Record<string, unknown>).McpHttpServerDefinition === "function"
      ) {
        const mcpEmitter = new vscode.EventEmitter<void>();
        let currentMcpPort = port;

        const provider: vscode.McpServerDefinitionProvider = {
          onDidChangeMcpServerDefinitions: mcpEmitter.event,
          provideMcpServerDefinitions: () => {
            if (!currentMcpPort) {
              return [];
            }
            const McpHttpServerDefinition = (vscode as unknown as Record<string, unknown>).McpHttpServerDefinition as new (
              label: string,
              uri: vscode.Uri
            ) => vscode.McpServerDefinition;
            return [
              new McpHttpServerDefinition(
                "ArduFlux MCP",
                vscode.Uri.parse(`http://127.0.0.1:${currentMcpPort}/mcp`)
              ),
            ];
          },
        };

        const providerDisposable = vscode.lm.registerMcpServerDefinitionProvider(
          "ffedu.arduflux.mcp",
          provider
        );
        context.subscriptions.push(providerDisposable);
        mcpEmitter.fire();
        outputChannel.appendLine(`[activate] MCP provider registered with VS Code lm registry`);
      }
    } catch (err) {
      outputChannel.appendLine(`[activate] MCP SSE server failed to start: ${err}`);
    }
  })();
}

export function deactivate(): void {
  // Nothing to dispose explicitly.
}
