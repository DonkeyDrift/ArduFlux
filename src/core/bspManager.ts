import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "child_process";
import { ValidationError, validateCliArgs } from "../configStore";

export const UNIHIKER_BSP_URL = "https://downloadcd.dfrobot.com.cn/UNIHIKER/package_unihiker_index.json";
export const UNIHIKER_CORE = "UNIHIKER:esp32";
export const UNIHIKER_K10_FQBN = "UNIHIKER:esp32:unihiker_k10";

export type BspInstallBackend = "local" | "wsl";
export type BspInstallPhase = "starting" | "update-index" | "install-core" | "completed" | "failed";

export interface BspInstallProgress {
  phase: BspInstallPhase;
  percent: number;
  bar: string;
  message: string;
}

export interface InstallUnihikerBspOptions {
  backend: BspInstallBackend;
  arduinoCliPath: string;
  cwd: string;
  distro?: string;
  spawn?: typeof nodeSpawn;
  onProgress?: (progress: BspInstallProgress) => void;
  onOutput?: (line: string) => void;
}

interface RunCommandOptions {
  command: string;
  args: string[];
  cwd: string;
  spawn: typeof nodeSpawn;
  phase: Exclude<BspInstallPhase, "starting" | "completed" | "failed">;
  fallbackPercent: number;
  onProgress?: (progress: BspInstallProgress) => void;
  onOutput?: (line: string) => void;
}

export function buildCoreUpdateIndexArgs(url: string): string[] {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new ValidationError("BSP URL 不能为空");
  }
  const args = ["core", "update-index", "--additional-urls", trimmedUrl];
  validateCliArgs(args);
  return args;
}

export function buildCoreInstallArgs(core: string, url: string): string[] {
  const trimmedCore = core.trim();
  const trimmedUrl = url.trim();
  if (!trimmedCore) {
    throw new ValidationError("开发板核心名称不能为空");
  }
  if (!trimmedUrl) {
    throw new ValidationError("BSP URL 不能为空");
  }
  const args = ["core", "install", trimmedCore, "--additional-urls", trimmedUrl];
  validateCliArgs(args);
  return args;
}

export function formatProgressBar(percent: number, width = 10): string {
  const normalized = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.floor((normalized / 100) * width);
  return `[${"=".repeat(filled)}${" ".repeat(width - filled)}]${normalized}%`;
}

export function parseArduinoCliProgress(text: string): number | undefined {
  const matches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*%/g));
  const last = matches[matches.length - 1];
  if (!last) {
    return undefined;
  }
  return Math.max(0, Math.min(100, Math.round(Number(last[1]))));
}

export async function installUnihikerBsp(options: InstallUnihikerBspOptions): Promise<void> {
  const spawnImpl = options.spawn ?? nodeSpawn;
  const arduinoCliPath = options.arduinoCliPath.trim() || "arduino-cli";
  const updateArgs = buildCoreUpdateIndexArgs(UNIHIKER_BSP_URL);
  const installArgs = buildCoreInstallArgs(UNIHIKER_CORE, UNIHIKER_BSP_URL);

  emitProgress(options.onProgress, "starting", 0, "准备安装 UNIHIKER BSP");

  try {
    await runBspCommand({
      command: buildCommand(options.backend, options.distro, arduinoCliPath).command,
      args: buildCommand(options.backend, options.distro, arduinoCliPath, updateArgs).args,
      cwd: options.cwd,
      spawn: spawnImpl,
      phase: "update-index",
      fallbackPercent: 10,
      onProgress: options.onProgress,
      onOutput: options.onOutput,
    }, "更新 UNIHIKER BSP 索引失败");

    emitProgress(options.onProgress, "update-index", 30, "UNIHIKER BSP 索引已更新");

    await runBspCommand({
      command: buildCommand(options.backend, options.distro, arduinoCliPath).command,
      args: buildCommand(options.backend, options.distro, arduinoCliPath, installArgs).args,
      cwd: options.cwd,
      spawn: spawnImpl,
      phase: "install-core",
      fallbackPercent: 40,
      onProgress: options.onProgress,
      onOutput: options.onOutput,
    }, "安装 UNIHIKER 开发板核心失败");

    emitProgress(options.onProgress, "completed", 100, "UNIHIKER BSP 安装完成");
  } catch (error) {
    emitProgress(options.onProgress, "failed", 0, "UNIHIKER BSP 安装失败");
    throw error;
  }
}

function buildCommand(
  backend: BspInstallBackend,
  distro: string | undefined,
  arduinoCliPath: string,
  arduinoArgs: string[] = []
): { command: string; args: string[] } {
  if (backend === "local") {
    return { command: arduinoCliPath, args: arduinoArgs };
  }

  const distroArgs = distro?.trim() ? ["-d", distro.trim()] : [];
  return {
    command: "wsl.exe",
    args: [...distroArgs, "--", arduinoCliPath, ...arduinoArgs],
  };
}

function runBspCommand(options: RunCommandOptions, failureMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const outputLines: string[] = [];
    const proc = options.spawn(options.command, options.args, {
      cwd: options.cwd,
      windowsHide: true,
      shell: false,
    } as SpawnOptions);

    if (!proc) {
      reject(new ValidationError(`${failureMessage}: 无法启动 arduino-cli`));
      return;
    }

    emitProgress(options.onProgress, options.phase, options.fallbackPercent, phaseMessage(options.phase));

    const handleData = (data: Buffer): void => {
      const text = data.toString();
      for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
        outputLines.push(line);
        options.onOutput?.(line);
      }
      const percent = parseArduinoCliProgress(text);
      if (percent !== undefined) {
        emitProgress(options.onProgress, options.phase, percent, phaseMessage(options.phase));
      }
    };

    proc.stdout?.on("data", handleData);
    proc.stderr?.on("data", handleData);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new ValidationError(`${failureMessage}，退出码: ${code ?? "unknown"}${formatOutputTail(outputLines)}`));
    });
    proc.on("error", (error) => {
      reject(new ValidationError(`${failureMessage}: ${error.message}`));
    });
  });
}

function emitProgress(
  onProgress: ((progress: BspInstallProgress) => void) | undefined,
  phase: BspInstallPhase,
  percent: number,
  message: string
): void {
  onProgress?.({
    phase,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    bar: formatProgressBar(percent),
    message,
  });
}

function phaseMessage(phase: BspInstallPhase): string {
  switch (phase) {
    case "update-index":
      return "正在更新 UNIHIKER BSP 索引";
    case "install-core":
      return `正在安装 ${UNIHIKER_CORE}`;
    case "completed":
      return "UNIHIKER BSP 安装完成";
    case "failed":
      return "UNIHIKER BSP 安装失败";
    default:
      return "准备安装 UNIHIKER BSP";
  }
}

function formatOutputTail(lines: string[]): string {
  const tail = lines.slice(-3).join("\n");
  return tail ? `\n${tail}` : "";
}
