#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config as loadEnv } from "dotenv";
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
    `modelM8 (stdio) started (writes=${config.allowWrites}, deletes=${config.allowDeletes}, writeMode=${config.writeMode}, requireLock=${config.requireLockBeforeWrite}, unlockMode=${config.unlockMode})`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
