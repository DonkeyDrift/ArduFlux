"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInTerminal = runInTerminal;
exports.runUploadScript = runUploadScript;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const configStore_1 = require("./configStore");
function runInTerminal(arduinoCliPath, baseDir, name, args) {
    return new Promise((resolve, reject) => {
        const writeEmitter = new vscode.EventEmitter();
        let proc = null;
        let resolved = false;
        const pty = {
            onDidWrite: writeEmitter.event,
            open: () => {
                writeEmitter.fire(`> ${arduinoCliPath} ${args.join(" ")}\r\n\r\n`);
                proc = (0, child_process_1.spawn)(arduinoCliPath, args, {
                    cwd: baseDir,
                    windowsHide: true,
                    shell: false
                });
                proc.stdout?.on("data", (data) => {
                    writeEmitter.fire(data.toString().replace(/\n/g, "\r\n"));
                });
                proc.stderr?.on("data", (data) => {
                    writeEmitter.fire(data.toString().replace(/\n/g, "\r\n"));
                });
                proc.on("close", (code) => {
                    writeEmitter.fire(`\r\n[Exit code: ${code ?? "null"}]\r\n`);
                    if (!resolved) {
                        resolved = true;
                        if (code === 0) {
                            resolve();
                        }
                        else {
                            reject(new configStore_1.ValidationError(`${name} 失败，退出码: ${code}`));
                        }
                    }
                });
                proc.on("error", (err) => {
                    writeEmitter.fire(`\r\n[Error: ${err.message}]\r\n`);
                    if (!resolved) {
                        resolved = true;
                        reject(new configStore_1.ValidationError(`${name} 启动失败: ${err.message}`));
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
function runUploadScript(extensionPath, workspaceRoot, flags = {}) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(extensionPath, "src", "scripts", "upload.ps1");
        const writeEmitter = new vscode.EventEmitter();
        let proc = null;
        let resolved = false;
        const args = ["-ExecutionPolicy", "Bypass", "-NoProfile", "-File", scriptPath];
        if (flags.compile)
            args.push("-c");
        if (flags.upload)
            args.push("-u");
        if (flags.monitor)
            args.push("-s");
        const pty = {
            onDidWrite: writeEmitter.event,
            open: () => {
                writeEmitter.fire(`> powershell ${args.join(" ")}\r\n\r\n`);
                proc = (0, child_process_1.spawn)("powershell.exe", args, {
                    cwd: workspaceRoot,
                    windowsHide: true,
                    shell: false
                });
                proc.stdout?.on("data", (data) => {
                    writeEmitter.fire(data.toString().replace(/\n/g, "\r\n"));
                });
                proc.stderr?.on("data", (data) => {
                    writeEmitter.fire(data.toString().replace(/\n/g, "\r\n"));
                });
                proc.on("close", (code) => {
                    writeEmitter.fire(`\r\n[Exit code: ${code ?? "null"}]\r\n`);
                    if (!resolved) {
                        resolved = true;
                        if (code === 0) {
                            resolve();
                        }
                        else {
                            reject(new configStore_1.ValidationError(`上传脚本执行失败，退出码: ${code}`));
                        }
                    }
                });
                proc.on("error", (err) => {
                    writeEmitter.fire(`\r\n[Error: ${err.message}]\r\n`);
                    if (!resolved) {
                        resolved = true;
                        reject(new configStore_1.ValidationError(`上传脚本启动失败: ${err.message}`));
                    }
                });
            },
            close: () => {
                if (proc && !proc.killed) {
                    proc.kill();
                }
            }
        };
        const terminal = vscode.window.createTerminal({ name: "ArduFlux Upload", pty });
        terminal.show();
    });
}
//# sourceMappingURL=terminal.js.map