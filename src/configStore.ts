import * as path from "path";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import {
  CONFIG_FILE_NAME,
  ArduFluxConfig,
  ArduFluxCurrentConfig,
  SerialPortInfo,
  ValidationErrorLike,
  createDefaultConfig
} from "./types";

export class ValidationError extends Error implements ValidationErrorLike {
  suggestion?: string;

  constructor(message: string, suggestion?: string) {
    super(message);
    this.name = "ValidationError";
    this.suggestion = suggestion;
  }
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function dedupeKeepLatest(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]?.trim();
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    out.push(item);
    if (out.length >= limit) {
      break;
    }
  }
  return out.reverse();
}

export function normalizePath(pathText: string, baseDir: string): string {
  const raw = pathText.trim();
  if (!raw) {
    throw new ValidationError("路径为空", "请选择或输入一个有效目录");
  }

  const expanded = raw.replace(/%([^%]+)%/g, (_match, envName: string) => process.env[envName] ?? "");
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(baseDir, expanded);
}

export function validateFqbn(fqbn: string): void {
  const value = fqbn.trim();
  if (!value) {
    throw new ValidationError("FQBN 不能为空", "例如：esp32:esp32:esp32s3 或 arduino:avr:uno");
  }
  if ((value.match(/:/g) ?? []).length < 2) {
    throw new ValidationError("FQBN 格式不正确", "格式通常为 vendor:arch:board，例如 esp32:esp32:esp32s3");
  }
}

export function isUsbPort(portInfo: SerialPortInfo): boolean {
  return [portInfo.label, portInfo.protocol, portInfo.type].join(" ").toUpperCase().includes("USB");
}

export function recommendSerialPort(
  ports: SerialPortInfo[],
  savedPort: string,
  autoSelect: boolean
): string {
  if (ports.length === 0) {
    return "";
  }

  const saved = savedPort.trim();
  const usbPorts = ports.filter(isUsbPort);
  const savedEntry = ports.find((entry) => entry.address === saved);
  const savedUsbEntry = usbPorts.find((entry) => entry.address === saved);

  if (autoSelect) {
    return (
      savedUsbEntry?.address ??
      usbPorts[0]?.address ??
      savedEntry?.address ??
      ports[0]?.address ??
      ""
    );
  }

  return savedEntry?.address ?? usbPorts[0]?.address ?? ports[0]?.address ?? "";
}

export function buildCompileArgs(opts: {
  fqbn: string;
  sketchPath: string;
  outputDir?: string;
  extraArgs?: string[];
}): string[] {
  validateFqbn(opts.fqbn);
  if (!opts.sketchPath.trim()) {
    throw new ValidationError("草图路径为空", "请确保工作区根目录包含 Arduino 草图");
  }
  const args = ["compile", "--fqbn", opts.fqbn.trim()];
  if (opts.outputDir?.trim()) {
    args.push("--output-dir", opts.outputDir.trim());
  }
  if (opts.extraArgs && opts.extraArgs.length > 0) {
    args.push(...opts.extraArgs);
  }
  args.push(opts.sketchPath.trim());
  return args;
}

export function buildUploadArgs(opts: {
  port: string;
  fqbn: string;
  sketchPath: string;
}): string[] {
  const port = normalizeSerialAddress(opts.port);
  if (!port) {
    throw new ValidationError("串口未选择", "请先选择串口端口");
  }
  validateFqbn(opts.fqbn);
  if (!opts.sketchPath.trim()) {
    throw new ValidationError("草图路径为空", "请确保工作区根目录包含 Arduino 草图");
  }
  return ["upload", "-p", port, "--fqbn", opts.fqbn.trim(), opts.sketchPath.trim()];
}

export function buildMonitorArgs(opts: {
  port: string;
  fqbn?: string;
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: string;
}): string[] {
  const args = ["monitor", "-p", opts.port];
  if (opts.fqbn) {
    args.push("--fqbn", opts.fqbn);
  }
  const configs: string[] = [];
  if (opts.baudRate && opts.baudRate > 0) {
    configs.push(`baudrate=${opts.baudRate}`);
  }
  if (opts.dataBits && [5, 6, 7, 8].includes(opts.dataBits)) {
    configs.push(`bits=${opts.dataBits}`);
  }
  if (opts.stopBits && [1, 1.5, 2].includes(opts.stopBits)) {
    configs.push(`stop_bits=${opts.stopBits}`);
  }
  if (opts.parity && opts.parity.toLowerCase() !== "none") {
    configs.push(`parity=${opts.parity.toLowerCase()}`);
  }
  for (const cfg of configs) {
    args.push("--config", cfg);
  }
  return args;
}

export async function execFileText(command: string, args: string[], timeoutMs = 10000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = execFile(command, args, { encoding: "utf8", windowsHide: true }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ stdout, stderr, exitCode: 0 });
        return;
      }

      const exitCode = typeof error.code === "number" ? error.code : 1;
      resolve({ stdout: stdout ?? "", stderr: stderr ?? error.message, exitCode });
    });

    if (timeoutMs > 0) {
      const timer = setTimeout(() => {
        child.kill();
        resolve({ stdout: "", stderr: `Command timed out after ${timeoutMs}ms`, exitCode: 1 });
      }, timeoutMs);

      child.on("exit", () => {
        clearTimeout(timer);
      });
    }
  });
}

export function normalizeSerialAddress(address: string): string {
  const text = address.trim();
  return /^com\d+$/i.test(text) ? text.toUpperCase() : text;
}

export function mapJsonPortEntry(entry: unknown): SerialPortInfo | undefined {
  if (typeof entry === "string") {
    const address = normalizeSerialAddress(entry);
    return address ? { address, label: "", protocol: "", type: "" } : undefined;
  }

  if (!entry || typeof entry !== "object") {
    return undefined;
  }

  const maybePort = "port" in entry && entry.port && typeof entry.port === "object" ? entry.port as Record<string, unknown> : undefined;
  const source = maybePort ?? entry as Record<string, unknown>;
  const address = normalizeSerialAddress(String(source.address ?? ""));
  if (!address) {
    return undefined;
  }

  return {
    address,
    label: String(source.label ?? ""),
    protocol: String(source.protocol ?? ""),
    type: String(source.protocol_label ?? source.type ?? "")
  };
}

export async function listSerialPorts(arduinoCliPath = "arduino-cli"): Promise<SerialPortInfo[]> {
  const jsonResult = await execFileText(arduinoCliPath, ["board", "list", "--format", "json"]);
  if (jsonResult.exitCode === 0) {
    try {
      const raw = JSON.parse(jsonResult.stdout || "[]") as unknown;
      const listSource = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { detected_ports?: unknown[] }).detected_ports)
          ? (raw as { detected_ports: unknown[] }).detected_ports
          : Array.isArray((raw as { ports?: unknown[] }).ports)
            ? (raw as { ports: unknown[] }).ports
            : Array.isArray((raw as { result?: unknown[] }).result)
              ? (raw as { result: unknown[] }).result
              : [];
      return listSource
        .map((item) => mapJsonPortEntry(item))
        .filter((item): item is SerialPortInfo => Boolean(item));
    } catch {
      // Fall through to text mode.
    }
  }

  const textResult = await execFileText(arduinoCliPath, ["board", "list"]);
  if (textResult.exitCode !== 0) {
    return [];
  }

  const ports: SerialPortInfo[] = [];
  for (const line of textResult.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || (/^port/i.test(trimmed) && /protocol/i.test(trimmed))) {
      continue;
    }

    const comMatch = trimmed.match(/\b(COM\d+)\b/i);
    if (comMatch) {
      ports.push({
        address: comMatch[1].toUpperCase(),
        label: trimmed,
        protocol: "",
        type: ""
      });
      continue;
    }

    const posixMatch = trimmed.match(/(\/dev\/\S+)/);
    if (posixMatch) {
      ports.push({
        address: posixMatch[1],
        label: trimmed,
        protocol: "",
        type: ""
      });
    }
  }

  return ports;
}

function migrateConfig(data: unknown): ArduFluxConfig {
  const defaults = createDefaultConfig();
  if (!data || typeof data !== "object") {
    return defaults;
  }

  const source = data as Partial<ArduFluxConfig> & Record<string, unknown>;
  const version = Number(source.schemaVersion ?? 0);

  if (version <= 0) {
    return {
      ...defaults,
      current: {
        ...defaults.current,
        ...(source as Partial<ArduFluxCurrentConfig>)
      }
    };
  }

  if (version !== 1) {
    throw new ValidationError("不支持的配置版本", `schemaVersion=${version}，请升级扩展或重新生成配置文件`);
  }

  const current = source.current && typeof source.current === "object" ? source.current as Partial<ArduFluxCurrentConfig> : {};
  const profiles = source.profiles && typeof source.profiles === "object" ? source.profiles as ArduFluxConfig["profiles"] : { default: {} };

  const board = { ...defaults.current.board, ...(current.board ?? {}) };
  const pinDefines = current.board?.pinDefines;
  if (!pinDefines || (typeof pinDefines === "object" && !Array.isArray(pinDefines) && Object.keys(pinDefines).length === 0)) {
    board.pinDefines = defaults.current.board.pinDefines;
  }

  return {
    schemaVersion: 1,
    current: {
      board,
      port: {
        ...defaults.current.port,
        ...(current.port ?? {})
      },
      build: {
        ...defaults.current.build,
        ...(current.build ?? {})
      },
      monitor: {
        ...defaults.current.monitor,
        ...(current.monitor ?? {})
      }
    },
    profiles: {
      default: {},
      ...profiles
    }
  };
}

export class ConfigStore {
  readonly baseDir: string;
  readonly configPath: string;
  readonly arduinoCliPath: string;
  private data: ArduFluxConfig;
  private serialPortsCache: { ports: SerialPortInfo[]; timestamp: number } | null = null;
  private readonly SERIAL_PORTS_CACHE_TTL = 5000;

  constructor(baseDir: string, arduinoCliPath = "arduino-cli") {
    this.baseDir = baseDir;
    this.configPath = path.join(baseDir, CONFIG_FILE_NAME);
    this.arduinoCliPath = arduinoCliPath;
    this.data = createDefaultConfig();
  }

  async getSerialPorts(): Promise<SerialPortInfo[]> {
    const now = Date.now();
    if (this.serialPortsCache && now - this.serialPortsCache.timestamp < this.SERIAL_PORTS_CACHE_TTL) {
      return this.serialPortsCache.ports;
    }
    const ports = await listSerialPorts(this.arduinoCliPath);
    this.serialPortsCache = { ports, timestamp: now };
    return ports;
  }

  clearSerialPortsCache(): void {
    this.serialPortsCache = null;
  }

  async load(): Promise<ArduFluxConfig> {
    try {
      const text = (await fs.readFile(this.configPath, "utf8")).replace(/^\uFEFF/, "");
      this.data = migrateConfig(JSON.parse(text));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        this.data = createDefaultConfig();
      } else {
        throw error;
      }
    }
    return deepClone(this.data);
  }

  async save(): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(this.data, null, 2), "utf8");
  }

  getData(): ArduFluxConfig {
    return deepClone(this.data);
  }

  setData(data: ArduFluxConfig): void {
    this.data = migrateConfig(data);
  }

  async validateAll(candidate = this.data.current): Promise<void> {
    this.validateBoard(candidate.board);
    await this.validatePort(candidate.port);
    await this.validateBuild(candidate.build);
    this.validateMonitor(candidate.monitor);
  }

  validateBoard(board = this.data.current.board): void {
    validateFqbn(String(board.fqbn ?? ""));
  }

  async validatePort(portState = this.data.current.port): Promise<void> {
    const address = normalizeSerialAddress(String(portState.address ?? ""));
    if (!address) {
      throw new ValidationError("串口为空", "请刷新串口列表并选择一个端口，例如 COM36 或 /dev/ttyACM0");
    }

    const ports = await listSerialPorts(this.arduinoCliPath);
    const known = new Set(ports.map((item) => item.address));
    if (known.size > 0 && !known.has(address)) {
      throw new ValidationError("串口不存在或不可用", "点击“刷新串口列表”重新枚举串口，或检查 USB 连接/驱动");
    }
  }

  async validateBuild(buildState = this.data.current.build): Promise<void> {
    const outputDir = String(buildState.outputDir ?? "").trim();
    if (!outputDir) {
      return;
    }

    const resolved = normalizePath(outputDir, this.baseDir);
    try {
      await fs.mkdir(resolved, { recursive: true });
    } catch {
      throw new ValidationError("输出目录不可写", "请选择一个有写权限的目录，或更换到项目内的 build 目录");
    }
  }

  validateMonitor(monitor = this.data.current.monitor): void {
    if (!monitor.enabled) {
      return;
    }

    if (Number(monitor.baudRate) <= 0) {
      throw new ValidationError("波特率不正确", "设置为常见值，例如 115200");
    }
    if (![5, 6, 7, 8].includes(Number(monitor.dataBits))) {
      throw new ValidationError("数据位不正确", "可选：5/6/7/8");
    }
    if (![1, 1.5, 2].includes(Number(monitor.stopBits))) {
      throw new ValidationError("停止位不正确", "可选：1/1.5/2");
    }

    const parity = String(monitor.parity ?? "none").toLowerCase();
    if (!["none", "odd", "even", "mark", "space"].includes(parity)) {
      throw new ValidationError("校验位不正确", "可选：none/odd/even/mark/space");
    }

    const newline = String(monitor.newline ?? "CRLF").toUpperCase();
    if (!["CRLF", "LF", "CR"].includes(newline)) {
      throw new ValidationError("换行符不正确", "可选：CRLF/LF/CR");
    }
  }

  setOutputDir(outputDir: string): void {
    const current = this.data.current.build;
    const resolved = normalizePath(outputDir, this.baseDir);
    current.outputDir = outputDir.trim();
    current.recentOutputDirs = dedupeKeepLatest([...current.recentOutputDirs, resolved], 5);
  }

  saveProfile(name: string): void {
    const profileName = name.trim();
    if (!profileName) {
      throw new ValidationError("Profile 名称不能为空", "请输入一个 Profile 名称，例如 default/dev/prod");
    }
    this.data.profiles[profileName] = deepClone(this.data.current);
  }

  applyProfile(name: string): void {
    const profile = this.data.profiles[name];
    if (!profile || typeof profile !== "object") {
      throw new ValidationError("Profile 不存在", "请先保存 Profile，或从文件导入 Profile");
    }

    this.data.current = migrateConfig({
      schemaVersion: 1,
      current: profile,
      profiles: this.data.profiles
    }).current;
  }

  deleteProfile(name: string): void {
    delete this.data.profiles[name];
    if (Object.keys(this.data.profiles).length === 0) {
      this.data.profiles.default = {};
    }
  }

  async exportProfiles(targetPath: string): Promise<void> {
    const resolved = normalizePath(targetPath, this.baseDir);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(
      resolved,
      JSON.stringify({ schemaVersion: this.data.schemaVersion, profiles: this.data.profiles }, null, 2),
      "utf8"
    );
  }

  async importProfiles(sourcePath: string, merge: boolean): Promise<void> {
    const resolved = normalizePath(sourcePath, this.baseDir);
    const text = await fs.readFile(resolved, "utf8");
    const parsed = JSON.parse(text) as { profiles?: ArduFluxConfig["profiles"] };

    if (!parsed.profiles || typeof parsed.profiles !== "object") {
      throw new ValidationError("导入文件格式不正确", "应包含 profiles 字段");
    }

    this.data.profiles = merge
      ? { ...this.data.profiles, ...parsed.profiles }
      : { ...parsed.profiles };
  }
}
