"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const configStore_1 = require("./configStore");
const panel_1 = require("./panel");
function getWorkspaceRoot() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        throw new configStore_1.ValidationError("请先打开一个工作区文件夹，再使用 Embedded Board Config");
    }
    return folder.uri.fsPath;
}
function formatError(error) {
    if (error instanceof configStore_1.ValidationError) {
        return error.suggestion ? `${error.message}\n建议：${error.suggestion}` : error.message;
    }
    return error instanceof Error ? error.message : String(error);
}
async function withStore(run) {
    const root = getWorkspaceRoot();
    const store = new configStore_1.ConfigStore(root);
    await store.load();
    return run(store);
}
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand("embeddedBoardConfig.openPanel", async () => {
        try {
            await withStore(async (store) => {
                await panel_1.EmbeddedBoardConfigPanel.createOrShow(context, store);
            });
        }
        catch (error) {
            void vscode.window.showErrorMessage(formatError(error));
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("embeddedBoardConfig.validateConfig", async () => {
        try {
            await withStore(async (store) => {
                await store.validateAll();
                void vscode.window.showInformationMessage("当前 embedded_board_config.json 校验通过");
            });
        }
        catch (error) {
            void vscode.window.showErrorMessage(formatError(error));
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("embeddedBoardConfig.openConfigFile", async () => {
        try {
            await withStore(async (store) => {
                await store.save();
                const document = await vscode.workspace.openTextDocument(store.configPath);
                await vscode.window.showTextDocument(document, { preview: false });
            });
        }
        catch (error) {
            void vscode.window.showErrorMessage(formatError(error));
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("embeddedBoardConfig.compileSketch", async () => {
        try {
            await withStore(async (store) => {
                await panel_1.EmbeddedBoardConfigPanel.createOrShow(context, store);
                const panel = panel_1.EmbeddedBoardConfigPanel.currentPanel;
                if (panel) {
                    await panel.compileSketch();
                }
            });
        }
        catch (error) {
            void vscode.window.showErrorMessage(formatError(error));
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("embeddedBoardConfig.uploadSketch", async () => {
        try {
            await withStore(async (store) => {
                await panel_1.EmbeddedBoardConfigPanel.createOrShow(context, store);
                const panel = panel_1.EmbeddedBoardConfigPanel.currentPanel;
                if (panel) {
                    await panel.uploadSketch();
                }
            });
        }
        catch (error) {
            void vscode.window.showErrorMessage(formatError(error));
        }
    }));
}
function deactivate() {
    // Nothing to dispose explicitly.
}
//# sourceMappingURL=extension.js.map