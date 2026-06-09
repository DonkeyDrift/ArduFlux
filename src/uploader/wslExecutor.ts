import { execFileText } from "../configStore";
import { buildWslCommandArgs } from "./wslPath";

export { buildWslCommandArgs };

export interface WslCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type WslCommandExecutor = (
  command: string,
  args: string[],
  timeoutMs?: number
) => Promise<WslCommandResult>;

export interface RunWslCommandOptions {
  distro: string;
  commandArgs: string[];
  executor?: WslCommandExecutor;
  timeoutMs?: number;
}

export interface CheckWslEnvironmentOptions {
  distro: string;
  arduinoCliPath: string;
  executor?: WslCommandExecutor;
}

export interface WslEnvironmentStatus {
  ok: boolean;
  home: string;
  arduinoCliPath: string;
  errors: string[];
}

export async function runWslCommand(options: RunWslCommandOptions): Promise<WslCommandResult> {
  const executor = options.executor ?? execFileText;
  return executor("wsl.exe", buildWslCommandArgs(options.distro, options.commandArgs), options.timeoutMs ?? 10000);
}

export async function checkWslEnvironment(options: CheckWslEnvironmentOptions): Promise<WslEnvironmentStatus> {
  const errors: string[] = [];
  const executor = options.executor ?? execFileText;
  const homeResult = await runWslCommand({
    distro: options.distro,
    commandArgs: ["printenv", "HOME"],
    executor,
  });
  const home = homeResult.exitCode === 0 ? (homeResult.stdout.trim() || "/home/arduflux") : "";
  if (!home) {
    errors.push("无法获取 WSL HOME");
  }

  const cliCommand = options.arduinoCliPath.trim() || "arduino-cli";
  const cliResult = await runWslCommand({
    distro: options.distro,
    commandArgs: ["which", cliCommand],
    executor,
  });
  const resolvedCliPath = cliResult.exitCode === 0 ? (cliResult.stdout.trim() || cliCommand) : "";
  if (!resolvedCliPath) {
    errors.push("WSL 中未找到 arduino-cli");
  }

  return {
    ok: errors.length === 0,
    home,
    arduinoCliPath: resolvedCliPath,
    errors,
  };
}
