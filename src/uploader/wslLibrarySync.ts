import { ValidationError } from "../configStore";
import { ArduFluxCurrentConfig } from "../types";
import { buildWslCommandArgs, joinWslPath, parseSyncExcludes, toWslMountPath } from "./wslPath";
import { WslCommandExecutor } from "./wslExecutor";

export interface SyncWslLibrariesOptions {
  distro: string;
  wslHome: string;
  config: ArduFluxCurrentConfig;
  executor?: WslCommandExecutor;
  timeoutMs?: number;
  write?: (text: string) => void;
}

export interface SyncWslLibrariesResult {
  skipped: boolean;
  reason?: string;
  sourceMountPath?: string;
  targetPath?: string;
}

export async function syncLibrariesToWsl(options: SyncWslLibrariesOptions): Promise<SyncWslLibrariesResult> {
  const settings = options.config.wsl.syncLibraries;
  if (!settings.enabled) {
    return { skipped: true, reason: "disabled" };
  }
  if (!settings.windowsPath.trim()) {
    throw new ValidationError("Windows libraries 路径为空");
  }
  if (!settings.wslPath.trim()) {
    throw new ValidationError("WSL libraries 路径为空");
  }

  const executor = options.executor ?? defaultExecutor;
  const sourceMountPath = toWslMountPath(settings.windowsPath);
  const targetPath = resolveWslLibraryPath(settings.wslPath, options.wslHome);

  const mkdirResult = await executor("wsl.exe", buildWslCommandArgs(options.distro, ["mkdir", "-p", targetPath]), options.timeoutMs);
  if (mkdirResult.exitCode !== 0) {
    throw new ValidationError("创建 WSL libraries 目录失败", mkdirResult.stderr || mkdirResult.stdout);
  }

  if (settings.backup) {
    const backupResult = await executor(
      "wsl.exe",
      buildWslCommandArgs(options.distro, ["cp", "-a", targetPath, `${targetPath}.backup`]),
      options.timeoutMs
    );
    if (backupResult.exitCode !== 0) {
      throw new ValidationError("备份 WSL libraries 失败", backupResult.stderr || backupResult.stdout);
    }
  }

  const rsyncArgs = ["rsync", "-a"];
  if (settings.mode === "copy-missing") {
    rsyncArgs.push("--ignore-existing");
  }
  if (settings.mode === "mirror") {
    rsyncArgs.push("--delete");
  }
  for (const exclude of parseSyncExcludes(settings.excludes)) {
    rsyncArgs.push("--exclude", exclude);
  }
  rsyncArgs.push(`${sourceMountPath}/`, `${targetPath}/`);

  const syncResult = await executor("wsl.exe", buildWslCommandArgs(options.distro, rsyncArgs), options.timeoutMs);
  if (syncResult.exitCode !== 0) {
    throw new ValidationError("同步 Arduino libraries 到 WSL 失败", syncResult.stderr || syncResult.stdout);
  }

  return { skipped: false, sourceMountPath, targetPath };
}

function resolveWslLibraryPath(configuredPath: string, wslHome: string): string {
  const trimmed = configuredPath.trim().replace(/\\/g, "/");
  if (trimmed.startsWith("~/")) {
    return joinWslPath(wslHome, trimmed.slice(2));
  }
  return trimmed;
}

const defaultExecutor: WslCommandExecutor = async () => {
  throw new ValidationError("缺少 WSL 命令执行器");
};
