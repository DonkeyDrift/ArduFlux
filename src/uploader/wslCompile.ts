import { ChildProcess } from "child_process";
import * as path from "path";
import { buildCompileArgs, ValidationError } from "../configStore";
import { ArduFluxCurrentConfig } from "../types";
import { syncLibrariesToWsl } from "./wslLibrarySync";
import { joinWslPath, toPosixRelativePath, toWslMountPath } from "./wslPath";
import { syncProjectToWsl } from "./wslSync";
import { checkWslEnvironment, WslCommandExecutor } from "./wslExecutor";

export interface WslCompileDeps {
  spawn(command: string, args: string[], options?: { cwd?: string; shell?: boolean }): ChildProcess;
  executor: WslCommandExecutor;
}

export interface WslCompileOptions {
  workspaceRoot: string;
  sketchPath: string;
  config: ArduFluxCurrentConfig;
  deps: WslCompileDeps;
  write: (text: string) => void;
}

export interface WslCompileResult {
  backend: "wsl";
  artifactOutputDir: string;
  wslDistro?: string;
  wslWorkspace: string;
}

export async function compileWithWsl(options: WslCompileOptions): Promise<WslCompileResult> {
  const config = options.config;
  const status = await checkWslEnvironment({
    distro: config.wsl.distro,
    arduinoCliPath: config.wsl.arduinoCliPath,
    executor: options.deps.executor,
  });
  if (!status.ok) {
    throw new ValidationError(`WSL 环境不可用: ${status.errors.join("；")}`);
  }

  await syncLibrariesToWsl({
    distro: config.wsl.distro,
    wslHome: status.home,
    config,
    executor: options.deps.executor,
    write: options.write,
  });

  const syncResult = await syncProjectToWsl({
    workspaceRoot: options.workspaceRoot,
    wslHome: status.home,
    config,
    executor: options.deps.executor,
    write: options.write,
  });

  const wslBuildDir = joinWslPath(syncResult.workspaceRoot, ".arduflux-build");
  const relativeSketch = toPosixRelativePath(path.relative(options.workspaceRoot, options.sketchPath));
  const wslSketchPath = joinWslPath(syncResult.workspaceRoot, relativeSketch);
  const compileArgs = buildCompileArgs({
    fqbn: config.board.fqbn,
    sketchPath: wslSketchPath,
    outputDir: wslBuildDir,
    extraArgs: config.board.compileArgs,
  });

  await spawnWithOutput(
    options.deps.spawn,
    "wsl.exe",
    buildWslArgs(config.wsl.distro, [config.wsl.arduinoCliPath.trim() || "arduino-cli", ...compileArgs]),
    options.workspaceRoot,
    options.write,
    "WSL 编译失败"
  );

  const windowsOutputDir = resolveWindowsOutputDir(options.workspaceRoot, config.build.outputDir || "build");
  if (!isInsideWorkspace(options.workspaceRoot, windowsOutputDir)) {
    return {
      backend: "wsl",
      artifactOutputDir: wslBuildDir,
      wslDistro: config.wsl.distro.trim() || undefined,
      wslWorkspace: syncResult.workspaceRoot,
    };
  }

  const artifactMountPath = toWslMountPath(windowsOutputDir);
  const copyResult = await options.deps.executor(
    "wsl.exe",
    buildWslArgs(config.wsl.distro, ["rsync", "-a", `${wslBuildDir}/`, `${artifactMountPath}/`])
  );
  if (copyResult.exitCode !== 0) {
    throw new ValidationError("WSL 编译产物回传失败", copyResult.stderr || copyResult.stdout);
  }

  return {
    backend: "wsl",
    artifactOutputDir: windowsOutputDir,
    wslDistro: config.wsl.distro.trim() || undefined,
    wslWorkspace: syncResult.workspaceRoot,
  };
}

function spawnWithOutput(
  spawn: WslCompileDeps["spawn"],
  command: string,
  args: string[],
  cwd: string,
  write: (text: string) => void,
  failureMessage: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd, shell: false });
    proc.stdout?.on("data", (data: Buffer) => write(data.toString().replace(/\n/g, "\r\n")));
    proc.stderr?.on("data", (data: Buffer) => write(data.toString().replace(/\n/g, "\r\n")));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new ValidationError(`${failureMessage}，退出码: ${code ?? "unknown"}`));
      }
    });
    proc.on("error", (error) => reject(new ValidationError(`${failureMessage}: ${error.message}`)));
  });
}

function buildWslArgs(distro: string, commandArgs: string[]): string[] {
  const trimmedDistro = distro.trim();
  return trimmedDistro ? ["-d", trimmedDistro, "--", ...commandArgs] : ["--", ...commandArgs];
}

function resolveWindowsOutputDir(workspaceRoot: string, outputDir: string): string {
  return path.isAbsolute(outputDir) ? path.normalize(outputDir) : path.resolve(workspaceRoot, outputDir);
}

function isInsideWorkspace(workspaceRoot: string, candidate: string): boolean {
  const relative = path.relative(workspaceRoot, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
