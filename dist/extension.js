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
const configSidebar_1 = require("./configSidebar");
const panel_1 = require("./panel");
const events_1 = require("./events");
const terminal_1 = require("./terminal");
const statusBar_1 = require("./statusBar");
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
    // 注册侧边栏 TreeDataProvider
    let sidebarProvider;
    try {
        const root = getWorkspaceRoot();
        const store = new configStore_1.ConfigStore(root);
        sidebarProvider = new configSidebar_1.ConfigSidebarProvider(store);
        context.subscriptions.push(vscode.window.registerTreeDataProvider("embeddedBoardConfig.sidebar", sidebarProvider));
        context.subscriptions.push(events_1.onDidChangeEmbeddedConfig.event(() => {
            sidebarProvider?.refresh();
        }));
    }
    catch {
        // 无工作区时不注册侧边栏
    }
    context.subscriptions.push(vscode.commands.registerCommand("embeddedBoardConfig.refreshSidebar", async () => {
        sidebarProvider?.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand("embeddedBoardConfig.openMonitor", async () => {
        try {
            await withStore(async (store) => {
                const config = store.getData().current;
                if (!config.monitor.enabled) {
                    throw new configStore_1.ValidationError("监视器未启用", "请在面板中勾选「启用监视器」后再试");
                }
                const port = config.port.address.trim();
                if (!port) {
                    throw new configStore_1.ValidationError("串口未选择", "请先选择串口端口");
                }
                const args = (0, configStore_1.buildMonitorArgs)({
                    port,
                    fqbn: config.board.fqbn.trim() || undefined,
                    baudRate: config.monitor.baudRate || undefined,
                    dataBits: config.monitor.dataBits || undefined,
                    stopBits: config.monitor.stopBits || undefined,
                    parity: config.monitor.parity || undefined
                });
                const cmd = [store.arduinoCliPath, ...args].join(" ");
                const terminal = vscode.window.createTerminal({
                    name: `Serial Monitor (${port})`,
                    cwd: store.baseDir
                });
                terminal.sendText(cmd);
                terminal.show();
            });
        }
        catch (error) {
            void vscode.window.showErrorMessage(formatError(error));
        }
    }));
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
    // 静默编译/上传（不弹出面板，供状态栏按钮使用）
    context.subscriptions.push(vscode.commands.registerCommand("embeddedBoardConfig.compileSketchSilent", async () => {
        try {
            await withStore(async (store) => {
                const config = store.getData().current;
                store.validateBoard(config.board);
                const args = (0, configStore_1.buildCompileArgs)({
                    fqbn: config.board.fqbn,
                    sketchPath: store.baseDir,
                    outputDir: config.build.outputDir || undefined,
                    extraArgs: config.board.compileArgs.length > 0 ? config.board.compileArgs : undefined
                });
                startStatusSpinner("正在编译");
                try {
                    await (0, terminal_1.runInTerminal)(store.arduinoCliPath, store.baseDir, "Arduino Compile", args);
                    void vscode.window.showInformationMessage("编译完成");
                }
                finally {
                    stopStatusSpinner();
                }
            });
        }
        catch (error) {
            void vscode.window.showErrorMessage(formatError(error));
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("embeddedBoardConfig.uploadSketchSilent", async () => {
        try {
            await withStore(async (store) => {
                const config = store.getData().current;
                await store.validatePort(config.port);
                store.validateBoard(config.board);
                const args = (0, configStore_1.buildUploadArgs)({
                    port: config.port.address,
                    fqbn: config.board.fqbn,
                    sketchPath: store.baseDir
                });
                startStatusSpinner("正在上传");
                try {
                    await (0, terminal_1.runInTerminal)(store.arduinoCliPath, store.baseDir, "Arduino Upload", args);
                    void vscode.window.showInformationMessage("上传完成");
                }
                finally {
                    stopStatusSpinner();
                }
            });
        }
        catch (error) {
            void vscode.window.showErrorMessage(formatError(error));
        }
    }));
    // 状态栏
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
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
    const btnMonitor = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
    btnMonitor.text = "$(terminal)";
    btnMonitor.tooltip = "打开串口监视器";
    btnMonitor.command = "embeddedBoardConfig.openMonitor";
    context.subscriptions.push(btnMonitor);
    const btnOpenPanel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
    btnOpenPanel.text = "$(circuit-board)";
    btnOpenPanel.tooltip = "打开 Embedded Board Config 面板";
    btnOpenPanel.command = "embeddedBoardConfig.openPanel";
    context.subscriptions.push(btnOpenPanel);
    // 动态状态栏（正在编译/上传等）
    const statusAction = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
    context.subscriptions.push(statusAction);
    const spinnerChars = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
    let spinnerInterval = null;
    let spinnerIndex = 0;
    function startStatusSpinner(text) {
        stopStatusSpinner();
        spinnerIndex = 0;
        statusAction.text = `${spinnerChars[0]} ${text}`;
        statusAction.show();
        spinnerInterval = setInterval(() => {
            spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
            statusAction.text = `${spinnerChars[spinnerIndex]} ${text}`;
        }, 100);
    }
    function stopStatusSpinner() {
        if (spinnerInterval) {
            clearInterval(spinnerInterval);
            spinnerInterval = null;
        }
        statusAction.hide();
    }
    async function updateStatusBar() {
        try {
            const root = getWorkspaceRoot();
            const store = new configStore_1.ConfigStore(root);
            await store.load();
            const config = store.getData().current;
            statusBarItem.text = `$(circuit-board) ${(0, statusBar_1.formatStatusBarText)(config.board.name, config.port.address)}`;
            statusBarItem.tooltip = `板型: ${config.board.name}\n端口: ${config.port.address || "未选择"}\nFQBN: ${config.board.fqbn}`;
            statusBarItem.show();
            btnCompile.show();
            btnUpload.show();
            btnMonitor.show();
            btnOpenPanel.show();
        }
        catch {
            statusBarItem.text = "$(circuit-board) 嵌入式配置";
            statusBarItem.tooltip = "点击打开 Embedded Board Config 面板";
            statusBarItem.show();
            btnCompile.hide();
            btnUpload.hide();
            btnMonitor.hide();
            btnOpenPanel.hide();
        }
    }
    void updateStatusBar();
    const interval = setInterval(() => void updateStatusBar(), 5000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
}
function deactivate() {
    // Nothing to dispose explicitly.
}
//# sourceMappingURL=extension.js.map