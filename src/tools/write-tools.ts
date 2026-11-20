import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";
import {
  jsonBody,
  languageId,
  permissionGroupHeader,
  repositoryId,
  uuid,
} from "./schemas.js";

export function registerWriteTools(server: McpServer, ctx: ToolContext): void {
  if (!ctx.writer) {
    return;
  }
  const writer = ctx.writer;

  server.registerTool(
    "create_process_model",
    {
      description:
        "Create a process/swimlane model. Honours TWO_C8_WRITE_MODE (draft default). Prefer draft → accept_draft_model.",
      inputSchema: {
        repositoryId,
        title: z.string().min(1),
        languageId,
        modelType: z
          .string()
          .optional()
          .describe("Defaults to process; use swimlane for swimlane models"),
        permissionGroup: permissionGroupHeader,
        owner: uuid.optional(),
        group: uuid.optional(),
        body: jsonBody.optional(),
      },
    },
    async (args) =>
      runTool(() =>
        writer.createProcessModel({
          ...args,
          body: args.body,
        }),
      ),
  );

  server.registerTool(
    "accept_draft_model",
    {
      description:
        "Accept a draft model into a target repository and archive the source draft",
      inputSchema: {
        repositoryId: z
          .string()
          .min(1)
          .describe("Source repository UUID or draft alias"),
        modelId: uuid.describe("Draft model UUID"),
        permissionGroup: permissionGroupHeader,
        body: jsonBody,
      },
    },
    async ({ repositoryId: id, modelId, permissionGroup, body }) =>
      runTool(() =>
        ctx.client.request({
          method: "POST",
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/versions/accept",
          pathParams: { repositoryId: id, modelId },
          headers: { "2c8-Permission-Group": permissionGroup },
          body,
        }),
      ),
  );

  server.registerTool(
    "add_process_step",
    {
      description:
        "Add a process step: search/reuse or create symbol, place vertex, optionally connect with an edge. Enforces reuse-first and naming checks. Do NOT create duplicates when search_symbols finds a match — pass symbolId or allow auto-reuse.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        title: z.string().min(1),
        languageId,
        objectType: z
          .string()
          .optional()
          .describe("Defaults to activity; e.g. businessObject, role"),
        symbolId: uuid.optional().describe("Reuse this symbol UUID if known"),
        connectFromVertexId: uuid
          .optional()
          .describe("Create flow edge from this vertex"),
        edgeType: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        owner: uuid.optional(),
        group: uuid.optional(),
        forceCreate: z
          .boolean()
          .optional()
          .describe("Skip reuse search and always create a new symbol"),
      },
    },
    async (args) => runTool(() => writer.addProcessStep(args)),
  );

  server.registerTool(
    "reuse_symbol",
    {
      description:
        "Place an existing symbol UUID on a model canvas (reuse, not duplicate).",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        symbolId: uuid,
        x: z.number().optional(),
        y: z.number().optional(),
      },
    },
    async (args) => runTool(() => writer.reuseSymbol(args)),
  );

  server.registerTool(
    "set_activity_performer",
    {
      description:
        "Link a role/position/organisation symbol as performer of an activity vertex.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        activityVertexId: uuid,
        performerSymbolId: uuid,
        edgeType: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
      },
    },
    async (args) => runTool(() => writer.setActivityPerformer(args)),
  );

  server.registerTool(
    "set_step_io",
    {
      description:
        "Connect two vertices with a flow edge to express input/output between steps.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        fromVertexId: uuid,
        toVertexId: uuid,
        edgeType: z.string().optional(),
      },
    },
    async (args) => runTool(() => writer.setStepIo(args)),
  );

  server.registerTool(
    "place_in_swimlane",
    {
      description:
        "Place a symbol at coordinates inside a swimlane (lane owner becomes performer).",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        symbolId: uuid,
        x: z.number(),
        y: z.number(),
      },
    },
    async (args) => runTool(() => writer.placeInSwimlane(args)),
  );

  server.registerTool(
    "create_breakdown",
    {
      description:
        "Create a breakdown (nedbrytning) linking this model as detail of a symbol/edge. Body matches MtbBreakdownWriteDto.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Target detail model UUID"),
        body: jsonBody,
      },
    },
    async (args) => runTool(() => writer.createBreakdown(args)),
  );

  server.registerTool(
    "link_document",
    {
      description:
        "Create/update an MT document and/or attach document IDs to a symbol. Prefer existing document roots/types.",
      inputSchema: {
        repositoryId,
        symbolId: uuid.optional(),
        documentIds: z.array(z.string()).optional(),
        createDocumentBody: jsonBody
          .optional()
          .describe("Body for POST mt-documents"),
        updateDocumentId: uuid.optional(),
        updateDocumentBody: jsonBody.optional(),
      },
    },
    async (args) =>
      runTool(async () => {
        const results: Record<string, unknown> = {};
        if (args.createDocumentBody) {
          results.created = await ctx.documents.createMtDocument(
            args.repositoryId,
            args.createDocumentBody,
          );
          const createdId = (results.created as { uuid?: string })?.uuid;
          if (createdId && args.symbolId) {
            results.linked = await ctx.documents.linkDocumentsToSymbol({
              repositoryId: args.repositoryId,
              symbolId: args.symbolId,
              documentIds: [
                ...(args.documentIds ?? []),
                createdId,
              ],
            });
          }
        } else if (args.updateDocumentId && args.updateDocumentBody) {
          results.updated = await ctx.documents.updateMtDocument(
            args.repositoryId,
            args.updateDocumentId,
            args.updateDocumentBody,
          );
        }
        if (args.symbolId && args.documentIds?.length && !results.linked) {
          results.linked = await ctx.documents.linkDocumentsToSymbol({
            repositoryId: args.repositoryId,
            symbolId: args.symbolId,
            documentIds: args.documentIds,
          });
        }
        return {
          data: results,
          methodologyNotes: [
            "Document links on symbols appear in publications; ensure end-user reachability.",
          ],
          nextSuggestedTools: ["get_object_documents"],
        };
      }),
  );

  server.registerTool(
    "update_model_description",
    {
      description: "Create or update a model description",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        descriptionTypeId: uuid,
        body: jsonBody,
      },
    },
    async ({ repositoryId: id, modelId, descriptionTypeId, body }) =>
      runTool(() =>
        ctx.client.request({
          method: "PATCH",
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/descriptions/{descriptionTypeId}",
          pathParams: { repositoryId: id, modelId, descriptionTypeId },
          body,
        }),
      ),
  );

  server.registerTool(
    "update_symbol_description",
    {
      description: "Create or update a symbol description",
      inputSchema: {
        repositoryId,
        symbolId: uuid,
        descriptionTypeId: uuid,
        body: jsonBody,
      },
    },
    async ({ repositoryId: id, symbolId, descriptionTypeId, body }) =>
      runTool(() =>
        ctx.client.request({
          method: "PATCH",
          path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}/descriptions/{descriptionTypeId}",
          pathParams: { repositoryId: id, symbolId, descriptionTypeId },
          body,
        }),
      ),
  );
}
