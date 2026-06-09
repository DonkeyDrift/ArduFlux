import * as path from "path";
import { ValidationError } from "../configStore";
import { ArduFluxCurrentConfig } from "../types";
import { buildWslCommandArgs, parseSyncExcludes, resolveWslWorkspaceRoot, toWslMountPath } from "./wslPath";
import { WslCommandExecutor } from "./wslExecutor";

export interface SyncWslProjectOptions {
  workspaceRoot: string;
  wslHome: string;
  config: ArduFluxCurrentConfig;
  executor?: WslCommandExecutor;
  timeoutMs?: number;
  write?: (text: string) => void;
}

export interface SyncWslProjectResult {
  sourceMountPath: string;
  workspaceRoot: string;
  excludes: string[];
}

const DEFAULT_EXCLUDES = [".vscode", ".trae"];

export async function syncProjectToWsl(options: SyncWslProjectOptions): Promise<SyncWslProjectResult> {
  const executor = options.executor ?? defaultExecutor;
  const sourceMountPath = toWslMountPath(options.workspaceRoot);
  const workspaceRoot = resolveWslWorkspaceRoot(
    options.config.wsl.workspaceRoot,
    options.wslHome,
    options.workspaceRoot
  );
  const excludes = buildExcludes(options.workspaceRoot, options.config);

  options.write?.("Preparing WSL workspace...\r\n");
  const mkdirResult = await executor(
    "wsl.exe",
    buildWslCommandArgs(options.config.wsl.distro, ["mkdir", "-p", workspaceRoot]),
    options.timeoutMs
  );
  if (mkdirResult.exitCode !== 0) {
    throw new ValidationError("创建 WSL 工作目录失败", mkdirResult.stderr || mkdirResult.stdout);
  }

  const rsyncArgs = ["rsync", "-a"];
  for (const exclude of excludes) {
    rsyncArgs.push("--exclude", exclude);
  }
  rsyncArgs.push(`${sourceMountPath}/`, `${workspaceRoot}/`);

  options.write?.("Syncing project to WSL workspace...\r\n");
  const syncResult = await executor(
    "wsl.exe",
    buildWslCommandArgs(options.config.wsl.distro, rsyncArgs),
    options.timeoutMs
  );
  if (syncResult.exitCode !== 0) {
    throw new ValidationError("同步项目到 WSL 失败", syncResult.stderr || syncResult.stdout);
  }

  options.write?.("Project synced to WSL workspace.\r\n");
  return { sourceMountPath, workspaceRoot, excludes };
}

function buildExcludes(workspaceRoot: string, config: ArduFluxCurrentConfig): string[] {
  const values = [...config.wsl.syncProject.excludes];
  const outputDir = config.build.outputDir.trim();
  if (outputDir) {
    const absoluteOutput = path.isAbsolute(outputDir) ? path.normalize(outputDir) : path.resolve(workspaceRoot, outputDir);
    const relativeOutput = path.relative(workspaceRoot, absoluteOutput);
    if (relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput)) {
      values.push(relativeOutput.replace(/\\/g, "/"));
    }
  }
  values.push(...DEFAULT_EXCLUDES);
  return parseSyncExcludes(values);
}

const defaultExecutor: WslCommandExecutor = async () => {
  throw new ValidationError("缺少 WSL 命令执行器");
};
