import * as vscode from "vscode";
import { ConfigStore, ValidationError, buildCompileArgs, buildUploadArgs } from "./configStore";
import { ConfigSidebarProvider } from "./configSidebar";
import { EmbeddedBoardConfigPanel } from "./panel";
import { onDidChangeEmbeddedConfig } from "./events";
import { runInTerminal } from "./terminal";
import { formatStatusBarText } from "./statusBar";

function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new ValidationError("请先打开一个工作区文件夹，再使用 Embedded Board Config");
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
  // 注册侧边栏 TreeDataProvider
  let sidebarProvider: ConfigSidebarProvider | undefined;
  try {
    const root = getWorkspaceRoot();
    const store = new ConfigStore(root);
    sidebarProvider = new ConfigSidebarProvider(store);
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider("embeddedBoardConfig.sidebar", sidebarProvider)
    );
    context.subscriptions.push(
      onDidChangeEmbeddedConfig.event(() => {
        sidebarProvider?.refresh();
      })
    );
  } catch {
    // 无工作区时不注册侧边栏
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("embeddedBoardConfig.refreshSidebar", async () => {
      sidebarProvider?.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("embeddedBoardConfig.openPanel", async () => {
      try {
        await withStore(async (store) => {
          await EmbeddedBoardConfigPanel.createOrShow(context, store);
        });
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("embeddedBoardConfig.validateConfig", async () => {
      try {
        await withStore(async (store) => {
          await store.validateAll();
          void vscode.window.showInformationMessage("当前 embedded_board_config.json 校验通过");
        });
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("embeddedBoardConfig.openConfigFile", async () => {
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
    vscode.commands.registerCommand("embeddedBoardConfig.compileSketch", async () => {
      try {
        await withStore(async (store) => {
          await EmbeddedBoardConfigPanel.createOrShow(context, store);
          const panel = EmbeddedBoardConfigPanel.currentPanel;
          if (panel) {
            await panel.compileSketch();
          }
        });
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("embeddedBoardConfig.uploadSketch", async () => {
      try {
        await withStore(async (store) => {
          await EmbeddedBoardConfigPanel.createOrShow(context, store);
          const panel = EmbeddedBoardConfigPanel.currentPanel;
          if (panel) {
            await panel.uploadSketch();
          }
        });
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  // 静默编译/上传（不弹出面板，供状态栏按钮使用）
  context.subscriptions.push(
    vscode.commands.registerCommand("embeddedBoardConfig.compileSketchSilent", async () => {
      try {
        await withStore(async (store) => {
          const config = store.getData().current;
          store.validateBoard(config.board);
          const args = buildCompileArgs({
            fqbn: config.board.fqbn,
            sketchPath: store.baseDir,
            outputDir: config.build.outputDir || undefined,
            extraArgs: config.board.compileArgs.length > 0 ? config.board.compileArgs : undefined
          });
          startStatusSpinner("正在编译");
          try {
            await runInTerminal(store.arduinoCliPath, store.baseDir, "Arduino Compile", args);
            void vscode.window.showInformationMessage("编译完成");
          } finally {
            stopStatusSpinner();
          }
        });
      } catch (error) {
        void vscode.window.showErrorMessage(formatError(error));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("embeddedBoardConfig.uploadSketchSilent", async () => {
      try {
        await withStore(async (store) => {
          const config = store.getData().current;
          await store.validatePort(config.port);
          store.validateBoard(config.board);
          const args = buildUploadArgs({
            port: config.port.address,
            fqbn: config.board.fqbn,
            sketchPath: store.baseDir
          });
          startStatusSpinner("正在上传");
          try {
            await runInTerminal(store.arduinoCliPath, store.baseDir, "Arduino Upload", args);
            void vscode.window.showInformationMessage("上传完成");
          } finally {
            stopStatusSpinner();
          }
        });
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
  statusBarItem.command = "embeddedBoardConfig.openPanel";
  context.subscriptions.push(statusBarItem);

  // 快捷图标按钮（只显示图标，悬浮提示）
  const btnCompile = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  btnCompile.text = "$(play)";
  btnCompile.tooltip = "编译 Sketch";
  btnCompile.command = "embeddedBoardConfig.compileSketchSilent";
  context.subscriptions.push(btnCompile);

  const btnUpload = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
  btnUpload.text = "$(cloud-upload)";
  btnUpload.tooltip = "上传 Sketch";
  btnUpload.command = "embeddedBoardConfig.uploadSketchSilent";
  context.subscriptions.push(btnUpload);

  const btnRefresh = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
  btnRefresh.text = "$(refresh)";
  btnRefresh.tooltip = "刷新配置侧边栏";
  btnRefresh.command = "embeddedBoardConfig.refreshSidebar";
  context.subscriptions.push(btnRefresh);

  const btnOpenPanel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
  btnOpenPanel.text = "$(circuit-board)";
  btnOpenPanel.tooltip = "打开 Embedded Board Config 面板";
  btnOpenPanel.command = "embeddedBoardConfig.openPanel";
  context.subscriptions.push(btnOpenPanel);

  // 动态状态栏（正在编译/上传等）
  const statusAction = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
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
      btnRefresh.show();
      btnOpenPanel.show();
    } catch {
      statusBarItem.text = "$(circuit-board) 嵌入式配置";
      statusBarItem.tooltip = "点击打开 Embedded Board Config 面板";
      statusBarItem.show();
      btnCompile.hide();
      btnUpload.hide();
      btnRefresh.hide();
      btnOpenPanel.hide();
    }
  }

  void updateStatusBar();
  const interval = setInterval(() => void updateStatusBar(), 5000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

export function deactivate(): void {
  // Nothing to dispose explicitly.
}
