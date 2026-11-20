import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { AppConfig } from "./config.js";
import { createServer } from "./server.js";

export async function startHttpServer(config: AppConfig): Promise<void> {
  const app = createMcpExpressApp({ host: config.host });

  app.post("/mcp", async (req, res) => {
    const server = createServer(config);
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req, res) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      }),
    );
  });

  app.delete("/mcp", (_req, res) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      }),
    );
  });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      allowWrites: config.allowWrites,
      writeMode: config.writeMode,
      transport: "http",
    });
  });

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(config.port, config.host, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      console.error(
        `2c8 MCP server (HTTP) listening on http://${config.host}:${config.port}/mcp (writes=${config.allowWrites}, writeMode=${config.writeMode})`,
      );
      resolve();
    });
    httpServer.on("error", reject);
  });
}
