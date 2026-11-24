import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TwoC8Client } from "./api/twoc8-client.js";
import type { AppConfig } from "./config.js";
import { DocumentsService } from "./domain/documents.js";
import { ProcessReader } from "./domain/process-reader.js";
import { ProcessWriter } from "./domain/process-writer.js";
import { QualityService } from "./domain/quality.js";
import {
  assertClientWriteScope,
  createWriteScopeFromConfig,
  type WriteScope,
} from "./domain/write-scope.js";
import { SERVER_INSTRUCTIONS } from "./mcp/instructions.js";
import { registerMethodologyPrompts } from "./mcp/prompts.js";
import { registerMethodologyResources } from "./mcp/resources.js";
import { loadMethodologyPack } from "./methodology/loader.js";
import type { ToolContext } from "./tools/context.js";
import { registerAllTools } from "./tools/index.js";

export interface CreateServerOptions {
  /** Process-wide write scope. Required for HTTP so lock survives across requests. */
  writeScope?: WriteScope;
}

export function createServer(config: AppConfig, options: CreateServerOptions = {}): McpServer {
  const pack = loadMethodologyPack(config.knowledgeDir);

  const server = new McpServer(
    {
      name: "modelM8",
      version: "1.2.0",
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const writeScope = options.writeScope ?? createWriteScopeFromConfig(config);

  const client = new TwoC8Client(config.baseUrl, config.apiKey);
  if (config.allowWrites || config.allowDeletes) {
    client.setBeforeMutatingRequest((options) => {
      assertClientWriteScope(writeScope, options);
    });
  }

  const reader = new ProcessReader(client);
  const documents = new DocumentsService(client);
  const quality = new QualityService(client, reader, documents);
  const writer =
    config.allowWrites || config.allowDeletes
      ? new ProcessWriter(client, pack, config.writeMode)
      : null;

  const ctx: ToolContext = {
    client,
    pack,
    config,
    reader,
    writer,
    documents,
    quality,
    writeScope,
  };

  registerMethodologyResources(server, pack);
  registerMethodologyPrompts(server);
  registerAllTools(server, ctx);

  return server;
}
