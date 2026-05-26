import { ChildProcess } from "child_process";
import * as path from "path";
import { buildCompileArgs, ValidationError } from "../configStore";
import { ArduFluxCurrentConfig } from "../types";
import {
  buildWslCommandArgs,
  joinWslPath,
  parseSyncExcludes,
  resolveWslWorkspaceRoot,
  toPosixRelativePath,
  toWslMountPath
} from "./wslPath";

export interface CompileBackendDeps {
  spawn(command: string, args: string[], options?: { cwd?: string; shell?: boolean }): ChildProcess;
}

export interface CompileRequest {
  workspaceRoot: string;
  sketchPath: string;
  config: ArduFluxCurrentConfig;
  deps: CompileBackendDeps;
  write: (text: string) => void;
}

export interface CompileResult {
  backend: "local" | "wsl";
  artifactOutputDir?: string;
  wslDistro?: string;
  wslWorkspace?: string;
}

function spawnWithOutput(
  deps: CompileBackendDeps,
  command: string,
  args: string[],
  cwd: string,
  write: (text: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = deps.spawn(command, args, { cwd, shell: false });

    proc.stdout?.on("data", (data: Buffer) => {
      write(data.toString().replace(/\n/g, "\r\n"));
    });
    proc.stderr?.on("data", (data: Buffer) => {
      write(data.toString().replace(/\n/g, "\r\n"));
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const label = args.includes("compile") ? "compile" : args.find((arg) => arg !== "--" && arg !== "-d") ?? command;
      reject(new Error(`${label} exited with code ${code ?? "unknown"}`));
    });
    proc.on("error", reject);
  });
}

function resolveArtifactOutputDir(workspaceRoot: string, outputDir: string): string | undefined {
  const trimmed = outputDir.trim();
  if (!trimmed) {
    return undefined;
  }
  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(workspaceRoot, trimmed);
}

async function compileLocal(request: CompileRequest): Promise<CompileResult> {
  const args = buildCompileArgs(
    {
      fqbn: request.config.board.fqbn,
      sketchPath: request.sketchPath,
      outputDir: request.config.build.outputDir,
      extraArgs: request.config.board.compileArgs
    },
    request.workspaceRoot
  );

  await spawnWithOutput(request.deps, "arduino-cli", args, request.workspaceRoot, request.write);
  return {
    backend: "local",
    artifactOutputDir: request.config.build.outputDir.trim() || undefined
  };
}

async function compileWsl(request: CompileRequest): Promise<CompileResult> {
  const distro = request.config.wsl.distro;
  const cliPath = request.config.wsl.arduinoCliPath.trim() || "arduino-cli";
  const windowsOutputDir = resolveArtifactOutputDir(request.workspaceRoot, request.config.build.outputDir || "build");
  if (!windowsOutputDir) {
    throw new ValidationError("WSL 编译输出目录为空", "请配置 build.outputDir 或使用默认 build 目录");
  }

  const workspaceMountPath = toWslMountPath(request.workspaceRoot);
  const artifactMountPath = toWslMountPath(windowsOutputDir);
  const workspaceRoot = resolveWslWorkspaceRoot(
    request.config.wsl.workspaceRoot,
    "/home/arduflux",
    request.workspaceRoot
  );
  const wslBuildDir = joinWslPath(workspaceRoot, ".arduflux-build");
  const relativeSketch = toPosixRelativePath(path.relative(request.workspaceRoot, request.sketchPath));
  const wslSketchPath = joinWslPath(workspaceRoot, relativeSketch);

  await spawnWithOutput(request.deps, "wsl.exe", buildWslCommandArgs(distro, ["printenv", "HOME"]), request.workspaceRoot, request.write);
  await spawnWithOutput(request.deps, "wsl.exe", buildWslCommandArgs(distro, ["which", "rsync"]), request.workspaceRoot, request.write);
  await spawnWithOutput(request.deps, "wsl.exe", buildWslCommandArgs(distro, [cliPath, "version"]), request.workspaceRoot, request.write);
  await spawnWithOutput(request.deps, "wsl.exe", buildWslCommandArgs(distro, ["mkdir", "-p", workspaceRoot, wslBuildDir]), request.workspaceRoot, request.write);

  const excludes = parseSyncExcludes(request.config.wsl.syncProject.excludes);
  const rsyncArgs = ["rsync", "-a"];
  for (const exclude of excludes) {
    rsyncArgs.push("--exclude", exclude);
  }
  rsyncArgs.push(`${workspaceMountPath}/`, `${workspaceRoot}/`);
  await spawnWithOutput(request.deps, "wsl.exe", buildWslCommandArgs(distro, rsyncArgs), request.workspaceRoot, request.write);

  const compileArgs = buildCompileArgs({
    fqbn: request.config.board.fqbn,
    sketchPath: wslSketchPath,
    outputDir: wslBuildDir,
    extraArgs: request.config.board.compileArgs
  });
  await spawnWithOutput(request.deps, "wsl.exe", buildWslCommandArgs(distro, [cliPath, ...compileArgs]), request.workspaceRoot, request.write);
  await spawnWithOutput(
    request.deps,
    "wsl.exe",
    buildWslCommandArgs(distro, ["rsync", "-a", `${wslBuildDir}/`, `${artifactMountPath}/`]),
    request.workspaceRoot,
    request.write
  );

  return {
    backend: "wsl",
    artifactOutputDir: windowsOutputDir,
    wslDistro: distro.trim() || undefined,
    wslWorkspace: workspaceRoot
  };
}

export function compileSketchWithBackend(request: CompileRequest): Promise<CompileResult> {
  return request.config.wsl.enabled ? compileWsl(request) : compileLocal(request);
}
