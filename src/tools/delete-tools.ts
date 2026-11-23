import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";
import { repositoryId, uuid } from "./schemas.js";

export function registerDeleteTools(server: McpServer, ctx: ToolContext): void {
  if (!ctx.writer) {
    return;
  }
  const writer = ctx.writer;
  const documents = ctx.documents;

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

  server.registerTool(
    "delete_symbol",
    {
      description:
        "Permanently delete symbol(s) (DELETE …/symbols/{symbolId}). Requires TWO_C8_ALLOW_DELETES=true. Irreversible. Not delete_canvas_vertex (canvas-only). Confirm via search_symbols / list_orphan_symbols first.",
      inputSchema: {
        repositoryId,
        symbolId: uuid.optional().describe("Single symbol UUID (or use symbolIds)"),
        symbolIds: z
          .array(uuid)
          .min(1)
          .optional()
          .describe("One or more symbol UUIDs to delete"),
      },
    },
    async (args) =>
      runTool(() => {
        const symbolIds = [
          ...(args.symbolIds ?? []),
          ...(args.symbolId ? [args.symbolId] : []),
        ];
        if (symbolIds.length === 0) {
          throw new Error("Provide symbolId or symbolIds");
        }
        return writer.deleteSymbols({
          repositoryId: args.repositoryId,
          symbolIds,
        });
      }),
  );

  server.registerTool(
    "delete_mt_document",
    {
      description:
        "Permanently delete MT document(s) (DELETE …/mt-documents/{documentId}). Same irreversible pattern as delete_symbol. Requires TWO_C8_ALLOW_DELETES=true. Prefer unlink_document first if still attached to a symbol. Confirm ids via search_documents / verify_document_links / get_object_documents.",
      inputSchema: {
        repositoryId,
        documentId: uuid.optional().describe("Single MT document UUID (or use documentIds)"),
        documentIds: z
          .array(uuid)
          .min(1)
          .optional()
          .describe("One or more MT document UUIDs to delete"),
      },
    },
    async (args) =>
      runTool(() => {
        const documentIds = [
          ...(args.documentIds ?? []),
          ...(args.documentId ? [args.documentId] : []),
        ];
        if (documentIds.length === 0) {
          throw new Error("Provide documentId or documentIds");
        }
        return documents.deleteMtDocuments({
          repositoryId: args.repositoryId,
          documentIds,
        });
      }),
  );
}
