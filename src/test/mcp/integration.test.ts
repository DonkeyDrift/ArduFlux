import { expect } from "chai";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as http from "http";

describe("MCP Integration", () => {
  const scriptPath = path.join(__dirname, "../../..", "dist", "mcpServer.js");
  const workspaceRoot = process.cwd();

  describe("stdio transport", () => {
    it("应完成 initialize → tools/list 完整握手", async function () {
      this.timeout(15000);

      const proc = spawn("node", [scriptPath, "--stdio", "--workspace", workspaceRoot], {
        windowsHide: true,
      });

      const response = await sendJsonRpc(proc, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "integration-test", version: "1.0.0" },
        },
      });

      expect(response.jsonrpc).to.equal("2.0");
      expect(response.id).to.equal(1);
      expect(response.result).to.be.an("object");
      expect((response.result as Record<string, unknown>).serverInfo).to.deep.include({ name: "arduflux" });

      // Send initialized notification (no response expected)
      sendRawLine(proc, { jsonrpc: "2.0", method: "notifications/initialized" });
      // Small delay to ensure server processes the notification
      await new Promise((r) => setTimeout(r, 100));

      const toolsResponse = await sendJsonRpc(proc, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });

      expect(toolsResponse.result).to.be.an("object");
      expect((toolsResponse.result as Record<string, unknown>).tools).to.be.an("array");
      const toolNames = ((toolsResponse.result as Record<string, unknown>).tools as Array<{ name: string }>).map((t) => t.name);
      expect(toolNames).to.include("arduflux_get_state");
      expect(toolNames).to.include("arduflux_health");

      proc.kill();
    });
  });

  describe("SSE transport (legacy /sse)", () => {
    it("应完成 GET /sse → POST /message 完整握手", async function () {
      this.timeout(15000);

      const sseProc = spawn("node", [scriptPath, "--sse", "--workspace", workspaceRoot], {
        windowsHide: true,
      });

      const port = await waitForSsePort(sseProc);

      // GET /sse to establish stream and keep it open
      const sseRes = await httpGet(`http://127.0.0.1:${port}/sse`);
      expect(sseRes.statusCode).to.equal(200);
      expect(sseRes.headers["content-type"]).to.include("text/event-stream");

      // Read the endpoint event from SSE stream
      const endpointLine = await readFirstSseLine(sseRes);
      expect(endpointLine).to.include("/message");

      // Extract sessionId from endpoint
      const sessionMatch = endpointLine.match(/sessionId=([a-f0-9-]+)/);
      expect(sessionMatch).to.not.be.null;
      const sessionId = sessionMatch![1];

      // Create SSE reader that listens for data events
      const sseReader = createSseReader(sseRes);

      // POST initialize request (response comes via SSE stream)
      await httpPostNoBody(
        `http://127.0.0.1:${port}/message?sessionId=${sessionId}`,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "integration-test", version: "1.0.0" },
          },
        }
      );

      const initResponse = await sseReader.nextJson();
      expect(initResponse.jsonrpc).to.equal("2.0");
      expect(initResponse.id).to.equal(1);
      expect((initResponse.result as Record<string, unknown>).serverInfo).to.deep.include({ name: "arduflux" });

      // POST tools/list request
      await httpPostNoBody(
        `http://127.0.0.1:${port}/message?sessionId=${sessionId}`,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        }
      );

      const toolsResponse = await sseReader.nextJson();
      expect((toolsResponse.result as Record<string, unknown>).tools).to.be.an("array");
      const toolNames = ((toolsResponse.result as Record<string, unknown>).tools as Array<{ name: string }>).map((t) => t.name);
      expect(toolNames).to.include("arduflux_get_state");

      sseRes.destroy();
      sseProc.kill();
    });
  });

  describe("StreamableHTTP transport (/mcp)", () => {
    it("应完成 POST /mcp initialize → tools/list 完整握手", async function () {
      this.timeout(15000);

      const httpProc = spawn("node", [scriptPath, "--sse", "--workspace", workspaceRoot], {
        windowsHide: true,
      });

      const port = await waitForSsePort(httpProc);

      // POST /mcp initialize
      const initResult = await httpPostStreamableHttp(
        `http://127.0.0.1:${port}/mcp`,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "integration-test", version: "1.0.0" },
          },
        }
      );

      expect(initResult.statusCode).to.equal(200);
      expect(initResult.sessionId).to.be.a("string");
      expect(initResult.body.jsonrpc).to.equal("2.0");
      expect(initResult.body.id).to.equal(1);
      expect((initResult.body.result as Record<string, unknown>).serverInfo).to.deep.include({ name: "arduflux" });

      // POST /mcp tools/list with session-id
      const toolsResult = await httpPostStreamableHttp(
        `http://127.0.0.1:${port}/mcp`,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        },
        initResult.sessionId
      );

      expect(toolsResult.statusCode).to.equal(200);
      expect((toolsResult.body.result as Record<string, unknown>).tools).to.be.an("array");
      const toolNames = ((toolsResult.body.result as Record<string, unknown>).tools as Array<{ name: string }>).map((t) => t.name);
      expect(toolNames).to.include("arduflux_get_state");

      httpProc.kill();
    });
  });
});

function sendRawLine(proc: ChildProcess, message: object): void {
  const line = JSON.stringify(message) + "\n";
  proc.stdin?.write(line);
}

function sendJsonRpc(proc: ChildProcess, message: object): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const line = JSON.stringify(message) + "\n";
    let buffer = "";

    const onData = (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i].trim();
        if (l) {
          try {
            const parsed = JSON.parse(l);
            proc.stdout?.off("data", onData);
            resolve(parsed);
            return;
          } catch {
            // not JSON, ignore
          }
        }
      }
      buffer = lines[lines.length - 1];
    };

    proc.stdout?.on("data", onData);
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    proc.stdin?.write(line);
  });
}

function waitForSsePort(proc: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("SSE server startup timeout"));
    }, 10000);

    const onData = (data: Buffer) => {
      const text = data.toString();
      const match = text.match(/SSE server listening on http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        proc.stderr?.off("data", onData);
        resolve(parseInt(match[1], 10));
      }
    };

    proc.stderr?.on("data", onData);
    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function httpGet(url: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      resolve(res);
    });
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("HTTP GET timeout"));
    });
  });
}

function createSseReader(res: http.IncomingMessage) {
  const queue: Record<string, unknown>[] = [];
  let resolveNext: ((value: Record<string, unknown>) => void) | null = null;

  let buffer = "";
  res.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const payload = trimmed.slice(6);
        try {
          const parsed = JSON.parse(payload);
          if (resolveNext) {
            resolveNext(parsed);
            resolveNext = null;
          } else {
            queue.push(parsed);
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    }
  });

  return {
    nextJson(): Promise<Record<string, unknown>> {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
      return new Promise((resolve) => {
        resolveNext = resolve;
      });
    },
  };
}

function httpPostStreamableHttp(
  url: string,
  body: object,
  sessionId?: string
): Promise<{ statusCode: number; sessionId: string; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const postData = JSON.stringify(body);
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          // Parse SSE format: event: message\ndata: {...}\n
          const dataLine = data.split("\n").find((l) => l.trim().startsWith("data: "));
          const payload = dataLine ? dataLine.trim().slice(6) : data;
          const parsed = JSON.parse(payload);
          resolve({
            statusCode: res.statusCode ?? 0,
            sessionId: String(res.headers["mcp-session-id"] ?? ""),
            body: parsed,
          });
        } catch (e) {
          reject(new Error(`Invalid response: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("HTTP POST timeout"));
    });
    req.write(postData);
    req.end();
  });
}

function httpPostNoBody(url: string, body: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const postData = JSON.stringify(body);
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      res.resume();
      resolve();
    });

    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("HTTP POST timeout"));
    });
    req.write(postData);
    req.end();
  });
}

function readFirstSseLine(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          res.off("data", onData);
          resolve(line);
          return;
        }
      }
    };
    res.on("data", onData);
    res.on("end", () => resolve(buffer));
    res.on("error", reject);
  });
}

function httpPost(url: string, body: object): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const postData = JSON.stringify(body);
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("HTTP POST timeout"));
    });
    req.write(postData);
    req.end();
  });
}
