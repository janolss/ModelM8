import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TwoC8Client } from "./api/twoc8-client.js";
import type { AppConfig } from "./config.js";
import { DocumentsService } from "./domain/documents.js";
import { ProcessReader } from "./domain/process-reader.js";
import { ProcessWriter } from "./domain/process-writer.js";
import { loadMethodologyPack } from "./methodology/loader.js";
import { SERVER_INSTRUCTIONS } from "./mcp/instructions.js";
import { registerMethodologyPrompts } from "./mcp/prompts.js";
import { registerMethodologyResources } from "./mcp/resources.js";
import type { ToolContext } from "./tools/context.js";
import { registerAllTools } from "./tools/index.js";

export function createServer(config: AppConfig): McpServer {
  const pack = loadMethodologyPack(config.knowledgeDir);

  const server = new McpServer(
    {
      name: "2c8-mcp-server",
      version: "1.1.0",
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const client = new TwoC8Client(config.baseUrl, config.apiKey);
  const reader = new ProcessReader(client);
  const documents = new DocumentsService(client);
  const writer = config.allowWrites
    ? new ProcessWriter(client, pack, config.writeMode)
    : null;

  const ctx: ToolContext = {
    client,
    pack,
    config,
    reader,
    writer,
    documents,
  };

  registerMethodologyResources(server, pack);
  registerMethodologyPrompts(server);
  registerAllTools(server, ctx);

  return server;
}
