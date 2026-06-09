import { ChildProcess } from "child_process";
import { buildCompileArgs, execFileText } from "../configStore";
import { ArduFluxCurrentConfig } from "../types";
import { compileWithWsl } from "./wslCompile";

export interface CompileBackendDeps {
  spawn(command: string, args: string[], options?: { cwd?: string; shell?: boolean }): ChildProcess;
  executor?(command: string, args: string[], timeoutMs?: number): Promise<{ stdout: string; stderr: string; exitCode: number }>;
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
      reject(new Error(`Command exited with code ${code ?? "unknown"}`));
    });
    proc.on("error", reject);
  });
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
  return compileWithWsl({
    workspaceRoot: request.workspaceRoot,
    sketchPath: request.sketchPath,
    config: request.config,
    deps: {
      spawn: request.deps.spawn,
      executor: request.deps.executor ?? execFileText
    },
    write: request.write
  });
}

export function compileSketchWithBackend(request: CompileRequest): Promise<CompileResult> {
  return request.config.wsl.enabled ? compileWsl(request) : compileLocal(request);
}
