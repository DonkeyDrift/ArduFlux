import * as vscode from "vscode";
import { ConfigStore, ValidationError, buildCompileArgs, buildMonitorArgs, buildUploadArgs, recommendSerialPort } from "./configStore";
import { onDidChangeArduFluxConfig } from "./events";
import { runInTerminal, runUploaderFlow } from "./terminal";
import { BoardCatalogItem, DEFAULT_BOARD_CATALOG, ArduFluxConfig, ArduFluxCurrentConfig, SerialPortInfo } from "./types";

export interface PanelStatePayload {
  config: ArduFluxConfig;
  ports: SerialPortInfo[];
  boardCatalog: BoardCatalogItem[];
  recommendedPort: string;
}

export interface FormPayload {
  boardName: string;
  boardFqbn: string;
  boardCompileArgs: string;
  boardPinDefines: string;
  portAddress: string;
  portAuto: boolean;
  buildOutputDir: string;
  sketchPath: string;
  compileBeforeUpload?: boolean;
  uploadThenMonitor?: boolean;
  monitorBaudRate: string;
  monitorDataBits: string;
  monitorStopBits: string;
  monitorParity: string;
  monitorNewline: string;
}

function createNonce(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function tokenizeArgs(text: string): string[] {
  const matches = text.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return matches.map((item) => item.replace(/^["']|["']$/g, ""));
}

function formatError(error: unknown): string {
  if (error instanceof ValidationError) {
    return error.suggestion ? vscode.l10n.t("{0}\nSuggestion: {1}", error.message, error.suggestion) : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function buildCurrentConfig(form: FormPayload, baseConfig: ArduFluxConfig): ArduFluxCurrentConfig {
  let pinDefines: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(form.boardPinDefines.trim() || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      pinDefines = parsed as Record<string, unknown>;
    } else {
      throw new ValidationError(vscode.l10n.t("Pin defines must be an object"), vscode.l10n.t('Please use a JSON object, e.g. {"ws2812_pin":48}'));
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(vscode.l10n.t("Pin defines is not valid JSON"), vscode.l10n.t("Please check the JSON syntax and try again"));
  }

  return {
    board: {
      name: form.boardName.trim() || "Custom",
      fqbn: form.boardFqbn.trim(),
      compileArgs: tokenizeArgs(form.boardCompileArgs),
      pinDefines
    },
    port: {
      address: form.portAddress.replace(/\s*\[USB\]\s*/gi, "").trim(),
      auto: Boolean(form.portAuto),
      lastSuccessfulAddress: baseConfig.current.port.lastSuccessfulAddress ?? ""
    },
    build: {
      outputDir: form.buildOutputDir.trim(),
      recentOutputDirs: [...(baseConfig.current.build.recentOutputDirs ?? [])],
      sketchPath: form.sketchPath.trim(),
      compileBeforeUpload: form.compileBeforeUpload !== undefined
        ? Boolean(form.compileBeforeUpload)
        : Boolean(baseConfig.current.build.compileBeforeUpload),
      uploadThenMonitor: form.uploadThenMonitor !== undefined
        ? Boolean(form.uploadThenMonitor)
        : Boolean(baseConfig.current.build.uploadThenMonitor)
    },
    monitor: {
      enabled: true,
      baudRate: Number(form.monitorBaudRate || 0),
      dataBits: Number(form.monitorDataBits || 0),
      stopBits: Number(form.monitorStopBits || 0),
      parity: form.monitorParity.trim(),
      newline: form.monitorNewline.trim()
    }
  };
}

export class ConfigEditorController {
  private webview: vscode.Webview | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: ConfigStore,
    private readonly log: (message: string) => void = () => {}
  ) {}

  attach(webview: vscode.Webview): void {
    this.webview = webview;
    this.log("[webview] Attached webview instance");

    const d = webview.onDidReceiveMessage(async (message: { type?: string; payload?: unknown }) => {
      this.log(`[webview] Received message type=${message.type ?? "unknown"}`);
      await this.handleMessage(message);
    });
    this.disposables.push(d);
  }

  detach(): void {
    this.log("[webview] Detached webview instance");
    this.webview = null;
  }

  dispose(): void {
    this.detach();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  async initialize(): Promise<void> {
    const state = await this.collectState();
    if (this.webview) {
      this.webview.html = this.getHtml(this.webview, state);
      this.log("[webview] Initial HTML rendered");
    }
  }

  private async collectState(): Promise<PanelStatePayload> {
    const config = await this.store.load();
    const ports = await this.store.getSerialPorts();
    const recommendedPort = recommendSerialPort(
      ports,
      config.current.port.address,
      config.current.port.auto
    );

    return {
      config,
      ports,
      boardCatalog: DEFAULT_BOARD_CATALOG,
      recommendedPort
    };
  }

  async syncView(statusMessage?: string): Promise<void> {
    if (!this.webview) {
      this.log("[webview] syncView skipped because no webview is attached");
      return;
    }
    const payload = await this.collectState();
    this.log(
      `[webview] Posting state message (ports=${payload.ports.length}, profiles=${Object.keys(payload.config.profiles || {}).length}, status=${statusMessage ?? ""})`
    );
    await this.webview.postMessage({
      type: "state",
      payload,
      statusMessage
    });
  }

  private async postMessage(message: unknown): Promise<void> {
    if (this.webview) {
      await this.webview.postMessage(message);
    }
  }

  private async handleMessage(message: { type?: string; payload?: unknown }): Promise<void> {
    try {
      switch (message.type) {
        case "webview-ready":
          await this.syncView(vscode.l10n.t("Configuration editor ready"));
          return;
        case "save-config":
          await this.saveConfig(message.payload as FormPayload);
          return;
        case "validate-config":
          await this.validateConfig(message.payload as FormPayload);
          return;
        case "auto-save-config":
          try {
            await this.saveConfig(message.payload as FormPayload);
          } catch {
            // Auto-save errors are silently shown in webview status bar via saveConfig's postMessage
          }
          return;
        case "compile-sketch":
          await this.compileSketch();
          return;
        case "upload-sketch":
          await this.uploadSketch();
          return;
        case "refresh-ports":
          this.store.clearSerialPortsCache();
          await this.syncView(vscode.l10n.t("Serial port list refreshed"));
          return;
        case "save-profile":
          await this.saveProfile(message.payload as { name?: string; form?: FormPayload });
          return;
        case "apply-profile":
          await this.applyProfile(message.payload as { name?: string });
          return;
        case "delete-profile":
          await this.deleteProfile(message.payload as { name?: string });
          return;
        case "export-profiles":
          await this.exportProfiles();
          return;
        case "import-profiles":
          await this.importProfiles();
          return;
        case "open-config-file":
          await vscode.commands.executeCommand("arduflux.openConfigFile");
          return;
        case "open-monitor":
          await this.openMonitor();
          return;
        case "select-sketch":
          await this.selectSketch();
          return;
        case "toggle-compile-link":
          await this.toggleCompileLink();
          return;
        case "toggle-monitor-link":
          await this.toggleMonitorLink();
          return;
        default:
          return;
      }
    } catch (error) {
      void vscode.window.showErrorMessage(formatError(error));
      await this.postMessage({
        type: "error",
        message: formatError(error)
      });
    }
  }

  private async saveConfig(form: FormPayload): Promise<void> {
    await this.postMessage({ type: "saving", active: true });
    try {
      const current = this.store.getData();
      const nextCurrent = buildCurrentConfig(form, current);
      const nextConfig: ArduFluxConfig = {
        ...current,
        current: nextCurrent
      };
      this.store.setData(nextConfig);
      if (nextCurrent.build.outputDir) {
        this.store.setOutputDir(nextCurrent.build.outputDir);
      }
      await this.store.validateAll();
      await this.store.save();
      await this.syncView(vscode.l10n.t("Configuration saved"));
      onDidChangeArduFluxConfig.fire();
    } catch (error) {
      await this.postMessage({ type: "saving", active: false, error: formatError(error) });
      throw error;
    }
  }

  private async validateConfig(form: FormPayload): Promise<void> {
    await this.postMessage({ type: "validating", active: true });
    try {
      const current = this.store.getData();
      const nextCurrent = buildCurrentConfig(form, current);
      const nextConfig: ArduFluxConfig = {
        ...current,
        current: nextCurrent
      };
      this.store.setData(nextConfig);
      if (nextCurrent.build.outputDir) {
        this.store.setOutputDir(nextCurrent.build.outputDir);
      }
      await this.store.validateAll();
      await this.store.save();
      await this.syncView(vscode.l10n.t("Validation passed"));
      onDidChangeArduFluxConfig.fire();
    } catch (error) {
      await this.postMessage({ type: "validating", active: false, error: formatError(error) });
      throw error;
    }
  }

  private async saveProfile(payload: { name?: string; form?: FormPayload }): Promise<void> {
    const name = payload.name?.trim() ?? "";
    if (!payload.form) {
      throw new ValidationError(vscode.l10n.t("Missing form data to save"));
    }

    const current = this.store.getData();
    const nextCurrent = buildCurrentConfig(payload.form, current);
    this.store.setData({
      ...current,
      current: nextCurrent
    });
    if (nextCurrent.build.outputDir) {
      this.store.setOutputDir(nextCurrent.build.outputDir);
    }
    await this.store.validateAll();
    this.store.saveProfile(name);
    await this.store.save();
    await this.syncView(vscode.l10n.t("Profile saved: {0}", name));
    onDidChangeArduFluxConfig.fire();
  }

  private async applyProfile(payload: { name?: string }): Promise<void> {
    const name = payload.name?.trim() ?? "";
    this.store.applyProfile(name);
    await this.store.save();
    await this.syncView(vscode.l10n.t("Profile applied: {0}", name));
    onDidChangeArduFluxConfig.fire();
  }

  private async deleteProfile(payload: { name?: string }): Promise<void> {
    const name = payload.name?.trim() ?? "";
    if (!name) {
      throw new ValidationError(vscode.l10n.t("Please select a profile to delete"));
    }
    this.store.deleteProfile(name);
    await this.store.save();
    await this.syncView(vscode.l10n.t("Profile deleted: {0}", name));
    onDidChangeArduFluxConfig.fire();
  }

  private async exportProfiles(): Promise<void> {
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(vscode.Uri.file(this.store.baseDir), "profiles.json"),
      filters: { JSON: ["json"] }
    });
    if (!target) {
      return;
    }
    await this.store.exportProfiles(target.fsPath);
    await this.syncView(vscode.l10n.t("Profiles exported: {0}", target.fsPath));
  }

  private async importProfiles(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { JSON: ["json"] },
      defaultUri: vscode.Uri.file(this.store.baseDir)
    });
    if (!selected || selected.length === 0) {
      return;
    }

    const mergeChoice = await vscode.window.showQuickPick(
      [
        { label: vscode.l10n.t("Merge"), description: vscode.l10n.t("Keep existing profiles and merge in the imported ones"), merge: true },
        { label: vscode.l10n.t("Overwrite"), description: vscode.l10n.t("Replace existing profiles with the imported ones"), merge: false }
      ],
      { placeHolder: vscode.l10n.t("Choose an import mode") }
    );
    if (!mergeChoice) {
      return;
    }

    await this.store.importProfiles(selected[0].fsPath, mergeChoice.merge);
    await this.store.save();
    await this.syncView(vscode.l10n.t("Profiles imported"));
    onDidChangeArduFluxConfig.fire();
  }

  private async openMonitor(): Promise<void> {
    await this.syncView(vscode.l10n.t("Serial monitor opened"));
    const sketchPath = this.store.getData().current.build.sketchPath ?? "";
    await runUploaderFlow(this.store.baseDir, { monitor: true, sketchPath });
  }

  private async selectSketch(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { "Arduino Sketch": ["ino"] },
      defaultUri: vscode.Uri.file(this.store.baseDir)
    });
    if (!selected || selected.length === 0) {
      return;
    }
    const path = selected[0].fsPath;
    const config = this.store.getData();
    const nextConfig: ArduFluxConfig = {
      ...config,
      current: {
        ...config.current,
        build: {
          ...config.current.build,
          sketchPath: path
        }
      }
    };
    this.store.setData(nextConfig);
    await this.store.save();
    onDidChangeArduFluxConfig.fire();
    await this.postMessage({ type: "sketch-selected", path });
  }

  private async toggleCompileLink(): Promise<void> {
    const config = this.store.getData();
    const nextLinked = !config.current.build.compileBeforeUpload;
    const nextConfig: ArduFluxConfig = {
      ...config,
      current: {
        ...config.current,
        build: {
          ...config.current.build,
          compileBeforeUpload: nextLinked
        }
      }
    };
    this.store.setData(nextConfig);
    await this.postMessage({ type: "link-toggled", linked: nextLinked });
    onDidChangeArduFluxConfig.fire();
    await this.store.save();
  }

  private async toggleMonitorLink(): Promise<void> {
    const config = this.store.getData();
    const nextLinked = !config.current.build.uploadThenMonitor;
    const nextConfig: ArduFluxConfig = {
      ...config,
      current: {
        ...config.current,
        build: {
          ...config.current.build,
          uploadThenMonitor: nextLinked
        }
      }
    };
    this.store.setData(nextConfig);
    await this.postMessage({ type: "monitor-link-toggled", linked: nextLinked });
    onDidChangeArduFluxConfig.fire();
    await this.store.save();
  }

  async compileSketch(): Promise<void> {
    await ConfigStore.waitForSave();
    await this.postMessage({ type: "compiling", active: true });
    try {
      const sketchPath = this.store.getData().current.build.sketchPath ?? "";
      await runUploaderFlow(this.store.baseDir, { compile: true, sketchPath });
      await this.syncView(vscode.l10n.t("Compilation completed"));
      await this.postMessage({ type: "compiling", active: false });
    } catch (error) {
      await this.postMessage({ type: "compiling", active: false, error: formatError(error) });
      throw error;
    }
  }

  async uploadSketch(): Promise<void> {
    await ConfigStore.waitForSave();
    await this.postMessage({ type: "uploading", active: true });
    try {
      const sketchPath = this.store.getData().current.build.sketchPath ?? "";
      await runUploaderFlow(this.store.baseDir, { upload: true, sketchPath });
      await this.postMessage({ type: "uploading", active: false });
      await this.syncView(vscode.l10n.t("Upload completed"));
      const uploadThenMonitor = this.store.getData().current.build.uploadThenMonitor ?? false;
      if (uploadThenMonitor) {
        await this.openMonitor();
      }
    } catch (error) {
      await this.postMessage({ type: "uploading", active: false, error: formatError(error) });
      throw error;
    }
  }

  private getHtml(webview: vscode.Webview, state: PanelStatePayload): string {
    const nonce = createNonce();
    const initialState = JSON.stringify(state)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");

    const i18n = {
      ready: vscode.l10n.t("Ready"),
      autoSaveFailed: vscode.l10n.t("Auto-save failed: "),
      custom: vscode.l10n.t("Custom"),
      recommendedPrefix: vscode.l10n.t("Recommended: "),
      none: vscode.l10n.t("None"),
      compileLinkedTitle: vscode.l10n.t("Linked: auto-compile before upload (click to unlink)"),
      compileUnlinkedTitle: vscode.l10n.t("Unlinked: upload directly without compiling (click to link)"),
      monitorLinkedTitle: vscode.l10n.t("Linked: auto-open serial monitor after upload (click to unlink)"),
      monitorUnlinkedTitle: vscode.l10n.t("Unlinked: serial monitor will not open automatically after upload (click to link)"),
      switchedToCustomBoard: vscode.l10n.t("Switched to custom board"),
      loadedPresetBoard: vscode.l10n.t("Preset board loaded"),
      validatingEllipsis: vscode.l10n.t("Validating..."),
      validationFailed: vscode.l10n.t("Validation failed: "),
      errorOccurred: vscode.l10n.t("An error occurred"),
      compiling: vscode.l10n.t("Compiling"),
      compileCompleted: vscode.l10n.t("Compilation completed"),
      uploading: vscode.l10n.t("Uploading"),
      uploadCompleted: vscode.l10n.t("Upload completed"),
      saving: vscode.l10n.t("Saving"),
      configSaved: vscode.l10n.t("Configuration saved"),
      validating: vscode.l10n.t("Validating"),
      validationPassed: vscode.l10n.t("Validation passed")
    };
    const i18nJson = JSON.stringify(i18n)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ArduFlux</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: var(--vscode-font-family);
      padding: 16px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .toolbar, .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
      align-items: center;
    }
    .grid {
      display: grid;
      grid-template-columns: 60px minmax(0, 1fr);
      gap: 8px 12px;
      margin-bottom: 18px;
    }
    .grid > label {
      text-align: left;
      align-self: center;
    }
    h2 {
      margin: 20px 0 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 6px;
    }
    input, select, textarea, button {
      font: inherit;
    }
    input, select, textarea {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      padding: 6px 8px;
    }
    select option {
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
      color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
    }
    textarea {
      min-height: 120px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family, Consolas, monospace);
    }
    button {
      padding: 6px 12px;
      border: 1px solid transparent;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    button:not(.secondary):not(.danger) {
      background: #0891b2;
      color: #ffffff;
      border-color: rgba(6, 182, 212, 0.5);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 2px rgba(0,0,0,0.2);
    }
    button:not(.secondary):not(.danger):hover {
      background: #0e7490;
    }
    button.secondary {
      background: #27272a;
      color: #f4f4f5;
      border-color: #3f3f46;
    }
    button.secondary:hover {
      background: #3f3f46;
    }
    button.secondary:active {
      background: #18181b;
    }
    button.danger {
      background: #dc2626;
      color: #ffffff;
      border-color: rgba(239, 68, 68, 0.5);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 2px rgba(0,0,0,0.2);
    }
    button.danger:hover {
      background: #b91c1c;
    }
    button#linkButton, button#linkButton2 {
      padding: 4px 10px;
      min-width: 32px;
      font-size: 14px;
    }
    button#linkButton.linked, button#linkButton2.linked {
      color: #89d185;
    }
    button#linkButton.unlinked, button#linkButton2.unlinked {
      color: #a1a1aa;
    }
    .hint, #status {
      color: var(--vscode-descriptionForeground);
    }
    .muted {
      opacity: 0.85;
    }
    .advanced-item {
      display: none;
    }
    body.show-advanced .advanced-item {
      display: block;
    }
    body.show-advanced .advanced-item.grid,
    body.show-advanced .grid.advanced-item {
      display: grid;
    }
    body.show-advanced .advanced-item.row,
    body.show-advanced .row.advanced-item {
      display: flex;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="compileButton" class="secondary">${vscode.l10n.t("Compile")}</button>
    <button id="linkButton" class="secondary unlinked" title="${vscode.l10n.t("Click to toggle: compile automatically before upload")}">✂</button>
    <button id="uploadButton">${vscode.l10n.t("Upload")}</button>
    <button id="linkButton2" class="secondary unlinked" title="${vscode.l10n.t("Click to toggle: open serial monitor automatically after upload")}">✂</button>
    <button id="openMonitorButton" class="secondary">${vscode.l10n.t("Serial Monitor")}</button>
  </div>
  <div class="toolbar" style="margin-top:0">
    <span id="status">${vscode.l10n.t("Ready")}</span>
    <label class="hint" style="cursor:pointer;display:flex;align-items:center;gap:4px;margin-left:auto">
      <input id="showAdvanced" type="checkbox" style="width:auto" />
      ${vscode.l10n.t("Show advanced options")}
    </label>
  </div>

  <h2>${vscode.l10n.t("Source")}</h2>
  <div class="row" style="margin-bottom:0">
    <input id="sketchPath" readonly style="flex:1;background:var(--vscode-input-background);" placeholder="${vscode.l10n.t("No .ino file selected")}" />
    <button id="selectSketchButton" class="secondary">${vscode.l10n.t("Load")}</button>
  </div>

  <h2>${vscode.l10n.t("Board")}</h2>
  <div class="row">
    <select id="boardPreset"></select>
  </div>
  <div class="grid advanced-item">
    <label for="boardName">${vscode.l10n.t("Display Name")}</label>
    <input id="boardName" />
    <label for="boardFqbn">FQBN</label>
    <input id="boardFqbn" />
  </div>
  <div class="grid advanced-item">
    <label for="boardCompileArgs">${vscode.l10n.t("Compile Args")}</label>
    <input id="boardCompileArgs" />
    <label for="boardPinDefines">${vscode.l10n.t("Pin Defines JSON")}</label>
    <textarea id="boardPinDefines"></textarea>
  </div>

  <h2>${vscode.l10n.t("Serial Port")}</h2>
  <div class="grid">
    <label for="portAddress">${vscode.l10n.t("Port")}</label>
    <select id="portAddress"></select>
    <div class="hint" id="recommendedPort">${vscode.l10n.t("Recommended: {0}", vscode.l10n.t("None"))}</div>
    <div class="row" style="margin-bottom:0;gap:12px">
      <button id="refreshPortsButton" class="secondary">${vscode.l10n.t("Refresh Ports")}</button>
      <label class="hint" style="cursor:pointer;display:flex;align-items:center;gap:4px">
        <input id="portAuto" type="checkbox" style="width:auto" />
        ${vscode.l10n.t("Prefer USB ports")}
      </label>
    </div>
  </div>

  <div class="advanced-item">
    <h2>${vscode.l10n.t("Build Output")}</h2>
    <div class="grid">
      <label for="buildOutputDir">${vscode.l10n.t("Output Directory")}</label>
      <input id="buildOutputDir" />
      <label for="recentOutputDirs">${vscode.l10n.t("Recent Paths")}</label>
      <select id="recentOutputDirs"></select>
    </div>
  </div>

  <div class="grid">
    <label for="monitorBaudRate">${vscode.l10n.t("Baud Rate")}</label>
    <select id="monitorBaudRate">
      <option value="9600">9600</option>
      <option value="19200">19200</option>
      <option value="38400">38400</option>
      <option value="57600">57600</option>
      <option value="115200">115200</option>
      <option value="230400">230400</option>
      <option value="460800">460800</option>
      <option value="921600">921600</option>
    </select>
  </div>
  <div class="grid advanced-item">
    <label for="monitorDataBits">${vscode.l10n.t("Data Bits")}</label>
    <input id="monitorDataBits" />
    <label for="monitorStopBits">${vscode.l10n.t("Stop Bits")}</label>
    <input id="monitorStopBits" />
    <label for="monitorParity">${vscode.l10n.t("Parity")}</label>
    <select id="monitorParity">
      <option value="none">none</option>
      <option value="odd">odd</option>
      <option value="even">even</option>
      <option value="mark">mark</option>
      <option value="space">space</option>
    </select>
    <label for="monitorNewline">${vscode.l10n.t("Newline")}</label>
    <select id="monitorNewline">
      <option value="CRLF">CRLF</option>
      <option value="LF">LF</option>
      <option value="CR">CR</option>
    </select>
  </div>

  <div class="advanced-item">
    <h2>Profiles</h2>
    <div class="row">
      <select id="profileSelect"></select>
      <button id="applyProfileButton" class="secondary">${vscode.l10n.t("Apply")}</button>
      <button id="deleteProfileButton" class="danger">${vscode.l10n.t("Delete")}</button>
    </div>
    <div class="row">
      <input id="profileName" placeholder="${vscode.l10n.t("Enter a new profile name")}" />
      <button id="saveProfileButton" class="secondary">${vscode.l10n.t("Save Current as Profile")}</button>
    </div>
    <div class="row">
      <button id="exportProfilesButton" class="secondary">${vscode.l10n.t("Export Profiles")}</button>
      <button id="importProfilesButton" class="secondary">${vscode.l10n.t("Import Profiles")}</button>
    </div>
  </div>

  <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--vscode-panel-border)">
    <div class="toolbar">
      <button id="saveButton" class="secondary">${vscode.l10n.t("Check Configuration")}</button>
      <button id="openConfigButton" class="secondary">${vscode.l10n.t("Open Configuration")}</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const i18n = ${i18nJson};
    let state = ${initialState};

    const ids = [
      "boardPreset", "boardName", "boardFqbn", "boardCompileArgs", "boardPinDefines",
      "portAddress", "portAuto", "buildOutputDir", "recentOutputDirs",
      "monitorBaudRate", "monitorDataBits", "monitorStopBits", "monitorParity",
      "monitorNewline", "profileSelect", "profileName", "status", "recommendedPort",
      "sketchPath", "selectSketchButton"
    ];
    const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

    const LINK_SVG_CONNECTED = '<svg width="20" height="10" viewBox="0 0 20 10" style="vertical-align:middle;display:block"><circle cx="4" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="5" x2="13" y2="5" stroke="currentColor" stroke-width="1.2"/><circle cx="16" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
    const LINK_SVG_DISCONNECTED = '<svg width="20" height="10" viewBox="0 0 20 10" style="vertical-align:middle;display:block"><circle cx="4" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="16" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';

    const spinnerChars = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
    let spinnerInterval = null;

    function setStatus(text) {
      stopSpinner();
      el.status.textContent = text || i18n.ready;
    }

    let autoSaveTimeout = null;

    function debouncedAutoSave() {
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
      autoSaveTimeout = setTimeout(() => {
        try {
          vscode.postMessage({ type: "auto-save-config", payload: collectForm() });
        } catch (err) {
          setStatus(i18n.autoSaveFailed + (err.message || String(err)));
        }
      }, 500);
    }

    function startSpinner(text) {
      stopSpinner();
      let i = 0;
      spinnerInterval = setInterval(() => {
        el.status.textContent = text + " " + spinnerChars[i % spinnerChars.length];
        i++;
      }, 100);
    }

    function stopSpinner() {
      if (spinnerInterval) {
        clearInterval(spinnerInterval);
        spinnerInterval = null;
      }
    }

    function optionTextForPort(port) {
      const suffix = [port.type, port.label, port.protocol].filter(Boolean).join(" | ");
      const usb = /USB/i.test(suffix) ? " [USB]" : "";
      return suffix ? port.address + usb + " - " + suffix : port.address + usb;
    }

    function fillSelect(selectEl, options, getValue, getLabel, selectedValue, includeBlank) {
      selectEl.innerHTML = "";
      if (includeBlank) {
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "";
        selectEl.appendChild(empty);
      }
      options.forEach((item) => {
        const option = document.createElement("option");
        option.value = getValue(item);
        option.textContent = getLabel(item);
        if (option.value === selectedValue) {
          option.selected = true;
        }
        selectEl.appendChild(option);
      });
      if (selectedValue && !Array.from(selectEl.options).some((item) => item.value === selectedValue)) {
        const fallback = document.createElement("option");
        fallback.value = selectedValue;
        fallback.textContent = selectedValue;
        fallback.selected = true;
        selectEl.appendChild(fallback);
      }
    }

    function detectPresetName(board) {
      const found = state.boardCatalog.find((item) => item.name === board.name || item.fqbn === board.fqbn);
      return found ? found.name : "__custom__";
    }

    function render() {
      const config = state.config;
      const current = config.current;

      fillSelect(
        el.boardPreset,
        [...state.boardCatalog, { name: "__custom__", fqbn: "", compileArgs: [], pinDefines: {} }],
        (item) => item.name,
        (item) => item.name === "__custom__" ? i18n.custom : item.name,
        detectPresetName(current.board),
        false
      );
      el.boardName.value = current.board.name || "";
      el.boardFqbn.value = current.board.fqbn || "";
      el.boardCompileArgs.value = (current.board.compileArgs || []).join(" ");
      el.boardPinDefines.value = JSON.stringify(current.board.pinDefines || {}, null, 2);
      el.sketchPath.value = current.build.sketchPath || "";

      fillSelect(
        el.portAddress,
        state.ports,
        (item) => item.address,
        (item) => optionTextForPort(item),
        current.port.address || "",
        true
      );
      el.portAuto.checked = !!current.port.auto;
      el.recommendedPort.textContent = i18n.recommendedPrefix + (state.recommendedPort || i18n.none);

      el.buildOutputDir.value = current.build.outputDir || "";
      fillSelect(
        el.recentOutputDirs,
        current.build.recentOutputDirs || [],
        (item) => item,
        (item) => item,
        "",
        true
      );

      el.monitorBaudRate.value = String(current.monitor.baudRate ?? 115200);
      el.monitorDataBits.value = String(current.monitor.dataBits ?? 8);
      el.monitorStopBits.value = String(current.monitor.stopBits ?? 1);
      el.monitorParity.value = current.monitor.parity || "none";
      el.monitorNewline.value = current.monitor.newline || "CRLF";

      fillSelect(
        el.profileSelect,
        Object.keys(config.profiles || {}).sort(),
        (item) => item,
        (item) => item,
        el.profileSelect.value,
        false
      );

      const linkBtn = document.getElementById("linkButton");
      if (current.build.compileBeforeUpload) {
        linkBtn.innerHTML = LINK_SVG_CONNECTED;
        linkBtn.classList.remove("unlinked");
        linkBtn.classList.add("linked");
        linkBtn.title = i18n.compileLinkedTitle;
      } else {
        linkBtn.innerHTML = LINK_SVG_DISCONNECTED;
        linkBtn.classList.remove("linked");
        linkBtn.classList.add("unlinked");
        linkBtn.title = i18n.compileUnlinkedTitle;
      }

      const linkBtn2 = document.getElementById("linkButton2");
      if (current.build.uploadThenMonitor) {
        linkBtn2.innerHTML = LINK_SVG_CONNECTED;
        linkBtn2.classList.remove("unlinked");
        linkBtn2.classList.add("linked");
        linkBtn2.title = i18n.monitorLinkedTitle;
      } else {
        linkBtn2.innerHTML = LINK_SVG_DISCONNECTED;
        linkBtn2.classList.remove("linked");
        linkBtn2.classList.add("unlinked");
        linkBtn2.title = i18n.monitorUnlinkedTitle;
      }
    }

    function collectForm() {
      return {
        boardName: el.boardName.value,
        boardFqbn: el.boardFqbn.value,
        boardCompileArgs: el.boardCompileArgs.value,
        boardPinDefines: el.boardPinDefines.value,
        portAddress: el.portAddress.value,
        portAuto: el.portAuto.checked,
        buildOutputDir: el.buildOutputDir.value,
        sketchPath: el.sketchPath.value,
        compileBeforeUpload: document.getElementById("linkButton").classList.contains("linked"),
        uploadThenMonitor: document.getElementById("linkButton2").classList.contains("linked"),
        monitorBaudRate: el.monitorBaudRate.value,
        monitorDataBits: el.monitorDataBits.value,
        monitorStopBits: el.monitorStopBits.value,
        monitorParity: el.monitorParity.value,
        monitorNewline: el.monitorNewline.value
      };
    }

    el.boardPreset.addEventListener("change", () => {
      const item = state.boardCatalog.find((entry) => entry.name === el.boardPreset.value);
      if (!item) {
        setStatus(i18n.switchedToCustomBoard);
        return;
      }
      el.boardName.value = item.name;
      el.boardFqbn.value = item.fqbn;
      el.boardCompileArgs.value = (item.compileArgs || []).join(" ");
      el.boardPinDefines.value = JSON.stringify(item.pinDefines || {}, null, 2);
      setStatus(i18n.loadedPresetBoard);
    });

    el.recentOutputDirs.addEventListener("change", () => {
      if (el.recentOutputDirs.value) {
        el.buildOutputDir.value = el.recentOutputDirs.value;
      }
    });

    document.getElementById("saveButton").addEventListener("click", () => {
      try {
        setStatus(i18n.validatingEllipsis);
        vscode.postMessage({ type: "validate-config", payload: collectForm() });
      } catch (err) {
        setStatus(i18n.validationFailed + (err.message || String(err)));
      }
    });
    document.getElementById("compileButton").addEventListener("click", () => {
      vscode.postMessage({ type: "compile-sketch" });
    });
    document.getElementById("linkButton").addEventListener("click", () => {
      const btn = document.getElementById("linkButton");
      if (btn.classList.contains("linked")) {
        btn.innerHTML = LINK_SVG_DISCONNECTED;
        btn.classList.remove("linked");
        btn.classList.add("unlinked");
        btn.title = i18n.compileUnlinkedTitle;
      } else {
        btn.innerHTML = LINK_SVG_CONNECTED;
        btn.classList.remove("unlinked");
        btn.classList.add("linked");
        btn.title = i18n.compileLinkedTitle;
      }
      vscode.postMessage({ type: "toggle-compile-link" });
    });
    document.getElementById("linkButton2").addEventListener("click", () => {
      const btn = document.getElementById("linkButton2");
      if (btn.classList.contains("linked")) {
        btn.innerHTML = LINK_SVG_DISCONNECTED;
        btn.classList.remove("linked");
        btn.classList.add("unlinked");
        btn.title = i18n.monitorUnlinkedTitle;
      } else {
        btn.innerHTML = LINK_SVG_CONNECTED;
        btn.classList.remove("unlinked");
        btn.classList.add("linked");
        btn.title = i18n.monitorLinkedTitle;
      }
      vscode.postMessage({ type: "toggle-monitor-link" });
    });
    document.getElementById("uploadButton").addEventListener("click", () => {
      vscode.postMessage({ type: "upload-sketch" });
    });
    document.getElementById("refreshPortsButton").addEventListener("click", () => {
      vscode.postMessage({ type: "refresh-ports" });
    });
    document.getElementById("openConfigButton").addEventListener("click", () => {
      vscode.postMessage({ type: "open-config-file" });
    });
    document.getElementById("openMonitorButton").addEventListener("click", () => {
      vscode.postMessage({ type: "open-monitor" });
    });
    document.getElementById("selectSketchButton").addEventListener("click", () => {
      vscode.postMessage({ type: "select-sketch" });
    });
    document.getElementById("saveProfileButton").addEventListener("click", () => {
      vscode.postMessage({
        type: "save-profile",
        payload: {
          name: el.profileName.value,
          form: collectForm()
        }
      });
    });
    document.getElementById("applyProfileButton").addEventListener("click", () => {
      vscode.postMessage({ type: "apply-profile", payload: { name: el.profileSelect.value } });
    });
    document.getElementById("deleteProfileButton").addEventListener("click", () => {
      vscode.postMessage({ type: "delete-profile", payload: { name: el.profileSelect.value } });
    });
    document.getElementById("exportProfilesButton").addEventListener("click", () => {
      vscode.postMessage({ type: "export-profiles" });
    });
    document.getElementById("importProfilesButton").addEventListener("click", () => {
      vscode.postMessage({ type: "import-profiles" });
    });

    const showAdvancedEl = document.getElementById("showAdvanced");
    showAdvancedEl.addEventListener("change", () => {
      document.body.classList.toggle("show-advanced", showAdvancedEl.checked);
      vscode.setState({ showAdvanced: showAdvancedEl.checked });
    });

    window.addEventListener("message", (event) => {
      if (event.data?.type === "state" && event.data.payload) {
        state = event.data.payload;
        render();
        setStatus(event.data.statusMessage || i18n.ready);
      }
      if (event.data?.type === "error") {
        setStatus(event.data.message || i18n.errorOccurred);
      }
      if (event.data?.type === "compiling") {
        if (event.data.active) {
          startSpinner(i18n.compiling);
        } else {
          stopSpinner();
          setStatus(event.data.error || i18n.compileCompleted);
        }
      }
      if (event.data?.type === "uploading") {
        if (event.data.active) {
          startSpinner(i18n.uploading);
        } else {
          stopSpinner();
          setStatus(event.data.error || i18n.uploadCompleted);
        }
      }
      if (event.data?.type === "saving") {
        if (event.data.active) {
          startSpinner(i18n.saving);
        } else {
          stopSpinner();
          setStatus(event.data.error || i18n.configSaved);
        }
      }
      if (event.data?.type === "validating") {
        if (event.data.active) {
          startSpinner(i18n.validating);
        } else {
          stopSpinner();
          setStatus(event.data.error || i18n.validationPassed);
        }
      }
      if (event.data?.type === "link-toggled") {
        const linkBtn = document.getElementById("linkButton");
        if (event.data.linked) {
          linkBtn.innerHTML = LINK_SVG_CONNECTED;
          linkBtn.classList.remove("unlinked");
          linkBtn.classList.add("linked");
          linkBtn.title = i18n.compileLinkedTitle;
        } else {
          linkBtn.innerHTML = LINK_SVG_DISCONNECTED;
          linkBtn.classList.remove("linked");
          linkBtn.classList.add("unlinked");
          linkBtn.title = i18n.compileUnlinkedTitle;
        }
      }
      if (event.data?.type === "sketch-selected") {
        document.getElementById("sketchPath").value = event.data.path || "";
      }
      if (event.data?.type === "monitor-link-toggled") {
        const linkBtn2 = document.getElementById("linkButton2");
        if (event.data.linked) {
          linkBtn2.innerHTML = LINK_SVG_CONNECTED;
          linkBtn2.classList.remove("unlinked");
          linkBtn2.classList.add("linked");
          linkBtn2.title = i18n.monitorLinkedTitle;
        } else {
          linkBtn2.innerHTML = LINK_SVG_DISCONNECTED;
          linkBtn2.classList.remove("linked");
          linkBtn2.classList.add("unlinked");
          linkBtn2.title = i18n.monitorUnlinkedTitle;
        }
      }
    });

    document.body.addEventListener("input", debouncedAutoSave);
    document.body.addEventListener("change", debouncedAutoSave);

    render();

    const savedUiState = vscode.getState();
    if (savedUiState && savedUiState.showAdvanced) {
      showAdvancedEl.checked = true;
      document.body.classList.add("show-advanced");
    }

    vscode.postMessage({ type: "webview-ready" });
  </script>
</body>
</html>`;
  }
}
