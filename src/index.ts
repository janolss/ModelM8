#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { startHttpServer } from "./http.js";
import { createServer } from "./server.js";

loadEnv();

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.transport === "http") {
    await startHttpServer(config);
    return;
  }

  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `2c8 MCP server (stdio) started (writes=${config.allowWrites}, writeMode=${config.writeMode})`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
