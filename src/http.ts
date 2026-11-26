import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import type { AppConfig } from "./config.js";
import { isNonLoopbackBindHost } from "./domain/document-fetch-guard.js";
import { createWriteScopeFromConfig } from "./domain/write-scope.js";
import { createServer } from "./server.js";

function unauthorized(res: Response): void {
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
}

function assertHttpAuth(req: Request, config: AppConfig, res: Response): boolean {
  const token = config.httpAuthToken;
  if (!token) {
    return true;
  }
  const header = req.header("authorization") ?? "";
  const expected = `Bearer ${token}`;
  if (header !== expected) {
    unauthorized(res);
    return false;
  }
  return true;
}

export async function startHttpServer(config: AppConfig): Promise<void> {
  const app = createMcpExpressApp({ host: config.host });
  // One WriteScope for the process — createServer() is called per HTTP request.
  const writeScope = createWriteScopeFromConfig(config);

  if (isNonLoopbackBindHost(config.host) && !config.httpAuthToken) {
    console.error(
      "SECURITY WARNING: HOST binds beyond loopback and MCP_HTTP_AUTH_TOKEN is unset. " +
        "POST /mcp has no authentication — set MCP_HTTP_AUTH_TOKEN or put a reverse proxy/auth in front " +
        "before exposing this port on untrusted networks.",
    );
  } else if (isNonLoopbackBindHost(config.host) && config.httpAuthToken) {
    console.error(
      "modelM8 HTTP: non-loopback HOST with MCP_HTTP_AUTH_TOKEN enabled (Bearer required on /mcp).",
    );
  }

  app.post("/mcp", async (req, res) => {
    if (!assertHttpAuth(req, config, res)) {
      return;
    }
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

  // Minimal public health — do not expose write-scope or policy flags.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(config.port, config.host, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      console.error(
        `modelM8 (HTTP) listening on http://${config.host}:${config.port}/mcp (writes=${config.allowWrites}, deletes=${config.allowDeletes}, writeMode=${config.writeMode}, requireLock=${config.requireLockBeforeWrite}, unlockMode=${config.unlockMode}, httpAuth=${config.httpAuthToken ? "bearer" : "off"})`,
      );
      resolve();
    });
    httpServer.on("error", reject);
  });
}
