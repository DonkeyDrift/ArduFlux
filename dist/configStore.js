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
exports.ConfigStore = exports.ValidationError = void 0;
exports.deepClone = deepClone;
exports.dedupeKeepLatest = dedupeKeepLatest;
exports.normalizePath = normalizePath;
exports.validateFqbn = validateFqbn;
exports.isUsbPort = isUsbPort;
exports.recommendSerialPort = recommendSerialPort;
exports.buildMonitorArgs = buildMonitorArgs;
exports.execFileText = execFileText;
exports.normalizeSerialAddress = normalizeSerialAddress;
exports.mapJsonPortEntry = mapJsonPortEntry;
exports.listSerialPorts = listSerialPorts;
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const types_1 = require("./types");
class ValidationError extends Error {
    constructor(message, suggestion) {
        super(message);
        this.name = "ValidationError";
        this.suggestion = suggestion;
    }
}
exports.ValidationError = ValidationError;
function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}
function dedupeKeepLatest(items, limit) {
    const seen = new Set();
    const out = [];
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
function normalizePath(pathText, baseDir) {
    const raw = pathText.trim();
    if (!raw) {
        throw new ValidationError("路径为空", "请选择或输入一个有效目录");
    }
    const expanded = raw.replace(/%([^%]+)%/g, (_match, envName) => process.env[envName] ?? "");
    return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(baseDir, expanded);
}
function validateFqbn(fqbn) {
    const value = fqbn.trim();
    if (!value) {
        throw new ValidationError("FQBN 不能为空", "例如：esp32:esp32:esp32s3 或 arduino:avr:uno");
    }
    if ((value.match(/:/g) ?? []).length < 2) {
        throw new ValidationError("FQBN 格式不正确", "格式通常为 vendor:arch:board，例如 esp32:esp32:esp32s3");
    }
}
function isUsbPort(portInfo) {
    return [portInfo.label, portInfo.protocol, portInfo.type].join(" ").toUpperCase().includes("USB");
}
function recommendSerialPort(ports, savedPort, autoSelect) {
    if (ports.length === 0) {
        return "";
    }
    const saved = savedPort.trim();
    const usbPorts = ports.filter(isUsbPort);
    const savedEntry = ports.find((entry) => entry.address === saved);
    const savedUsbEntry = usbPorts.find((entry) => entry.address === saved);
    if (autoSelect) {
        return (savedUsbEntry?.address ??
            usbPorts[0]?.address ??
            savedEntry?.address ??
            ports[0]?.address ??
            "");
    }
    return savedEntry?.address ?? usbPorts[0]?.address ?? ports[0]?.address ?? "";
}
function buildMonitorArgs(opts) {
    const args = ["monitor", "-p", opts.port];
    if (opts.fqbn) {
        args.push("--fqbn", opts.fqbn);
    }
    const configs = [];
    if (opts.baudRate && opts.baudRate > 0) {
        configs.push(`baudrate=${opts.baudRate}`);
    }
    if (opts.dataBits && [5, 6, 7, 8].includes(opts.dataBits)) {
        configs.push(`bits=${opts.dataBits}`);
    }
    if (opts.stopBits && [1, 1.5, 2].includes(opts.stopBits)) {
        configs.push(`stopbits=${opts.stopBits}`);
    }
    if (opts.parity && opts.parity.toLowerCase() !== "none") {
        configs.push(`parity=${opts.parity.toLowerCase()}`);
    }
    for (const cfg of configs) {
        args.push("--config", cfg);
    }
    return args;
}
async function execFileText(command, args) {
    return new Promise((resolve) => {
        (0, child_process_1.execFile)(command, args, { encoding: "utf8", windowsHide: true }, (error, stdout, stderr) => {
            if (!error) {
                resolve({ stdout, stderr, exitCode: 0 });
                return;
            }
            const exitCode = typeof error.code === "number" ? error.code : 1;
            resolve({ stdout: stdout ?? "", stderr: stderr ?? error.message, exitCode });
        });
    });
}
function normalizeSerialAddress(address) {
    const text = address.trim();
    return /^com\d+$/i.test(text) ? text.toUpperCase() : text;
}
function mapJsonPortEntry(entry) {
    if (typeof entry === "string") {
        const address = normalizeSerialAddress(entry);
        return address ? { address, label: "", protocol: "", type: "" } : undefined;
    }
    if (!entry || typeof entry !== "object") {
        return undefined;
    }
    const maybePort = "port" in entry && entry.port && typeof entry.port === "object" ? entry.port : undefined;
    const source = maybePort ?? entry;
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
async function listSerialPorts(arduinoCliPath = "arduino-cli") {
    const jsonResult = await execFileText(arduinoCliPath, ["board", "list", "--format", "json"]);
    if (jsonResult.exitCode === 0) {
        try {
            const raw = JSON.parse(jsonResult.stdout || "[]");
            const listSource = Array.isArray(raw)
                ? raw
                : Array.isArray(raw.detected_ports)
                    ? raw.detected_ports
                    : Array.isArray(raw.ports)
                        ? raw.ports
                        : Array.isArray(raw.result)
                            ? raw.result
                            : [];
            return listSource
                .map((item) => mapJsonPortEntry(item))
                .filter((item) => Boolean(item));
        }
        catch {
            // Fall through to text mode.
        }
    }
    const textResult = await execFileText(arduinoCliPath, ["board", "list"]);
    if (textResult.exitCode !== 0) {
        return [];
    }
    const ports = [];
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
function migrateConfig(data) {
    const defaults = (0, types_1.createDefaultConfig)();
    if (!data || typeof data !== "object") {
        return defaults;
    }
    const source = data;
    const version = Number(source.schemaVersion ?? 0);
    if (version <= 0) {
        return {
            ...defaults,
            current: {
                ...defaults.current,
                ...source
            }
        };
    }
    if (version !== 1) {
        throw new ValidationError("不支持的配置版本", `schemaVersion=${version}，请升级扩展或重新生成配置文件`);
    }
    const current = source.current && typeof source.current === "object" ? source.current : {};
    const profiles = source.profiles && typeof source.profiles === "object" ? source.profiles : { default: {} };
    return {
        schemaVersion: 1,
        current: {
            board: {
                ...defaults.current.board,
                ...(current.board ?? {})
            },
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
class ConfigStore {
    constructor(baseDir, arduinoCliPath = "arduino-cli") {
        this.baseDir = baseDir;
        this.configPath = path.join(baseDir, types_1.CONFIG_FILE_NAME);
        this.arduinoCliPath = arduinoCliPath;
        this.data = (0, types_1.createDefaultConfig)();
    }
    async load() {
        try {
            const text = await fs_1.promises.readFile(this.configPath, "utf8");
            this.data = migrateConfig(JSON.parse(text));
        }
        catch (error) {
            const code = error.code;
            if (code === "ENOENT") {
                this.data = (0, types_1.createDefaultConfig)();
            }
            else {
                throw error;
            }
        }
        return deepClone(this.data);
    }
    async save() {
        await fs_1.promises.writeFile(this.configPath, JSON.stringify(this.data, null, 2), "utf8");
    }
    getData() {
        return deepClone(this.data);
    }
    setData(data) {
        this.data = migrateConfig(data);
    }
    async validateAll(candidate = this.data.current) {
        this.validateBoard(candidate.board);
        await this.validatePort(candidate.port);
        await this.validateBuild(candidate.build);
        this.validateMonitor(candidate.monitor);
    }
    validateBoard(board = this.data.current.board) {
        validateFqbn(String(board.fqbn ?? ""));
    }
    async validatePort(portState = this.data.current.port) {
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
    async validateBuild(buildState = this.data.current.build) {
        const outputDir = String(buildState.outputDir ?? "").trim();
        if (!outputDir) {
            return;
        }
        const resolved = normalizePath(outputDir, this.baseDir);
        try {
            await fs_1.promises.mkdir(resolved, { recursive: true });
        }
        catch {
            throw new ValidationError("输出目录不可写", "请选择一个有写权限的目录，或更换到项目内的 build 目录");
        }
    }
    validateMonitor(monitor = this.data.current.monitor) {
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
    setOutputDir(outputDir) {
        const current = this.data.current.build;
        const resolved = normalizePath(outputDir, this.baseDir);
        current.outputDir = outputDir.trim();
        current.recentOutputDirs = dedupeKeepLatest([...current.recentOutputDirs, resolved], 5);
    }
    saveProfile(name) {
        const profileName = name.trim();
        if (!profileName) {
            throw new ValidationError("Profile 名称不能为空", "请输入一个 Profile 名称，例如 default/dev/prod");
        }
        this.data.profiles[profileName] = deepClone(this.data.current);
    }
    applyProfile(name) {
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
    deleteProfile(name) {
        delete this.data.profiles[name];
        if (Object.keys(this.data.profiles).length === 0) {
            this.data.profiles.default = {};
        }
    }
    async exportProfiles(targetPath) {
        const resolved = normalizePath(targetPath, this.baseDir);
        await fs_1.promises.mkdir(path.dirname(resolved), { recursive: true });
        await fs_1.promises.writeFile(resolved, JSON.stringify({ schemaVersion: this.data.schemaVersion, profiles: this.data.profiles }, null, 2), "utf8");
    }
    async importProfiles(sourcePath, merge) {
        const resolved = normalizePath(sourcePath, this.baseDir);
        const text = await fs_1.promises.readFile(resolved, "utf8");
        const parsed = JSON.parse(text);
        if (!parsed.profiles || typeof parsed.profiles !== "object") {
            throw new ValidationError("导入文件格式不正确", "应包含 profiles 字段");
        }
        this.data.profiles = merge
            ? { ...this.data.profiles, ...parsed.profiles }
            : { ...parsed.profiles };
    }
}
exports.ConfigStore = ConfigStore;
//# sourceMappingURL=configStore.js.map