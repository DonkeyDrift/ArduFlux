import { spawn, exec } from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { ValidationError } from "./configStore";

function killProcessTree(pid: number): void {
  try {
    exec(`taskkill /T /F /PID ${pid}`, () => {});
  } catch {
    // ignore
  }
}

export function runInTerminal(
  arduinoCliPath: string,
  baseDir: string,
  name: string,
  args: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const writeEmitter = new vscode.EventEmitter<string>();
    let proc: ReturnType<typeof spawn> | null = null;
    let resolved = false;
    let killedByUser = false;

    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      open: () => {
        writeEmitter.fire(`> ${arduinoCliPath} ${args.join(" ")}\r\n\r\n`);
        proc = spawn(arduinoCliPath, args, {
          cwd: baseDir,
          windowsHide: true,
          shell: false
        });
        proc.stdout?.on("data", (data: Buffer) => {
          writeEmitter.fire(data.toString().replace(/\n/g, "\r\n"));
        });
        proc.stderr?.on("data", (data: Buffer) => {
          writeEmitter.fire(data.toString().replace(/\n/g, "\r\n"));
        });
        proc.on("close", (code) => {
          writeEmitter.fire(`\r\n[Exit code: ${code ?? "null"}]\r\n`);
          if (!resolved) {
            resolved = true;
            if (code === 0 || killedByUser) {
              resolve();
            } else {
              reject(new ValidationError(`${name} 失败，退出码: ${code}`));
            }
          }
        });
        proc.on("error", (err) => {
          writeEmitter.fire(`\r\n[Error: ${err.message}]\r\n`);
          if (!resolved) {
            resolved = true;
            reject(new ValidationError(`${name} 启动失败: ${err.message}`));
          }
        });
      },
      close: () => {
        if (proc && !proc.killed) {
          proc.kill();
          if (typeof proc.pid === "number") {
            killProcessTree(proc.pid);
          }
        }
      },
      handleInput: (data: string) => {
        if (data === "\u0003" && proc && !proc.killed) {
          killedByUser = true;
          proc.stdin?.write(data);
          proc.kill();
          if (typeof proc.pid === "number") {
            killProcessTree(proc.pid);
          }
        } else if (proc && proc.stdin) {
          proc.stdin.write(data);
        }
      }
    };

    const terminal = vscode.window.createTerminal({ name, pty });
    terminal.show();
  });
}

export interface UploadScriptFlags {
  compile?: boolean;
  upload?: boolean;
  monitor?: boolean;
}

export function runUploadScript(
  extensionPath: string,
  workspaceRoot: string,
  flags: UploadScriptFlags = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(extensionPath, "src", "scripts", "upload.ps1");
    const writeEmitter = new vscode.EventEmitter<string>();
    let proc: ReturnType<typeof spawn> | null = null;
    let resolved = false;
    let killedByUser = false;

    const args = ["-ExecutionPolicy", "Bypass", "-NoProfile", "-File", scriptPath];
    if (flags.compile) args.push("-c");
    if (flags.upload) args.push("-u");
    if (flags.monitor) args.push("-s");
    args.push(`-workspace:${workspaceRoot}`);

    let terminal: vscode.Terminal;

    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      open: () => {
        writeEmitter.fire(`> powershell ${args.join(" ")}\r\n\r\n`);
        proc = spawn("powershell.exe", args, {
          cwd: workspaceRoot,
          windowsHide: true,
          shell: false
        });
        proc.stdout?.on("data", (data: Buffer) => {
          writeEmitter.fire(data.toString().replace(/\n/g, "\r\n"));
        });
        proc.stderr?.on("data", (data: Buffer) => {
          writeEmitter.fire(data.toString().replace(/\n/g, "\r\n"));
        });
        proc.on("close", (code) => {
          writeEmitter.fire(`\r\n[Exit code: ${code ?? "null"}]\r\n`);
          if (!resolved) {
            resolved = true;
            if (code === 0 || killedByUser) {
              resolve();
            } else {
              reject(new ValidationError(`上传脚本执行失败，退出码: ${code}`));
            }
          }
          const isMonitorOnly = !flags.compile && !flags.upload && flags.monitor;
          if (!isMonitorOnly) {
            let countdown = 3;
            const timer = setInterval(() => {
              if (countdown > 0) {
                writeEmitter.fire(`[窗口将在 ${countdown} 秒后自动关闭]\r\n`);
                countdown--;
              } else {
                clearInterval(timer);
                terminal.dispose();
              }
            }, 1000);
          }
        });
        proc.on("error", (err) => {
          writeEmitter.fire(`\r\n[Error: ${err.message}]\r\n`);
          if (!resolved) {
            resolved = true;
            reject(new ValidationError(`上传脚本启动失败: ${err.message}`));
          }
        });
      },
      close: () => {
        if (proc && !proc.killed) {
          proc.kill();
          if (typeof proc.pid === "number") {
            killProcessTree(proc.pid);
          }
        }
      },
      handleInput: (data: string) => {
        if (data === "\u0003" && proc && !proc.killed) {
          killedByUser = true;
          proc.stdin?.write(data);
          proc.kill();
          if (typeof proc.pid === "number") {
            killProcessTree(proc.pid);
          }
        } else if (proc && proc.stdin) {
          proc.stdin.write(data);
        }
      }
    };

    terminal = vscode.window.createTerminal({ name: "ArduFlux Upload", pty });
    terminal.show();
  });
}
