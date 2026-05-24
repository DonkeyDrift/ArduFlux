import { spawn as nodeSpawn, SpawnOptions } from "child_process";
import { promises as fsPromises } from "fs";
import * as path from "path";
import {
  execFileText,
  listSerialPorts,
  buildCompileArgs,
  buildUploadArgs,
  buildMonitorArgs,
  isUsbPort,
  discoverSketches,
  ValidationError,
} from "../configStore";
import { releaseSerialPort } from "./portManager";
import {
  parseRequiredLibraries,
  getInstalledLibraries,
  installLibraries,
  resolveMissingLibraries,
} from "./libraryResolver";
import { ArduFluxCurrentConfig, SerialPortInfo } from "../types";

export interface UploaderFlags {
  compile?: boolean;
  upload?: boolean;
  monitor?: boolean;
  sketchPath?: string;
}

export interface UploaderDeps {
  readFile(path: string, encoding: string): Promise<string>;
  execFileText(command: string, args: string[], timeoutMs?: number): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  spawn(command: string, args: string[], options?: { cwd?: string; shell?: boolean }): import("child_process").ChildProcess;
  releaseSerialPort(port: string): Promise<void>;
  listSerialPorts(arduinoCliPath?: string): Promise<SerialPortInfo[]>;
  getInstalledLibraries(arduinoCliPath: string): Promise<string[]>;
  installLibraries(libs: string[], arduinoCliPath: string, cwd: string, onOutput?: (line: string) => void, spawnImpl?: typeof import("child_process").spawn): Promise<void>;
}

export function getUploadCandidates(
  ports: SerialPortInfo[],
  primaryPort: string,
  autoSelect: boolean
): string[] {
  const ordered = new Set<string>();
  if (primaryPort) {
    ordered.add(primaryPort);
  }
  if (autoSelect) {
    for (const port of ports.filter(isUsbPort)) {
      if (port.address !== primaryPort) {
        ordered.add(port.address);
      }
    }
  }
  for (const port of ports) {
    ordered.add(port.address);
  }
  return Array.from(ordered);
}

export class Uploader {
  private readonly deps: UploaderDeps;
  private currentProc: import("child_process").ChildProcess | null = null;
  private aborted = false;

  constructor(deps: Partial<UploaderDeps> = {}) {
    this.deps = {
      readFile: deps.readFile ?? ((p: string, enc: string) => fsPromises.readFile(p, enc as BufferEncoding)),
      execFileText: deps.execFileText ?? execFileText,
      spawn: deps.spawn ?? nodeSpawn,
      releaseSerialPort: deps.releaseSerialPort ?? releaseSerialPort,
      listSerialPorts: deps.listSerialPorts ?? listSerialPorts,
      getInstalledLibraries: deps.getInstalledLibraries ?? getInstalledLibraries,
      installLibraries: deps.installLibraries ?? installLibraries,
    };
  }

  abort(): void {
    this.aborted = true;
    if (this.currentProc && !this.currentProc.killed) {
      this.currentProc.kill();
    }
  }

  async run(options: {
    workspaceRoot: string;
    flags: UploaderFlags;
    config: ArduFluxCurrentConfig;
    write: (text: string) => void;
  }): Promise<{ success: boolean; lastSuccessfulPort?: string }> {
    const { workspaceRoot, flags, config, write } = options;

    const doUpload = flags.upload || (!flags.compile && !flags.upload && !flags.monitor);
    const doMonitor = flags.monitor || (!flags.compile && !flags.upload && !flags.monitor);
    let doCompile = flags.compile || (!flags.compile && !flags.upload && !flags.monitor);

    // 链节联动：上传时自动编译
    if (doUpload && !flags.compile && config.build.compileBeforeUpload) {
      doCompile = true;
    }

    let sketchPath: string | undefined;
    if (doCompile || doUpload) {
      sketchPath = flags.sketchPath ?? config.build.sketchPath ?? "";
      if (!sketchPath) {
        let sketches: string[];
        try {
          sketches = await discoverSketches(workspaceRoot);
        } catch {
          sketches = [];
        }
        if (sketches.length === 0) {
          throw new ValidationError("未找到 .ino 文件", "请在工作区中创建 Arduino 草图文件");
        }
        if (sketches.length > 1) {
          throw new ValidationError(
            `发现多个 .ino 文件 (${sketches.length} 个)`,
            `请指定其中一个：${sketches.join(", ")}`
          );
        }
        sketchPath = sketches[0]!;
      }
      sketchPath = path.resolve(workspaceRoot, sketchPath);
    }

    if (doCompile && sketchPath) {
      write(`\n=== Installing required libraries ===\r\n`);
      await this.installRequiredLibraries(sketchPath, config, write);

      write(`\n=== Compiling sketch ===\r\n`);
      write("Compiling, this may take a minute...\r\n");
      const compileArgs = buildCompileArgs(
        {
          fqbn: config.board.fqbn,
          sketchPath,
          outputDir: config.build.outputDir,
          extraArgs: config.board.compileArgs,
        },
        workspaceRoot
      );
      await this.spawnWithOutput("arduino-cli", compileArgs, workspaceRoot, write);
      write(`Compilation completed.\r\n`);
    }

    let lastSuccessfulPort: string | undefined;

    if (doUpload) {
      const ports = await this.deps.listSerialPorts("arduino-cli");
      const candidates = getUploadCandidates(
        ports,
        config.port.address,
        config.port.auto
      );
      if (candidates.length === 0) {
        throw new ValidationError("没有可用串口", "请检查设备连接");
      }

      write(`\n=== Uploading sketch ===\r\n`);
      write("Uploading to board...\r\n");
      let uploadSuccess = false;
      let retryCount = 0;

      for (const candidatePort of candidates) {
        await this.deps.releaseSerialPort(candidatePort);
        if (candidatePort !== config.port.address && retryCount > 0) {
          write(`Trying alternate port: ${candidatePort}\r\n`);
        }

        const uploadArgs = buildUploadArgs(
          { port: candidatePort, fqbn: config.board.fqbn, sketchPath: sketchPath! },
          workspaceRoot
        );

        try {
          await this.spawnWithOutput("arduino-cli", uploadArgs, workspaceRoot, write);
          uploadSuccess = true;
          lastSuccessfulPort = candidatePort;
          write(`Upload completed on ${candidatePort}.\r\n`);
          break;
        } catch {
          retryCount++;
          if (retryCount < candidates.length) {
            write(`Upload failed on ${candidatePort}, retrying (${retryCount}/${candidates.length})...\r\n`);
          }
        }
      }

      if (!uploadSuccess) {
        write(`Upload failed after ${candidates.length} attempts\r\n`);
        return { success: false };
      }
    }

    if (doMonitor) {
      const preferredPort = lastSuccessfulPort ?? config.port.address;
      const ports = await this.deps.listSerialPorts("arduino-cli");
      const monitorCandidates = getUploadCandidates(ports, preferredPort, config.port.auto);

      if (monitorCandidates.length === 0) {
        write("No serial port selected, skipping monitor.\r\n");
      } else {
        let monitorSuccess = false;
        let monitorRetryCount = 0;
        write(`\n=== Opening serial monitor ===\r\n`);
        write("Press Ctrl+C to exit monitor\r\n");

        for (const candidatePort of monitorCandidates) {
          if (candidatePort !== preferredPort && monitorRetryCount > 0) {
            write(`Trying alternate port: ${candidatePort}\r\n`);
          }
          const monitorArgs = buildMonitorArgs({
            port: candidatePort,
            fqbn: config.board.fqbn,
            baudRate: config.monitor.baudRate,
            dataBits: config.monitor.dataBits,
            stopBits: config.monitor.stopBits,
            parity: config.monitor.parity,
          });
          try {
            await this.spawnWithOutput("arduino-cli", monitorArgs, workspaceRoot, write);
            monitorSuccess = true;
            lastSuccessfulPort = candidatePort;
            break;
          } catch {
            monitorRetryCount++;
            if (monitorRetryCount < monitorCandidates.length) {
              write(`Monitor failed on ${candidatePort}, retrying (${monitorRetryCount}/${monitorCandidates.length})...\r\n`);
            }
          }
        }

        if (!monitorSuccess) {
          write(`Monitor failed after ${monitorCandidates.length} attempts\r\n`);
          if (!doUpload) {
            return { success: false };
          }
        }
      }
    }

    if (this.aborted) {
      return { success: false };
    }

    return { success: true, lastSuccessfulPort };
  }

  private async installRequiredLibraries(
    sketchPath: string,
    config: ArduFluxCurrentConfig,
    write: (text: string) => void
  ): Promise<void> {
    let inoContent: string;
    try {
      inoContent = await this.deps.readFile(sketchPath, "utf8");
    } catch {
      write("Warning: could not read sketch file for library analysis.\r\n");
      return;
    }

    const required = parseRequiredLibraries(inoContent);
    if (required.length === 0) {
      write("No external libraries to install.\r\n");
      return;
    }

    const installed = await this.deps.getInstalledLibraries("arduino-cli");
    const missing = resolveMissingLibraries(required, installed);

    if (missing.length === 0) {
      write("All required libraries already installed.\r\n");
      return;
    }

    for (const lib of missing) {
      write(`Installing library: ${lib}\r\n`);
    }

    await this.deps.installLibraries(missing, "arduino-cli", path.dirname(sketchPath), (line: string) => {
      write(`${line}\r\n`);
    });
  }

  private spawnWithOutput(
    command: string,
    args: string[],
    cwd: string,
    write: (text: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.aborted) {
        reject(new Error("Uploader aborted"));
        return;
      }
      const proc = this.deps.spawn(command, args, { cwd, shell: false });
      this.currentProc = proc;
      proc?.stdout?.on("data", (data: Buffer) => {
        write(data.toString().replace(/\n/g, "\r\n"));
      });
      proc?.stderr?.on("data", (data: Buffer) => {
        write(data.toString().replace(/\n/g, "\r\n"));
      });
      proc?.on("close", (code) => {
        this.currentProc = null;
        if (this.aborted) {
          reject(new Error("Uploader aborted"));
          return;
        }
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code ?? "unknown"}`));
        }
      });
      proc?.on("error", (err) => {
        this.currentProc = null;
        reject(err);
      });
      if (!proc) {
        this.currentProc = null;
        reject(new Error(`Failed to spawn command: ${command}`));
      }
    });
  }
}
