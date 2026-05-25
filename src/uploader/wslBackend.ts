import * as path from "path";
import { execFileText } from "../configStore";

export interface WslCommandOptions {
  distro: string;
  command: string[];
}

export interface WslCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  elapsedMs: number;
}

export interface ProjectSyncOptions {
  distro: string;
  sourceWindowsPath: string;
  targetWslPath: string;
  excludes: string[];
}

export interface WslCompileOptions {
  distro: string;
  arduinoCliPath: string;
  fqbn: string;
  sketchWslPath: string;
  buildWslPath: string;
  extraArgs: string[];
}

export interface ArtifactSyncOptions {
  distro: string;
  buildWslPath: string;
  outputWslPath: string;
}

export interface LibrariesSyncOptions {
  distro: string;
  sourceWindowsPath: string;
  targetWslPath: string;
  mode: "copy-missing" | "overwrite" | "mirror";
  backup: boolean;
  excludes: string[];
}

export type WslExec = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export function toWslMountPath(windowsPath: string): string {
  const normalized = path.win32.normalize(windowsPath.trim());
  const match = normalized.match(/^([a-zA-Z]):\\?(.*)$/);
  if (!match) {
    throw new Error(`无法转换为 WSL mount 路径: ${windowsPath}`);
  }

  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, "/");
  return rest ? `/mnt/${drive}/${rest}` : `/mnt/${drive}`;
}

export function createDefaultWslWorkspace(workspaceRoot: string): string {
  const projectName = path.win32.basename(path.win32.normalize(workspaceRoot)).trim().replace(/\s+/g, "-");
  return `$HOME/arduino-build/${projectName || "workspace"}`;
}

export function buildWslCommandArgs(distro: string, command: string[]): string[] {
  const args = distro.trim() ? ["-d", distro.trim(), "--"] : ["--"];
  return [...args, ...command];
}

export async function runWslCommand(
  options: WslCommandOptions,
  exec: WslExec = (command, args) => execFileText(command, args)
): Promise<WslCommandResult> {
  const startedAt = Date.now();
  const result = await exec("wsl.exe", buildWslCommandArgs(options.distro, options.command));
  return {
    ...result,
    elapsedMs: Date.now() - startedAt
  };
}

export function buildRsyncProjectArgs(options: ProjectSyncOptions): string[] {
  const source = `${toWslMountPath(options.sourceWindowsPath).replace(/\/+$/, "")}/`;
  const target = `${options.targetWslPath.replace(/\/+$/, "")}/`;
  const excludes = options.excludes.map((item) => `--exclude=${quoteBash(item)}`).join(" ");
  const script = [
    `mkdir -p ${quoteBash(options.targetWslPath)}`,
    `rsync -a ${excludes} ${quoteBash(source)} ${quoteBash(target)}`.replace(/\s+/g, " ").trim()
  ].join(" && ");

  return buildWslCommandArgs(options.distro, ["bash", "-lc", script]);
}

export function buildWslCompileArgs(options: WslCompileOptions): string[] {
  return buildWslCommandArgs(options.distro, [
    options.arduinoCliPath || "arduino-cli",
    "compile",
    "--fqbn",
    options.fqbn,
    "--build-path",
    options.buildWslPath,
    "--output-dir",
    options.buildWslPath,
    ...options.extraArgs,
    options.sketchWslPath
  ]);
}

export function buildArtifactSyncArgs(options: ArtifactSyncOptions): string[] {
  const script = [
    `mkdir -p ${quoteBash(options.outputWslPath)}`,
    `cp ${quoteBash(options.buildWslPath)}/*.bin ${quoteBash(options.outputWslPath)}/`,
    `cp ${quoteBash(options.buildWslPath)}/*.elf ${quoteBash(options.outputWslPath)}/`
  ].join(" && ");
  return buildWslCommandArgs(options.distro, ["bash", "-lc", script]);
}

export function buildRsyncLibrariesArgs(options: LibrariesSyncOptions): string[] {
  const source = `${toWslMountPath(options.sourceWindowsPath).replace(/\/+$/, "")}/`;
  const target = `${options.targetWslPath.replace(/\/+$/, "")}/`;
  const modeArgs = options.mode === "copy-missing"
    ? ["--ignore-existing"]
    : options.mode === "mirror"
      ? ["--delete"]
      : [];
  const backupDir = `${target.replace(/\/+$/, "")}.backup-${Date.now()}`;
  const backupArgs = options.backup ? ["--backup", `--backup-dir=${quoteBash(backupDir)}`] : [];
  const excludes = options.excludes.map((item) => `--exclude=${quoteBash(item)}`);
  const rsyncArgs = ["rsync", "-a", ...modeArgs, ...backupArgs, ...excludes, quoteBash(source), quoteBash(target)];
  const script = [
    `mkdir -p ${quoteBash(options.targetWslPath)}`,
    rsyncArgs.join(" ")
  ].join(" && ");

  return buildWslCommandArgs(options.distro, ["bash", "-lc", script]);
}

export function joinWslPath(...parts: string[]): string {
  return parts
    .map((part, index) => index === 0 ? part.replace(/\/+$/, "") : part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function quoteBash(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
