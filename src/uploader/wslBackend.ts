import * as path from "path";

export type ExecFileText = (command: string, args: string[], timeoutMs?: number) => Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}>;

export interface WslCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  elapsedMs: number;
}

export function toWslMountPath(windowsPath: string): string {
  const normalized = windowsPath.replace(/\\/g, "/");
  const match = /^([a-zA-Z]):\/(.*)$/.exec(normalized);
  if (!match) {
    throw new Error("无法转换为 WSL mount 路径");
  }

  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

export function createDefaultWslWorkspace(workspaceRoot: string): string {
  const directoryName = path.basename(workspaceRoot).trim().replace(/\s+/g, "-");
  return `$HOME/arduino-build/${directoryName}`;
}

export function buildWslCommandArgs(distro: string, command: string[]): string[] {
  const trimmedDistro = distro.trim();
  return trimmedDistro ? ["-d", trimmedDistro, "--", ...command] : ["--", ...command];
}

export async function runWslCommand(
  options: { distro: string; command: string[]; timeoutMs?: number },
  execFileText: ExecFileText
): Promise<WslCommandResult> {
  const startedAt = Date.now();
  const result = await execFileText("wsl.exe", buildWslCommandArgs(options.distro, options.command), options.timeoutMs);
  return {
    ...result,
    elapsedMs: Date.now() - startedAt,
  };
}

export function buildRsyncProjectArgs(options: {
  distro: string;
  sourceWindowsPath: string;
  targetWslPath: string;
  excludes: string[];
}): string[] {
  const source = quoteShell(`${toWslMountPath(options.sourceWindowsPath)}/`);
  const target = quoteShell(`${options.targetWslPath}/`);
  const excludeArgs = options.excludes.map((item) => `--exclude=${quoteShell(item)}`).join(" ");
  const script = [
    `mkdir -p ${quoteShell(options.targetWslPath)}`,
    ["rsync -a", excludeArgs, source, target].filter(Boolean).join(" "),
  ].join(" && ");

  return buildWslCommandArgs(options.distro, ["bash", "-lc", script]);
}

export function buildRsyncLibrariesArgs(options: {
  distro: string;
  sourceWindowsPath: string;
  targetWslPath: string;
  mode: "copy-missing" | "mirror";
  backup: boolean;
  excludes: string[];
}): string[] {
  const source = quoteShell(`${toWslMountPath(options.sourceWindowsPath)}/`);
  const target = quoteShell(`${options.targetWslPath}/`);
  const flags = ["-a"];
  if (options.mode === "copy-missing") {
    flags.push("--ignore-existing");
  }
  if (options.mode === "mirror") {
    flags.push("--delete");
  }
  if (options.backup) {
    flags.push("--backup", `--backup-dir=${quoteShell(`${options.targetWslPath}/.arduflux-backup`)}`);
  }

  const excludeArgs = options.excludes.map((item) => `--exclude=${quoteShell(item)}`).join(" ");
  const script = [
    `mkdir -p ${quoteShell(options.targetWslPath)}`,
    [`rsync ${flags.join(" ")}`, excludeArgs, source, target].filter(Boolean).join(" "),
  ].join(" && ");

  return buildWslCommandArgs(options.distro, ["bash", "-lc", script]);
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
