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
          sketchPath: "",
          compileBeforeUpload: false,
          uploadThenMonitor: false,
          monitorBaudRate: "115200",
          monitorDataBits: "8",
          monitorStopBits: "1",
          monitorParity: "none",
          monitorNewline: "CRLF",
          wslEnabled: true,
          wslDistro: "Ubuntu",
          wslWorkspaceRoot: "/home/me/arduino-build/demo",
          wslArduinoCliPath: "~/bin/arduino-cli",
          wslSyncExcludes: ".git\nnode_modules"
        }
      });

      const savedConfig = JSON.parse(await fs.readFile(path.join(tempDir, "ArduFlux.json"), "utf8"));
      expect(savedConfig.current.wsl.enabled).to.equal(true);
      expect(savedConfig.current.wsl.distro).to.equal("Ubuntu");
      expect(savedConfig.current.wsl.syncProject.excludes).to.deep.equal([".git", "node_modules"]);

      disposeAll(context.subscriptions);
    } finally {
      ConfigStore.prototype.load = originalLoadConfig;
      ConfigStore.prototype.getSerialPorts = originalGetSerialPorts;
    }
  });
});
