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
const chai_1 = require("chai");
const fs_1 = require("fs");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
function disposeAll(disposables) {
    for (const disposable of disposables.reverse()) {
        disposable.dispose?.();
    }
}
describe("webview view registration", () => {
    const moduleLoader = require("module");
    const originalLoad = moduleLoader._load;
    let tempDir = "";
    function clearModule(modulePath) {
        try {
            delete require.cache[require.resolve(modulePath)];
        }
        catch {
            // Ignore missing cache entries.
        }
    }
    beforeEach(async () => {
        tempDir = await fs_1.promises.mkdtemp(path.join(os.tmpdir(), "embedded-board-config-view-"));
    });
    afterEach(async () => {
        moduleLoader._load = originalLoad;
        clearModule("../extension");
        clearModule("../editorView");
        clearModule("../webviewController");
        clearModule("../configStore");
        clearModule("../viewIds");
        await fs_1.promises.rm(tempDir, { recursive: true, force: true });
    });
    it("package.json 应将侧边栏视图声明为 webview 且 ID 完全匹配", async () => {
        const manifestPath = path.resolve(__dirname, "../../package.json");
        const manifest = JSON.parse(await fs_1.promises.readFile(manifestPath, "utf8"));
        (0, chai_1.expect)(manifest.contributes.viewsContainers.activitybar.some((item) => item.id === "embeddedBoardConfig")).to.equal(true);
        const editorView = manifest.contributes.views.embeddedBoardConfig.find((item) => item.id === "embeddedBoardConfig.editor");
        (0, chai_1.expect)(editorView).to.not.equal(undefined);
        (0, chai_1.expect)(editorView?.type).to.equal("webview");
    });
    it("激活扩展后应注册并解析指定 WebviewView，且发送初始状态消息", async () => {
        const outputLines = [];
        const registeredCommands = [];
        let capturedProvider;
        const fakeVscode = {
            EventEmitter: class {
                constructor() {
                    this.listeners = [];
                    this.event = (listener) => {
                        this.listeners.push(listener);
                        return { dispose: () => { } };
                    };
                }
                fire(value) {
                    for (const listener of this.listeners) {
                        listener(value);
                    }
                }
                dispose() {
                    this.listeners = [];
                }
            },
            StatusBarAlignment: {
                Left: 1
            },
            workspace: {
                workspaceFolders: [{ uri: { fsPath: tempDir } }]
            },
            window: {
                createOutputChannel: (_name) => ({
                    appendLine: (line) => {
                        outputLines.push(line);
                    },
                    dispose: () => { }
                }),
                registerWebviewViewProvider: (viewId, provider, options) => {
                    capturedProvider = { viewId, provider, options };
                    return { dispose: () => { } };
                },
                createStatusBarItem: () => ({
                    text: "",
                    tooltip: "",
                    command: undefined,
                    show: () => { },
                    hide: () => { },
                    dispose: () => { }
                }),
                showErrorMessage: async () => undefined,
                showInformationMessage: async () => undefined,
                createTerminal: () => ({
                    sendText: () => { },
                    show: () => { },
                    dispose: () => { }
                })
            },
            commands: {
                registerCommand: (command, _callback) => {
                    registeredCommands.push(command);
                    return { dispose: () => { } };
                },
                executeCommand: async () => undefined
            }
        };
        moduleLoader._load = function patchedLoad(request, parent, isMain) {
            if (request === "vscode") {
                return fakeVscode;
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        const { activate } = require("../extension");
        const { ConfigStore } = require("../configStore");
        const { createDefaultConfig } = require("../types");
        const { EMBEDDED_BOARD_CONFIG_EDITOR_VIEW_ID } = require("../viewIds");
        const originalLoadConfig = ConfigStore.prototype.load;
        const originalGetSerialPorts = ConfigStore.prototype.getSerialPorts;
        ConfigStore.prototype.load = async function stubLoad() {
            const defaults = createDefaultConfig();
            this.setData(defaults);
            return defaults;
        };
        ConfigStore.prototype.getSerialPorts = async function stubGetSerialPorts() {
            return [
                {
                    address: "COM36",
                    label: "USB Serial Device",
                    protocol: "serial",
                    type: "USB"
                }
            ];
        };
        try {
            const context = { subscriptions: [] };
            activate(context);
            (0, chai_1.expect)(capturedProvider).to.not.equal(undefined);
            (0, chai_1.expect)(capturedProvider?.viewId).to.equal(EMBEDDED_BOARD_CONFIG_EDITOR_VIEW_ID);
            (0, chai_1.expect)(registeredCommands).to.include("embeddedBoardConfig.refreshSidebar");
            const postedMessages = [];
            let onDidReceiveMessageHandler;
            const fakeWebview = {
                html: "",
                options: {},
                cspSource: "vscode-webview://test",
                postMessage: async (message) => {
                    postedMessages.push(message);
                    return true;
                },
                onDidReceiveMessage: (handler) => {
                    onDidReceiveMessageHandler = handler;
                    return { dispose: () => { } };
                }
            };
            const fakeWebviewView = {
                webview: fakeWebview,
                visible: true,
                onDidDispose: (_handler) => ({ dispose: () => { } }),
                onDidChangeVisibility: (_handler) => ({ dispose: () => { } })
            };
            await capturedProvider?.provider.resolveWebviewView(fakeWebviewView, {}, {});
            (0, chai_1.expect)(fakeWebview.options.enableScripts).to.equal(true);
            (0, chai_1.expect)(fakeWebview.html).to.contain("开发板配置");
            (0, chai_1.expect)(postedMessages.some((message) => message.type === "state")).to.equal(true);
            const firstStateMessage = postedMessages.find((message) => message.type === "state");
            (0, chai_1.expect)(firstStateMessage?.statusMessage).to.equal("配置编辑器已加载");
            (0, chai_1.expect)(firstStateMessage?.payload).to.deep.include({
                recommendedPort: "COM36"
            });
            await onDidReceiveMessageHandler?.({ type: "webview-ready" });
            const stateMessages = postedMessages.filter((message) => message.type === "state");
            (0, chai_1.expect)(stateMessages.length).to.equal(2);
            (0, chai_1.expect)(stateMessages[1]?.statusMessage).to.equal("配置编辑器已就绪");
            (0, chai_1.expect)(outputLines.some((line) => line.includes(`viewId=${EMBEDDED_BOARD_CONFIG_EDITOR_VIEW_ID}`))).to.equal(true);
            (0, chai_1.expect)(outputLines.some((line) => line.includes("Posting state message"))).to.equal(true);
            disposeAll(context.subscriptions);
        }
        finally {
            ConfigStore.prototype.load = originalLoadConfig;
            ConfigStore.prototype.getSerialPorts = originalGetSerialPorts;
        }
    });
});
//# sourceMappingURL=webviewView.test.js.map