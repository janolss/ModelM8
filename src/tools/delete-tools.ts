import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";
import { repositoryId, uuid } from "./schemas.js";

export function registerDeleteTools(server: McpServer, ctx: ToolContext): void {
  if (!ctx.writer) {
    return;
  }
  const writer = ctx.writer;

  server.registerTool(
    "delete_model",
    {
      description:
        "Permanently delete a model (DELETE /repositories/{repositoryId}/models/{modelId}). Requires TWO_C8_ALLOW_DELETES=true. Irreversible — confirm modelId first via find_models / get_repository.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Model UUID to delete"),
      },
    },
    async (args) => runTool(() => writer.deleteModel(args)),
  );
}
