import { spawn as cpSpawn, ChildProcess, SpawnOptions } from "child_process";
import * as path from "path";

export interface McpServerProcess {
  process: ChildProcess;
  port: Promise<number>;
}

export interface StartMcpSseServerDeps {
  spawn?: (
    command: string,
    args: string[],
    options: SpawnOptions
  ) => ChildProcess;
}

export function startMcpSseServer(
  extensionPath: string,
  workspaceRoot: string,
  deps: StartMcpSseServerDeps = {}
): McpServerProcess {
  const spawn = deps.spawn ?? cpSpawn;
  const scriptPath = path.join(extensionPath, "dist", "mcpServer.js");
  const proc = spawn(
    "node",
    [scriptPath, "--sse", "--workspace", workspaceRoot],
    {
      detached: false,
      windowsHide: true,
    }
  );

  const portPromise = new Promise<number>((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("MCP SSE server startup timeout"));
      }
    }, 10000);

    const onData = (data: Buffer) => {
      const text = data.toString();
      const match = text.match(
        /SSE server listening on http:\/\/127\.0\.0\.1:(\d+)/
      );
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(parseInt(match[1], 10));
      }
    };

    proc.stderr?.on("data", onData);
    proc.stdout?.on("data", onData);

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    proc.on("exit", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`MCP SSE server exited with code ${code}`));
      }
    });
  });

  return { process: proc, port: portPromise };
}
