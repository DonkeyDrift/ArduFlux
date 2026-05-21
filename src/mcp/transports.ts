import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import * as http from "http";

function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : undefined);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export async function startSseServer(
  mcpServer: McpServer,
  port: number,
  serverFactory?: () => McpServer
): Promise<{ port: number; server: http.Server }> {
  // Legacy SSE transports (protocol 2024-11-05)
  const sseTransports = new Map<string, SSEServerTransport>();

  // New Streamable HTTP transports (protocol 2025-11-25)
  const httpTransports = new Map<string, StreamableHTTPServerTransport>();

  const server = http.createServer(async (req, res) => {
    try {
      // ── Streamable HTTP endpoint (/mcp) ──
      if (req.url === "/mcp") {
        if (req.method === "POST") {
          const body = await parseJsonBody(req);
          const sessionId = req.headers["mcp-session-id"] as string | undefined;

          let transport: StreamableHTTPServerTransport | undefined;

          if (sessionId && httpTransports.has(sessionId)) {
            transport = httpTransports.get(sessionId)!;
          } else if (!sessionId && isInitializeRequest(body)) {
            const eventStore = new InMemoryEventStore();
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              eventStore,
              onsessioninitialized: (sid) => {
                httpTransports.set(sid, transport!);
              },
            });
            transport.onclose = () => {
              const sid = transport!.sessionId;
              if (sid) {
                httpTransports.delete(sid);
              }
            };

            const serverInstance = serverFactory ? serverFactory() : mcpServer;
            await serverInstance.connect(transport);
            await transport.handleRequest(req, res, body);
            return;
          } else {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: {
                  code: -32000,
                  message: "Bad Request: No valid session ID provided",
                },
                id: null,
              })
            );
            return;
          }

          await transport.handleRequest(req, res, body);
          return;
        }

        if (req.method === "GET") {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          const transport = sessionId ? httpTransports.get(sessionId) : undefined;
          if (!transport) {
            res.statusCode = 400;
            res.end("Invalid or missing session ID");
            return;
          }
          await transport.handleRequest(req, res);
          return;
        }

        if (req.method === "DELETE") {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          const transport = sessionId ? httpTransports.get(sessionId) : undefined;
          if (!transport) {
            res.statusCode = 400;
            res.end("Invalid or missing session ID");
            return;
          }
          await transport.handleRequest(req, res);
          return;
        }

        res.statusCode = 405;
        res.end("Method not allowed");
        return;
      }

      // ── Legacy SSE endpoint (/sse) ──
      if (req.method === "GET" && req.url === "/sse") {
        const transport = new SSEServerTransport("/message", res);
        sseTransports.set(transport.sessionId, transport);
        transport.onclose = () => {
          sseTransports.delete(transport.sessionId);
        };
        await mcpServer.connect(transport);
        await transport.start();
        return;
      }

      if (req.method === "POST" && req.url?.startsWith("/message")) {
        const url = new URL(req.url, `http://localhost`);
        const sessionId = url.searchParams.get("sessionId");
        const transport = sessionId ? sseTransports.get(sessionId) : undefined;
        if (!transport) {
          res.statusCode = 404;
          res.end("Session not found");
          return;
        }

        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => {
          body += chunk;
        });
        req.on("end", async () => {
          try {
            const parsedBody = body ? JSON.parse(body) : undefined;
            await transport.handlePostMessage(req, res, parsedBody);
          } catch {
            res.statusCode = 400;
            res.end("Invalid JSON");
          }
        });
        return;
      }

      res.statusCode = 404;
      res.end("Not found");
    } catch {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal error");
      }
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actualPort =
        typeof address === "object" && address !== null
          ? address.port
          : port;
      resolve({ port: actualPort, server });
    });
  });
}

export async function startStdioServer(mcpServer: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
