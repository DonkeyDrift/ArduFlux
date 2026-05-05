import * as vscode from "vscode";
import { ConfigStore, ValidationError } from "./configStore";
import { EmbeddedBoardConfigPanel } from "./panel";

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
}

export function deactivate(): void {
  // Nothing to dispose explicitly.
}
