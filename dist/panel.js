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
exports.EmbeddedBoardConfigPanel = void 0;
const vscode = __importStar(require("vscode"));
const webviewController_1 = require("./webviewController");
class EmbeddedBoardConfigPanel {
    static async createOrShow(context, store) {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
        if (EmbeddedBoardConfigPanel.currentPanel) {
            EmbeddedBoardConfigPanel.currentPanel.panel.reveal(column);
            await EmbeddedBoardConfigPanel.currentPanel.controller.syncView();
            return;
        }
        const panel = vscode.window.createWebviewPanel("embeddedBoardConfig", "开发板配置", column, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        const instance = new EmbeddedBoardConfigPanel(panel, context, store);
        EmbeddedBoardConfigPanel.currentPanel = instance;
        await instance.controller.initialize();
    }
    constructor(panel, context, store) {
        this.panel = panel;
        this.context = context;
        this.store = store;
        this.controller = new webviewController_1.ConfigEditorController(context, store);
        this.controller.attach(panel.webview);
        this.panel.onDidDispose(() => {
            EmbeddedBoardConfigPanel.currentPanel = undefined;
            this.controller.dispose();
        }, null, this.context.subscriptions);
    }
    async compileSketch() {
        return this.controller.compileSketch();
    }
    async uploadSketch() {
        return this.controller.uploadSketch();
    }
}
exports.EmbeddedBoardConfigPanel = EmbeddedBoardConfigPanel;
//# sourceMappingURL=panel.js.map