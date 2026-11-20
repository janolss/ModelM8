import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./context.js";
import { registerAnalysisTools } from "./analysis-tools.js";
import { registerConsumeTools } from "./consume-tools.js";
import { registerMethodologyTools } from "./methodology-tools.js";
import { registerProposeTools } from "./propose-tools.js";
import { registerWriteTools } from "./write-tools.js";

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerMethodologyTools(server, ctx);
  registerConsumeTools(server, ctx);
  registerAnalysisTools(server, ctx);
  registerProposeTools(server, ctx);

  if (ctx.config.allowWrites) {
    registerWriteTools(server, ctx);
  }
}
