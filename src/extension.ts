import * as vscode from "vscode";
import { ConfigStore, ValidationError, buildCompileArgs, buildMonitorArgs, buildUploadArgs } from "./configStore";
import { ArduFluxEditorProvider } from "./editorView";
import { ArduFluxPanel } from "./panel";
import { onDidChangeArduFluxConfig } from "./events";
import { runInTerminal, runUploaderFlow } from "./terminal";
import { formatStatusBarText } from "./statusBar";
import { ARDUFLUX_EDITOR_VIEW_ID } from "./viewIds";
import { startMcpSseServer } from "./mcp/extensionIntegration";

function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new ValidationError(vscode.l10n.t("Please open a workspace folder before using ArduFlux"));
  }
  return folder.uri.fsPath;
}

function formatError(error: unknown): string {
  if (error instanceof ValidationError) {
    return error.suggestion ? vscode.l10n.t("{0}\nSuggestion: {1}", error.message, error.suggestion) : error.message;
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
  const outputChannel = vscode.window.createOutputChannel("ArduFlux");
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine("[activate] Extension activating...");

  // Register the sidebar WebviewViewProvider
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
    const msg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(
      `[activate] FAILED to register WebviewViewProvider (viewId=${ARDUFLUX_EDITOR_VIEW_ID}): ${msg}`
    );
    // During hot reload or window reload, the old provider may not have fully
    // disposed yet, causing an "already registered" error. This is a benign
    // race condition, so we just log it.
    if (!msg.includes("already registered")) {
      void vscode.window.showErrorMessage(vscode.l10n.t("ArduFlux: Failed to register WebviewView: {0}", msg));
    }
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
        await runUploaderFlow(root, { monitor: true, sketchPath });
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
          void vscode.window.showInformationMessage(vscode.l10n.t("ArduFlux.json validated successfully"));
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

  // Silent compile/upload (no panel popup, used by status bar buttons)
  context.subscriptions.push(
    vscode.commands.registerCommand("arduflux.compileSketchSilent", async () => {
      try {
        await ConfigStore.waitForSave();
        const root = getWorkspaceRoot();
        const store = new ConfigStore(root);
        await store.load();
        const sketchPath = store.getData().current.build.sketchPath ?? "";
        startStatusSpinner(vscode.l10n.t("Compiling"));
        try {
          await runUploaderFlow(root, { compile: true, sketchPath });
          void vscode.window.showInformationMessage(vscode.l10n.t("Compilation completed"));
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
        startStatusSpinner(compileBeforeUpload ? vscode.l10n.t("Compiling and uploading") : vscode.l10n.t("Uploading"));
        try {
          await runUploaderFlow(root, { compile: compileBeforeUpload, upload: true, sketchPath });
          void vscode.window.showInformationMessage(compileBeforeUpload ? vscode.l10n.t("Compile and upload completed") : vscode.l10n.t("Upload completed"));
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
        startStatusSpinner(vscode.l10n.t("Running upload script"));
        try {
          await runUploaderFlow(root, { compile: true, upload: true, monitor: true, sketchPath });
          void vscode.window.showInformationMessage(vscode.l10n.t("Upload script completed"));
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
        startStatusSpinner(vscode.l10n.t("Compiling"));
        try {
          await runUploaderFlow(root, { compile: true, sketchPath });
          void vscode.window.showInformationMessage(vscode.l10n.t("Compilation completed"));
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
        startStatusSpinner(vscode.l10n.t("Uploading"));
        try {
          await runUploaderFlow(root, { upload: true, monitor: true, sketchPath });
          void vscode.window.showInformationMessage(vscode.l10n.t("Upload completed"));
        } finally {
          stopStatusSpinner();
        }
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  // Status bar item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "arduflux.openPanel";
  context.subscriptions.push(statusBarItem);

  // Quick icon buttons (icon-only, with hover tooltips)
  const btnCompile = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  btnCompile.text = "$(play)";
  btnCompile.tooltip = vscode.l10n.t("Compile Sketch");
  btnCompile.command = "arduflux.compileSketchSilent";
  context.subscriptions.push(btnCompile);

  const btnUpload = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
  btnUpload.text = "$(cloud-upload)";
  btnUpload.tooltip = vscode.l10n.t("Upload Sketch");
  btnUpload.command = "arduflux.uploadSketchSilent";
  context.subscriptions.push(btnUpload);

  const btnMonitor = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
  btnMonitor.text = "$(terminal)";
  btnMonitor.tooltip = vscode.l10n.t("Open Serial Monitor");
  btnMonitor.command = "arduflux.openMonitor";
  context.subscriptions.push(btnMonitor);

  // Dynamic status bar item (compiling/uploading, etc.)
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
      statusBarItem.tooltip = vscode.l10n.t(
        "Board: {0}\nPort: {1}\nFQBN: {2}",
        config.board.name,
        config.port.address || vscode.l10n.t("Not selected"),
        config.board.fqbn
      );
      statusBarItem.show();
      btnCompile.show();
      btnUpload.show();
      btnMonitor.show();
    } catch {
      statusBarItem.text = `$(circuit-board) ${vscode.l10n.t("Embedded Configuration")}`;
      statusBarItem.tooltip = vscode.l10n.t("Click to open the ArduFlux panel");
      statusBarItem.show();
      btnCompile.hide();
      btnUpload.hide();
      btnMonitor.hide();
    }
  }

  void updateStatusBar();
  const interval = setInterval(() => void updateStatusBar(), 5000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  // Start the MCP SSE server (used by IDE AI clients)
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

      // VS Code native MCP registry adapter (1.99+)
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
          "DonkeyDrift.arduflux.mcp",
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
