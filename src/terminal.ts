import { spawn } from "child_process";
import * as vscode from "vscode";
import { ValidationError } from "./configStore";

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
            if (code === 0) {
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
        }
      }
    };

    const terminal = vscode.window.createTerminal({ name, pty });
    terminal.show();
  });
}
