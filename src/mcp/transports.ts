import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as http from "http";

export async function startSseServer(
  mcpServer: McpServer,
  port: number
): Promise<{ port: number; server: http.Server }> {
  const transports = new Map<string, SSEServerTransport>();

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/sse") {
        const transport = new SSEServerTransport("/message", res);
        transports.set(transport.sessionId, transport);
        transport.onclose = () => {
          transports.delete(transport.sessionId);
        };
        await mcpServer.connect(transport);
        await transport.start();
        return;
      }

      if (req.method === "POST" && req.url?.startsWith("/message")) {
        const url = new URL(req.url, `http://localhost`);
        const sessionId = url.searchParams.get("sessionId");
        const transport = sessionId ? transports.get(sessionId) : undefined;
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
