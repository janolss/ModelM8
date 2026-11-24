import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AppConfig } from "./config.js";
import { createWriteScopeFromConfig } from "./domain/write-scope.js";
import { createServer } from "./server.js";

export async function startHttpServer(config: AppConfig): Promise<void> {
  const app = createMcpExpressApp({ host: config.host });
  // One WriteScope for the process — createServer() is called per HTTP request.
  const writeScope = createWriteScopeFromConfig(config);

  app.post("/mcp", async (req, res) => {
    const server = createServer(config, { writeScope });
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
    const scope = writeScope.snapshot();
    res.json({
      ok: true,
      allowWrites: config.allowWrites,
      allowDeletes: config.allowDeletes,
      writeMode: config.writeMode,
      requireLockBeforeWrite: config.requireLockBeforeWrite,
      unlockMode: config.unlockMode,
      writeScope: {
        locked: scope.locked,
        repositoryId: scope.repositoryId,
        repositoryName: scope.repositoryName,
        lockSource: scope.lockSource,
      },
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
        `modelM8 (HTTP) listening on http://${config.host}:${config.port}/mcp (writes=${config.allowWrites}, deletes=${config.allowDeletes}, writeMode=${config.writeMode}, requireLock=${config.requireLockBeforeWrite}, unlockMode=${config.unlockMode})`,
      );
      resolve();
    });
    httpServer.on("error", reject);
  });
}
