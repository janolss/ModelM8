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
    "create_repository",
    {
      description:
        "Create a new 2c8 repository (POST /repositories). Use for sandboxes such as 'Utveckling MCP'.",
      inputSchema: {
        name: z.string().min(1),
        languages: z
          .array(
            z.object({
              name: z.string(),
              locale: z.string(),
              default: z.boolean().optional(),
            }),
          )
          .optional()
          .describe("Defaults to Svenska sv_SE"),
        template: z.boolean().optional(),
        owner: uuid.optional(),
        directory: uuid.optional(),
        colorScheme: uuid.optional(),
        body: jsonBody.optional(),
      },
    },
    async (args) =>
      runTool(() =>
        writer.createRepository({
          name: args.name,
          languages: args.languages,
          template: args.template,
          owner: args.owner,
          directory: args.directory,
          colorScheme: args.colorScheme,
          body: args.body,
        }),
      ),
  );

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
    "create_canvas_edge",
    {
      description:
        "Create a canvas edge (orthogonal points). edgeType: FLOW, RACI_RESPONSIBLE, CONTROLS, IS_USED_BY, IS_FOLLOWED_BY. FLOW on process/activity: left-in / right-out. For RACI: never fan one role vertex to multiple activities — place a role under each activity (prefer set_activity_performer). Optional label for VÄGVAL answers (Ja/Nej).",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        fromVertexId: uuid,
        toVertexId: uuid,
        languageId,
        edgeType: z
          .string()
          .min(1)
          .describe(
            "e.g. flow, raciresponsible, controls, isusedby, isfollowedby",
          ),
        label: z
          .string()
          .optional()
          .describe("Edge label text, e.g. Ja / Nej on vägval branches"),
      },
    },
    async (args) => runTool(() => writer.createCanvasEdge(args)),
  );

  server.registerTool(
    "move_canvas_vertices",
    {
      description:
        "Move one or more canvas symbols (PATCH /canvas). Pass vertices[{ vertexId, x, y }]. Use after review flags spacing / left-margin / misalignment. Then update_canvas_edges with reorthogonalize for attached FLOW.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        vertices: z
          .array(
            z.object({
              vertexId: uuid,
              x: z.number(),
              y: z.number(),
              width: z.number().optional(),
              height: z.number().optional(),
            }),
          )
          .min(1),
      },
    },
    async (args) => runTool(() => writer.moveCanvasVertices(args)),
  );

  server.registerTool(
    "update_canvas_edges",
    {
      description:
        "Update edge routing on the canvas (PATCH /canvas). Prefer edges[{ edgeId, reorthogonalize: true }] after move_canvas_vertices. Or pass explicit points[].",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        edges: z
          .array(
            z.object({
              edgeId: uuid,
              reorthogonalize: z.boolean().optional(),
              points: z
                .array(z.object({ x: z.number(), y: z.number() }))
                .optional(),
            }),
          )
          .min(1),
      },
    },
    async (args) => runTool(() => writer.updateCanvasEdges(args)),
  );

  server.registerTool(
    "delete_canvas_edge",
    {
      description:
        "Delete canvas edge(s) by edgeId (corrective edit). Use to remove illegal activity→activity / BO→BO FLOW or wrong relations. edgeId from describe_process outgoing[].edgeId. Does NOT require TWO_C8_ALLOW_DELETES.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        edgeIds: z.array(uuid).min(1).describe("One or more edge UUIDs"),
      },
    },
    async (args) => runTool(() => writer.deleteCanvasEdges(args)),
  );

  server.registerTool(
    "delete_canvas_vertex",
    {
      description:
        "Remove vertex/vertices from the model canvas (symbol stays in repo). Delete attached edges first if needed. Corrective edit — not the same as delete_model.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        vertexIds: z.array(uuid).min(1),
      },
    },
    async (args) => runTool(() => writer.deleteCanvasVertices(args)),
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
          .describe(
            'Defaults to activity; e.g. businessObject, role, or (vägval/Regel Eller). Call resolve_branching_object_type for branching. NEVER gateway or join.',
          ),
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
        "Place an existing symbol UUID on a model canvas (reuse, not duplicate). Uses repository symbolsizes + label placement (inside for activity/process, below for small icons).",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        symbolId: uuid,
        languageId,
        title: z.string().optional().describe("For label bounds sizing"),
        objectType: z
          .string()
          .optional()
          .describe("Defaults to activity; drives symbolsizes lookup"),
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
        "Link a role/position/organisation as performer of one activity (RACI_RESPONSIBLE). Always places a vertex under that activity (reuses symbol UUID). Never attaches one canvas role to multiple activities — call once per activity.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        activityVertexId: uuid,
        performerSymbolId: uuid,
        languageId,
        performerTitle: z.string().optional(),
        edgeType: z
          .string()
          .optional()
          .describe("Defaults to raciresponsible"),
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
        "Connect two vertices with a FLOW edge to express input/output between steps.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        fromVertexId: uuid,
        toVertexId: uuid,
        languageId,
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
        "Create a breakdown (nedbrytning) on the DETAIL model. Preferred body: { symbol: \"<overviewSymbolUuid>\" }. Do not use ofSymbol/ofModel/ofVertex or nested {uuid,version}. Prefer link_breakdown for the common case.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Target detail model UUID"),
        body: jsonBody.describe(
          'Write DTO, typically { "symbol": "<processSymbolUuidOnOverview>" }',
        ),
      },
    },
    async (args) => runTool(() => writer.createBreakdown(args)),
  );

  server.registerTool(
    "link_breakdown",
    {
      description:
        "Link a detail process model as breakdown of an overview process symbol. POSTs { symbol: overviewSymbolId } on the detail model. Prefer this over raw create_breakdown.",
      inputSchema: {
        repositoryId,
        detailModelId: uuid.describe("Detail model that elaborates the process"),
        overviewSymbolId: uuid.describe(
          "Process symbol UUID placed on the overview map (same UUID as reused on canvas)",
        ),
      },
    },
    async (args) => runTool(() => writer.linkBreakdown(args)),
  );

  server.registerTool(
    "create_process_map",
    {
      description:
        "Create a process map / overview. PREFERRED: pass detailModelIds (ordered detail UUIDs) — server derives BO↔process chain from each detail's inputs/outputs (same symbols). Do NOT invent overview BOs. Optional chain is locked to detail scopes when detailModelId is set. Validates scope; blocks mismatches. Never stacks vertices.",
      inputSchema: {
        repositoryId,
        languageId,
        title: z.string().min(1),
        detailModelIds: z
          .array(uuid)
          .min(1)
          .optional()
          .describe(
            "PREFERRED. Ordered detail model UUIDs left→right. Builds chain from get_detail_process_scope — overview I/O = detail I/O.",
          ),
        chain: z
          .array(
            z.object({
              kind: z.enum(["businessObject", "process"]),
              title: z.string().min(1),
              symbolId: uuid.optional(),
              detailModelId: uuid
                .optional()
                .describe("When kind=process: link breakdown to this detail model"),
            }),
          )
          .optional()
          .describe("Only if detailModelIds omitted; BOs will be rewritten from detail scopes when detailModelId is set"),
        lockBosToDetailScope: z
          .boolean()
          .optional()
          .describe("Default true when chain has detailModelId — replace BOs with detail inputs/outputs"),
        sideLoops: z
          .array(
            z.object({
              fromBoTitle: z
                .string()
                .min(1)
                .describe("Business object title on the main chain"),
              processTitle: z.string().min(1),
              symbolId: uuid.optional(),
              detailModelId: uuid.optional(),
              placement: z.enum(["below"]).optional(),
            }),
          )
          .optional()
          .describe("Supporting processes stacked under a state BO (never left of the BO)"),
        parallelTracks: z
          .array(
            z.object({
              fromBoTitle: z
                .string()
                .min(1)
                .describe("Shared state BO that fans into variant processes"),
              label: z.string().optional(),
              processes: z
                .array(
                  z.object({
                    processTitle: z.string().min(1),
                    symbolId: uuid.optional(),
                    detailModelId: uuid.optional(),
                    outputBoTitle: z.string().optional(),
                    outputSymbolId: uuid.optional(),
                  }),
                )
                .min(1),
            }),
          )
          .optional()
          .describe(
            "Peer variant processes as columns to the RIGHT of a shared BO (prefer over sideLoops for sales/delivery types)",
          ),
        permissionGroup: permissionGroupHeader,
        owner: uuid.optional(),
        group: uuid.optional(),
        modelId: uuid
          .optional()
          .describe("Append to existing model; otherwise creates new"),
      },
    },
    async (args) => runTool(() => writer.createProcessMap(args)),
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
    "update_titles",
    {
      description:
        "Update model/symbol titles (translations). Writes title + rawTitle and sets translated:false (clears the GUI 'needs review' marker). Prefer items[] to batch many symbols in ONE call.",
      inputSchema: {
        repositoryId,
        languageId: languageId.optional().describe("Default language for single or items without per-item languageId"),
        title: z.string().min(1).optional().describe("Title for single-target update"),
        modelId: uuid.optional(),
        symbolId: uuid.optional(),
        titles: z
          .record(z.string(), z.string())
          .optional()
          .describe("Optional extra languageId → title entries in the same call"),
        items: z
          .array(
            z.object({
              modelId: uuid.optional(),
              symbolId: uuid.optional(),
              title: z.string().min(1),
              languageId: languageId.optional(),
              titles: z.record(z.string(), z.string()).optional(),
            }),
          )
          .optional()
          .describe(
            "Batch: [{ symbolId, title }] or [{ modelId, title }] — one tool call for all translations",
          ),
      },
    },
    async (args) => runTool(() => writer.updateTitles(args)),
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
