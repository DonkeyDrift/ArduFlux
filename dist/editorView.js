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
exports.ArduFluxEditorProvider = void 0;
const vscode = __importStar(require("vscode"));
const configStore_1 = require("./configStore");
const webviewController_1 = require("./webviewController");
const viewIds_1 = require("./viewIds");
class ArduFluxEditorProvider {
    constructor(context, log = () => { }) {
        this.context = context;
        this.log = log;
    }
    async resolveWebviewView(webviewView, _context, _token) {
        this.webviewView = webviewView;
        this.log(`[view] resolveWebviewView called (viewId=${viewIds_1.ARDUFLUX_EDITOR_VIEW_ID}, visible=${webviewView.visible})`);
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
            webviewView.webview.html = this.simpleHtml("请先打开一个工作区文件夹");
            this.log(`[view] No workspace root found for viewId=${viewIds_1.ARDUFLUX_EDITOR_VIEW_ID}`);
            return;
        }
        webviewView.webview.options = {
            enableScripts: true
        };
        this.log(`[view] Webview options applied (viewId=${viewIds_1.ARDUFLUX_EDITOR_VIEW_ID}, enableScripts=${webviewView.webview.options.enableScripts === true})`);
        // 先显示加载中，避免空白
        webviewView.webview.html = this.simpleHtml("加载配置中...");
        this.log(`[view] Placeholder HTML rendered for viewId=${viewIds_1.ARDUFLUX_EDITOR_VIEW_ID}`);
        const store = new configStore_1.ConfigStore(root);
        this.controller = new webviewController_1.ConfigEditorController(this.context, store, this.log);
        this.controller.attach(webviewView.webview);
        await this.controller.initialize().catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.log(`[view] Failed to initialize controller (viewId=${viewIds_1.ARDUFLUX_EDITOR_VIEW_ID}): ${msg}`);
            webviewView.webview.html = this.simpleHtml(`加载失败: ${msg}`);
        });
        await this.controller.syncView("配置编辑器已加载");
        this.log(`[view] Initial state posted for viewId=${viewIds_1.ARDUFLUX_EDITOR_VIEW_ID}`);
        webviewView.onDidDispose(() => {
            this.log(`[view] Disposed viewId=${viewIds_1.ARDUFLUX_EDITOR_VIEW_ID}`);
            this.controller?.dispose();
            this.controller = undefined;
            this.webviewView = undefined;
        });
        webviewView.onDidChangeVisibility(() => {
            this.log(`[view] Visibility changed (viewId=${viewIds_1.ARDUFLUX_EDITOR_VIEW_ID}, visible=${webviewView.visible})`);
            if (webviewView.visible) {
                void this.controller?.syncView();
            }
        });
    }
    simpleHtml(text) {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"/><style>
body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground);background:var(--vscode-editor-background);}
</style></head>
<body><p>${text}</p></body>
</html>`;
    }
    async compileSketch() {
        await this.controller?.compileSketch();
    }
    async uploadSketch() {
        await this.controller?.uploadSketch();
    }
}
exports.ArduFluxEditorProvider = ArduFluxEditorProvider;
//# sourceMappingURL=editorView.js.map