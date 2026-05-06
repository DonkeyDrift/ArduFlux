import * as vscode from "vscode";
import { ConfigStore, ValidationError, buildCompileArgs, buildMonitorArgs, buildUploadArgs, recommendSerialPort } from "./configStore";
import { onDidChangeArduFluxConfig } from "./events";
import { runInTerminal } from "./terminal";
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
  monitorEnabled: boolean;
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
    return error.suggestion ? `${error.message}\n建议：${error.suggestion}` : error.message;
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
      throw new ValidationError("引脚定义必须是对象", "请使用 JSON 对象，例如 {\"ws2812_pin\":48}");
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError("引脚定义不是合法 JSON", "请检查 JSON 语法后重试");
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
      recentOutputDirs: [...(baseConfig.current.build.recentOutputDirs ?? [])]
    },
    monitor: {
      enabled: Boolean(form.monitorEnabled),
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
          await this.syncView("配置编辑器已就绪");
          return;
        case "save-config":
          await this.saveConfig(message.payload as FormPayload);
          return;
        case "validate-config":
          await this.validateConfig(message.payload as FormPayload);
          return;
        case "compile-sketch":
          await this.compileSketch();
          return;
        case "upload-sketch":
          await this.uploadSketch();
          return;
        case "refresh-ports":
          this.store.clearSerialPortsCache();
          await this.syncView("串口列表已刷新");
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
      await this.syncView("配置已保存");
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
      await this.syncView("校验通过");
      onDidChangeArduFluxConfig.fire();
    } catch (error) {
      await this.postMessage({ type: "validating", active: false, error: formatError(error) });
      throw error;
    }
  }

  private async saveProfile(payload: { name?: string; form?: FormPayload }): Promise<void> {
    const name = payload.name?.trim() ?? "";
    if (!payload.form) {
      throw new ValidationError("缺少待保存的表单数据");
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
    await this.syncView(`Profile 已保存：${name}`);
    onDidChangeArduFluxConfig.fire();
  }

  private async applyProfile(payload: { name?: string }): Promise<void> {
    const name = payload.name?.trim() ?? "";
    this.store.applyProfile(name);
    await this.store.save();
    await this.syncView(`Profile 已应用：${name}`);
    onDidChangeArduFluxConfig.fire();
  }

  private async deleteProfile(payload: { name?: string }): Promise<void> {
    const name = payload.name?.trim() ?? "";
    if (!name) {
      throw new ValidationError("请选择要删除的 Profile");
    }
    this.store.deleteProfile(name);
    await this.store.save();
    await this.syncView(`Profile 已删除：${name}`);
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
    await this.syncView(`Profiles 已导出：${target.fsPath}`);
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
        { label: "合并", description: "保留现有 Profiles 并合并导入内容", merge: true },
        { label: "覆盖", description: "用导入内容替换现有 Profiles", merge: false }
      ],
      { placeHolder: "选择导入方式" }
    );
    if (!mergeChoice) {
      return;
    }

    await this.store.importProfiles(selected[0].fsPath, mergeChoice.merge);
    await this.store.save();
    await this.syncView("Profiles 已导入");
    onDidChangeArduFluxConfig.fire();
  }

  private async openMonitor(): Promise<void> {
    const config = this.store.getData();
    const current = config.current;

    if (!current.monitor.enabled) {
      throw new ValidationError("监视器未启用", "请在面板中勾选「启用监视器」后再试");
    }

    const port = current.port.address.trim();
    if (!port) {
      throw new ValidationError("串口未选择", "请先选择串口端口");
    }

    const args = buildMonitorArgs({
      port,
      fqbn: current.board.fqbn.trim() || undefined,
      baudRate: current.monitor.baudRate || undefined,
      dataBits: current.monitor.dataBits || undefined,
      stopBits: current.monitor.stopBits || undefined,
      parity: current.monitor.parity || undefined
    });

    const cmd = [this.store.arduinoCliPath, ...args].join(" ");
    const terminal = vscode.window.createTerminal({
      name: `Serial Monitor (${port})`,
      cwd: this.store.baseDir
    });
    terminal.sendText(cmd);
    terminal.show();
    await this.syncView(`已打开串口监视器: ${port}`);
  }

  async compileSketch(): Promise<void> {
    const config = this.store.getData().current;
    this.store.validateBoard(config.board);
    const args = buildCompileArgs({
      fqbn: config.board.fqbn,
      sketchPath: this.store.baseDir,
      outputDir: config.build.outputDir || undefined,
      extraArgs: config.board.compileArgs.length > 0 ? config.board.compileArgs : undefined
    });
    await this.postMessage({ type: "compiling", active: true });
    try {
      await runInTerminal(this.store.arduinoCliPath, this.store.baseDir, "Arduino Compile", args);
      await this.syncView("编译完成");
    } catch (error) {
      await this.postMessage({ type: "compiling", active: false, error: formatError(error) });
      throw error;
    } finally {
      await this.postMessage({ type: "compiling", active: false });
    }
  }

  async uploadSketch(): Promise<void> {
    const config = this.store.getData().current;
    await this.store.validatePort(config.port);
    this.store.validateBoard(config.board);
    const args = buildUploadArgs({
      port: config.port.address,
      fqbn: config.board.fqbn,
      sketchPath: this.store.baseDir
    });
    await this.postMessage({ type: "uploading", active: true });
    try {
      await runInTerminal(this.store.arduinoCliPath, this.store.baseDir, "Arduino Upload", args);
      await this.syncView("上传完成");
    } catch (error) {
      await this.postMessage({ type: "uploading", active: false, error: formatError(error) });
      throw error;
    } finally {
      await this.postMessage({ type: "uploading", active: false });
    }
  }

  private getHtml(webview: vscode.Webview, state: PanelStatePayload): string {
    const nonce = createNonce();
    const initialState = JSON.stringify(state)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>开发板配置</title>
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
      grid-template-columns: 160px minmax(0, 1fr);
      gap: 8px 12px;
      margin-bottom: 18px;
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
    textarea {
      min-height: 120px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family, Consolas, monospace);
    }
    button {
      padding: 6px 12px;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .hint, #status {
      color: var(--vscode-descriptionForeground);
    }
    .muted {
      opacity: 0.85;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="saveButton">保存全部</button>
    <button id="compileButton" class="secondary">编译</button>
    <button id="uploadButton">上传</button>
    <button id="refreshPortsButton" class="secondary">刷新串口列表</button>
    <button id="openConfigButton" class="secondary">打开配置文件</button>
    <button id="openMonitorButton" class="secondary">打开串口监视器</button>
    <span id="status">就绪</span>
  </div>

  <h2>板子型号</h2>
  <div class="row">
    <select id="boardPreset"></select>
  </div>
  <div class="grid">
    <label for="boardName">显示名称</label>
    <input id="boardName" />
    <label for="boardFqbn">FQBN</label>
    <input id="boardFqbn" />
    <label for="boardCompileArgs">编译参数</label>
    <input id="boardCompileArgs" />
    <label for="boardPinDefines">引脚定义 JSON</label>
    <textarea id="boardPinDefines"></textarea>
  </div>

  <h2>串口</h2>
  <div class="grid">
    <label for="portAddress">端口</label>
    <select id="portAddress"></select>
    <label for="portAuto">自动选择</label>
    <div class="row">
      <input id="portAuto" type="checkbox" style="width:auto" />
      <span class="hint">优先 USB 端口</span>
    </div>
  </div>
  <div class="hint" id="recommendedPort">当前推荐端口：无</div>

  <h2>编译输出</h2>
  <div class="grid">
    <label for="buildOutputDir">输出目录</label>
    <input id="buildOutputDir" />
    <label for="recentOutputDirs">最近路径</label>
    <select id="recentOutputDirs"></select>
  </div>

  <h2>串口监视器</h2>
  <div class="grid">
    <label for="monitorEnabled">启用监视器</label>
    <div class="row">
      <input id="monitorEnabled" type="checkbox" style="width:auto" />
      <span class="hint">上传后自动打开</span>
    </div>
    <label for="monitorBaudRate">波特率</label>
    <input id="monitorBaudRate" />
    <label for="monitorDataBits">数据位</label>
    <input id="monitorDataBits" />
    <label for="monitorStopBits">停止位</label>
    <input id="monitorStopBits" />
    <label for="monitorParity">校验位</label>
    <select id="monitorParity">
      <option value="none">none</option>
      <option value="odd">odd</option>
      <option value="even">even</option>
      <option value="mark">mark</option>
      <option value="space">space</option>
    </select>
    <label for="monitorNewline">换行符</label>
    <select id="monitorNewline">
      <option value="CRLF">CRLF</option>
      <option value="LF">LF</option>
      <option value="CR">CR</option>
    </select>
  </div>

  <h2>Profiles</h2>
  <div class="row">
    <select id="profileSelect"></select>
    <button id="applyProfileButton" class="secondary">应用</button>
    <button id="deleteProfileButton" class="secondary">删除</button>
  </div>
  <div class="row">
    <input id="profileName" placeholder="输入新的 Profile 名称" />
    <button id="saveProfileButton" class="secondary">保存当前为 Profile</button>
  </div>
  <div class="row">
    <button id="exportProfilesButton" class="secondary">导出 Profiles</button>
    <button id="importProfilesButton" class="secondary">导入 Profiles</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${initialState};

    const ids = [
      "boardPreset", "boardName", "boardFqbn", "boardCompileArgs", "boardPinDefines",
      "portAddress", "portAuto", "buildOutputDir", "recentOutputDirs", "monitorEnabled",
      "monitorBaudRate", "monitorDataBits", "monitorStopBits", "monitorParity",
      "monitorNewline", "profileSelect", "profileName", "status", "recommendedPort"
    ];
    const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

    const spinnerChars = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
    let spinnerInterval = null;

    function setStatus(text) {
      stopSpinner();
      el.status.textContent = text || "就绪";
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
        (item) => item.name === "__custom__" ? "自定义" : item.name,
        detectPresetName(current.board),
        false
      );
      el.boardName.value = current.board.name || "";
      el.boardFqbn.value = current.board.fqbn || "";
      el.boardCompileArgs.value = (current.board.compileArgs || []).join(" ");
      el.boardPinDefines.value = JSON.stringify(current.board.pinDefines || {}, null, 2);

      fillSelect(
        el.portAddress,
        state.ports,
        (item) => item.address,
        (item) => optionTextForPort(item),
        current.port.address || "",
        true
      );
      el.portAuto.checked = !!current.port.auto;
      el.recommendedPort.textContent = "当前推荐端口：" + (state.recommendedPort || "无");

      el.buildOutputDir.value = current.build.outputDir || "";
      fillSelect(
        el.recentOutputDirs,
        current.build.recentOutputDirs || [],
        (item) => item,
        (item) => item,
        "",
        true
      );

      el.monitorEnabled.checked = !!current.monitor.enabled;
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
        monitorEnabled: el.monitorEnabled.checked,
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
        setStatus("已切换为自定义板型");
        return;
      }
      el.boardName.value = item.name;
      el.boardFqbn.value = item.fqbn;
      el.boardCompileArgs.value = (item.compileArgs || []).join(" ");
      el.boardPinDefines.value = JSON.stringify(item.pinDefines || {}, null, 2);
      setStatus("已载入预置板型");
    });

    el.recentOutputDirs.addEventListener("change", () => {
      if (el.recentOutputDirs.value) {
        el.buildOutputDir.value = el.recentOutputDirs.value;
      }
    });

    document.getElementById("saveButton").addEventListener("click", () => {
      try {
        setStatus("正在校验并保存...");
        vscode.postMessage({ type: "save-config", payload: collectForm() });
      } catch (err) {
        setStatus("保存失败: " + (err.message || String(err)));
      }
    });
    document.getElementById("compileButton").addEventListener("click", () => {
      vscode.postMessage({ type: "compile-sketch" });
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

    window.addEventListener("message", (event) => {
      if (event.data?.type === "state" && event.data.payload) {
        state = event.data.payload;
        render();
        setStatus(event.data.statusMessage || "就绪");
      }
      if (event.data?.type === "error") {
        setStatus(event.data.message || "发生错误");
      }
      if (event.data?.type === "compiling") {
        if (event.data.active) {
          startSpinner("编译中");
        } else {
          stopSpinner();
          setStatus(event.data.error || "编译完成");
        }
      }
      if (event.data?.type === "uploading") {
        if (event.data.active) {
          startSpinner("上传中");
        } else {
          stopSpinner();
          setStatus(event.data.error || "上传完成");
        }
      }
      if (event.data?.type === "saving") {
        if (event.data.active) {
          startSpinner("保存中");
        } else {
          stopSpinner();
          setStatus(event.data.error || "配置已保存");
        }
      }
      if (event.data?.type === "validating") {
        if (event.data.active) {
          startSpinner("校验中");
        } else {
          stopSpinner();
          setStatus(event.data.error || "校验通过");
        }
      }
    });

    render();
    vscode.postMessage({ type: "webview-ready" });
  </script>
</body>
</html>`;
  }
}
