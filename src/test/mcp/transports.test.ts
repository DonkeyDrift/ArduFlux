import { expect } from "chai";
import * as http from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { startSseServer, startStdioServer } from "../../mcp/transports";

describe("MCP Transports", () => {
  describe("startSseServer", () => {
    it("应启动 HTTP 服务器并返回实际监听的端口", async () => {
      const mcpServer = new McpServer({
        name: "test-sse",
        version: "1.0.0",
      });

      const { port, server } = await startSseServer(mcpServer, 0);
      expect(port).to.be.a("number");
      expect(port).to.be.greaterThan(0);

      // Verify the server responds to GET /sse
      const response = await new Promise<http.IncomingMessage>(
        (resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${port}/sse`, (res) => {
            resolve(res);
          });
          req.on("error", reject);
          req.setTimeout(2000, () => {
            req.destroy();
            reject(new Error("Timeout"));
          });
        }
      );

      expect(response.statusCode).to.equal(200);
      expect(response.headers["content-type"]).to.include("text/event-stream");

      server.close();
    });
  });

  describe("startStdioServer", () => {
    it("应连接 McpServer 到 stdio transport", async () => {
      const mcpServer = new McpServer({
        name: "test-stdio",
        version: "1.0.0",
      });

      // stdio transport connects immediately; we just verify no error
      await startStdioServer(mcpServer);
    });
  });
});
