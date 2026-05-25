import { expect } from "chai";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

type ModuleWithLoad = typeof import("module") & {
  _load: (request: string, parent: NodeModule | undefined, isMain: boolean) => unknown;
};

function disposeAll(disposables: Array<{ dispose?: () => void }>): void {
  for (const disposable of disposables.reverse()) {
    disposable.dispose?.();
  }
}

describe("webview view registration", () => {
  const moduleLoader = require("module") as ModuleWithLoad;
  const originalLoad = moduleLoader._load;
  let tempDir = "";

  function clearModule(modulePath: string): void {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch {
      // Ignore missing cache entries.
    }
  }

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "arduflux-view-"));
  });

  afterEach(async () => {
    moduleLoader._load = originalLoad;
    clearModule("../extension");
    clearModule("../editorView");
    clearModule("../webviewController");
    clearModule("../configStore");
    clearModule("../viewIds");
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("package.json 应将侧边栏视图声明为 webview 且 ID 完全匹配", async () => {
    const manifestPath = path.resolve(__dirname, "../../package.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
      contributes: {
        viewsContainers: { activitybar: Array<{ id: string }> };
        views: Record<string, Array<{ id: string; type?: string }>>;
      };
    };

    expect(manifest.contributes.viewsContainers.activitybar.some((item) => item.id === "arduflux")).to.equal(true);

    const editorView = manifest.contributes.views.arduflux.find((item) => item.id === "arduflux.editor");
    expect(editorView).to.not.equal(undefined);
    expect(editorView?.type).to.equal("webview");
  });

  it("激活扩展后应注册并解析指定 WebviewView，且发送初始状态消息", async () => {
    const outputLines: string[] = [];
    const registeredCommands: string[] = [];
    let capturedProvider:
      | {
          viewId: string;
          provider: { resolveWebviewView: (view: unknown, context: unknown, token: unknown) => Promise<void> };
          options: unknown;
        }
      | undefined;

    const fakeVscode = {
      EventEmitter: class<T> {
        private listeners: Array<(value: T) => void> = [];

        readonly event = (listener: (value: T) => void) => {
          this.listeners.push(listener);
          return { dispose: () => {} };
        };

        fire(value: T): void {
          for (const listener of this.listeners) {
            listener(value);
          }
        }

        dispose(): void {
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
        createOutputChannel: (_name: string) => ({
          appendLine: (line: string) => {
            outputLines.push(line);
          },
          dispose: () => {}
        }),
        registerWebviewViewProvider: (
          viewId: string,
          provider: { resolveWebviewView: (view: unknown, context: unknown, token: unknown) => Promise<void> },
          options: unknown
        ) => {
          capturedProvider = { viewId, provider, options };
          return { dispose: () => {} };
        },
        createStatusBarItem: () => ({
          text: "",
          tooltip: "",
          command: undefined as string | undefined,
          show: () => {},
          hide: () => {},
          dispose: () => {}
        }),
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        createTerminal: () => ({
          sendText: () => {},
          show: () => {},
          dispose: () => {}
        })
      },
      commands: {
        registerCommand: (command: string, _callback: (...args: unknown[]) => unknown) => {
          registeredCommands.push(command);
          return { dispose: () => {} };
        },
        executeCommand: async () => undefined
      }
    };

    moduleLoader._load = function patchedLoad(request: string, parent: NodeModule | undefined, isMain: boolean): unknown {
      if (request === "vscode") {
        return fakeVscode;
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    const { activate } = require("../extension") as typeof import("../extension");
    const { ConfigStore } = require("../configStore") as typeof import("../configStore");
    const { createDefaultConfig } = require("../types") as typeof import("../types");
    const { ARDUFLUX_EDITOR_VIEW_ID } = require("../viewIds") as typeof import("../viewIds");

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
      const context = { subscriptions: [] as Array<{ dispose?: () => void }> };
      activate(context as never);

      expect(capturedProvider).to.not.equal(undefined);
      expect(capturedProvider?.viewId).to.equal(ARDUFLUX_EDITOR_VIEW_ID);
      expect(registeredCommands).to.include("arduflux.refreshSidebar");

      const postedMessages: Array<{ type?: string; payload?: unknown; statusMessage?: string }> = [];
      let onDidReceiveMessageHandler: ((message: { type?: string; payload?: unknown }) => Promise<void> | void) | undefined;

      const fakeWebview = {
        html: "",
        options: {} as { enableScripts?: boolean },
        cspSource: "vscode-webview://test",
        postMessage: async (message: { type?: string; payload?: unknown; statusMessage?: string }) => {
          postedMessages.push(message);
          return true;
        },
        onDidReceiveMessage: (handler: (message: { type?: string; payload?: unknown }) => Promise<void> | void) => {
          onDidReceiveMessageHandler = handler;
          return { dispose: () => {} };
        }
      };

      const fakeWebviewView = {
        webview: fakeWebview,
        visible: true,
        onDidDispose: (_handler: () => void) => ({ dispose: () => {} }),
        onDidChangeVisibility: (_handler: () => void) => ({ dispose: () => {} })
      };

      await capturedProvider?.provider.resolveWebviewView(fakeWebviewView, {}, {});

      expect(fakeWebview.options.enableScripts).to.equal(true);
      expect(fakeWebview.html).to.contain("ArduFlux");
      expect(fakeWebview.html).to.contain("WSL 编译");
      expect(fakeWebview.html).to.contain("id=\"wslEnabled\"");
      expect(fakeWebview.html).to.contain("id=\"wslDistro\"");
      expect(fakeWebview.html).to.contain("id=\"wslWorkspaceRoot\"");
      expect(fakeWebview.html).to.contain("event.target === showAdvancedEl");
      expect(postedMessages.some((message) => message.type === "state")).to.equal(true);

      const firstStateMessage = postedMessages.find((message) => message.type === "state");
      expect(firstStateMessage?.statusMessage).to.equal("配置编辑器已加载");
      expect(firstStateMessage?.payload).to.deep.include({
        recommendedPort: "COM36"
      });

      await onDidReceiveMessageHandler?.({ type: "webview-ready" });

      const stateMessages = postedMessages.filter((message) => message.type === "state");
      expect(stateMessages.length).to.equal(2);
      expect(stateMessages[1]?.statusMessage).to.equal("配置编辑器已就绪");
      expect(outputLines.some((line) => line.includes(`viewId=${ARDUFLUX_EDITOR_VIEW_ID}`))).to.equal(true);
      expect(outputLines.some((line) => line.includes("Posting state message"))).to.equal(true);

      disposeAll(context.subscriptions);
    } finally {
      ConfigStore.prototype.load = originalLoadConfig;
      ConfigStore.prototype.getSerialPorts = originalGetSerialPorts;
    }
  });

  it("保存配置时应持久化高级 WSL 编译字段", async () => {
    const fakeVscode = {
      EventEmitter: class<T> {
        readonly event = (_listener: (value: T) => void) => ({ dispose: () => {} });
        fire(_value: T): void {}
        dispose(): void {}
      },
      Uri: {
        file: (fsPath: string) => ({ fsPath }),
        joinPath: (base: { fsPath: string }, segment: string) => ({ fsPath: path.join(base.fsPath, segment) })
      },
      window: {
        showErrorMessage: async () => undefined,
        showSaveDialog: async () => undefined,
        showOpenDialog: async () => undefined,
        showQuickPick: async () => undefined
      },
      commands: {
        executeCommand: async () => undefined
      }
    };

    moduleLoader._load = function patchedLoad(request: string, parent: NodeModule | undefined, isMain: boolean): unknown {
      if (request === "vscode") {
        return fakeVscode;
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    const { ConfigEditorController } = require("../webviewController") as typeof import("../webviewController");
    const { ConfigStore } = require("../configStore") as typeof import("../configStore");
    const { createDefaultConfig } = require("../types") as typeof import("../types");

    const store = new ConfigStore(tempDir);
    store.getSerialPorts = async () => [
      {
        address: "COM36",
        label: "USB Serial Device",
        protocol: "serial",
        type: "USB"
      }
    ];
    const config = createDefaultConfig();
    config.current.port.address = "COM36";
    config.current.build.sketchPath = "sketch.ino";
    store.setData(config);

    let onDidReceiveMessageHandler: ((message: { type?: string; payload?: unknown }) => Promise<void> | void) | undefined;
    const fakeWebview = {
      html: "",
      options: {} as { enableScripts?: boolean },
      cspSource: "vscode-webview://test",
      postMessage: async () => true,
      onDidReceiveMessage: (handler: (message: { type?: string; payload?: unknown }) => Promise<void> | void) => {
        onDidReceiveMessageHandler = handler;
        return { dispose: () => {} };
      }
    };

    const controller = new ConfigEditorController({} as never, store);
    controller.attach(fakeWebview as never);

    await onDidReceiveMessageHandler?.({
      type: "save-config",
      payload: {
        boardName: "ESP32-S3",
        boardFqbn: "esp32:esp32:esp32s3",
        boardCompileArgs: "",
        boardPinDefines: "{}",
        portAddress: "COM36",
        portAuto: true,
        buildOutputDir: "build",
        sketchPath: "sketch.ino",
        compileBeforeUpload: false,
        uploadThenMonitor: false,
        monitorBaudRate: "115200",
        monitorDataBits: "8",
        monitorStopBits: "1",
        monitorParity: "none",
        monitorNewline: "CRLF",
        wslEnabled: true,
        wslDistro: "DKC",
        wslWorkspaceRoot: "$HOME/arduino-build/ArduFlux",
        wslArduinoCliPath: "~/bin/arduino-cli",
        wslSyncProjectExcludes: ".git\nnode_modules\nbuild",
        wslSyncLibrariesEnabled: true,
        wslWindowsLibrariesPath: "C:\\Users\\cross\\Documents\\Arduino\\libraries",
        wslLibrariesPath: "~/Arduino/libraries",
        wslLibrarySyncMode: "copy-missing",
        wslBackupLibraries: true,
        wslLibraryExclude: "^\\.\n^tmp$"
      }
    });

    const saved = JSON.parse(await fs.readFile(path.join(tempDir, "ArduFlux.json"), "utf8")) as {
      current: {
        wsl: {
          enabled: boolean;
          compileBackend: string;
          distro: string;
          workspaceRoot: string;
          arduinoCliPath: string;
          syncProject: { excludes: string[] };
          syncLibraries: {
            enabled: boolean;
            windowsPath: string;
            wslPath: string;
            mode: string;
            backup: boolean;
            exclude: string[];
          };
        };
      };
    };

    expect(saved.current.wsl.enabled).to.equal(true);
    expect(saved.current.wsl.compileBackend).to.equal("wsl");
    expect(saved.current.wsl.distro).to.equal("DKC");
    expect(saved.current.wsl.workspaceRoot).to.equal("$HOME/arduino-build/ArduFlux");
    expect(saved.current.wsl.arduinoCliPath).to.equal("~/bin/arduino-cli");
    expect(saved.current.wsl.syncProject.excludes).to.deep.equal([".git", "node_modules", "build"]);
    expect(saved.current.wsl.syncLibraries.enabled).to.equal(true);
    expect(saved.current.wsl.syncLibraries.backup).to.equal(true);
    expect(saved.current.wsl.syncLibraries.exclude).to.deep.equal(["^\\.", "^tmp$"]);
  });
});
