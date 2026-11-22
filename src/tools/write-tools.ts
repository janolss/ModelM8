import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";
import { jsonBody, languageId, permissionGroupHeader, repositoryId, uuid } from "./schemas.js";

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
          .describe("e.g. flow, raciresponsible, controls, isusedby, isfollowedby"),
        label: z.string().optional().describe("Edge label text, e.g. Ja / Nej on vägval branches"),
      },
    },
    async (args) => runTool(() => writer.createCanvasEdge(args)),
  );

  server.registerTool(
    "move_canvas_vertices",
    {
      description:
        "Move one or more canvas symbols (PATCH /canvas). Pass vertices[{ vertexId, x, y }]. By default reorthogonalizes attached edges in the same call (set reorthogonalizeEdges:false to skip).",
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
        reorthogonalizeEdges: z
          .boolean()
          .optional()
          .describe("Default true — rebuild orthogonal routes for attached edges"),
      },
    },
    async (args) => runTool(() => writer.moveCanvasVertices(args)),
  );

  server.registerTool(
    "retarget_vertex_symbol",
    {
      description:
        "Replace the symbol on a canvas vertex while keeping position and recreating edges. Sends label bounds (incl. default language) on create — avoids 400 Label bounds must be provided. Use when consolidating aliases (e.g. HRM → HR-system). API cannot PATCH vertex.symbol.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        vertexId: uuid,
        newSymbolId: uuid.describe("Existing symbol UUID to place on the vertex"),
        languageId,
      },
    },
    async (args) => runTool(() => writer.retargetVertexSymbol(args)),
  );

  server.registerTool(
    "create_document_type",
    {
      description:
        "Create a document type (category) in the repository. Body: { titles: { [languageId]: { title } } }. Use uuid in link_document createDocumentBody.documentTypes.",
      inputSchema: {
        repositoryId,
        languageId: languageId.optional(),
        title: z.string().min(1).optional().describe("Shorthand: builds titles for languageId"),
        body: jsonBody
          .optional()
          .describe("Full MtbDocumentTypeDto — titles map required if title omitted"),
      },
    },
    async (args) =>
      runTool(async () => {
        let body = args.body;
        if (!body) {
          if (!args.title || !args.languageId) {
            throw new Error("create_document_type requires body or (title + languageId)");
          }
          body = {
            titles: {
              [args.languageId]: { title: args.title },
            },
          };
        }
        return ctx.documents.createDocumentType(args.repositoryId, body);
      }),
  );

  server.registerTool(
    "create_document_root",
    {
      description:
        "Create a document root (shared base URL/folder). Required: key (stable id) + value (base path). Links use prefix=<key> and relative content. Prefer when many docs share one library path so host/folder moves only update the root.",
      inputSchema: {
        repositoryId,
        languageId: languageId.optional(),
        title: z
          .string()
          .min(1)
          .optional()
          .describe("Display title; builds titles for languageId when body omitted"),
        key: z
          .string()
          .min(1)
          .optional()
          .describe("Stable root id used as MT document prefix (e.g. ims-docs)"),
        value: z
          .string()
          .min(1)
          .optional()
          .describe("Base URL or folder path, e.g. https://example.com/docs/"),
        body: jsonBody
          .optional()
          .describe(
            "Full body: { key, value, titles: { [languageId]: { title } } }. Overrides shorthand fields when set.",
          ),
      },
    },
    async (args) =>
      runTool(async () => {
        let body = args.body ? { ...args.body } : undefined;
        if (!body) {
          if (!args.key || !args.value || !args.title || !args.languageId) {
            throw new Error(
              "create_document_root requires body or (key + value + title + languageId)",
            );
          }
          body = {
            key: args.key,
            value: args.value,
            titles: {
              [args.languageId]: { title: args.title },
            },
          };
        } else {
          if (args.key && body.key === undefined) body.key = args.key;
          if (args.value && body.value === undefined) body.value = args.value;
          if (
            args.title &&
            args.languageId &&
            (body.titles === undefined || typeof body.titles !== "object" || body.titles === null)
          ) {
            body.titles = { [args.languageId]: { title: args.title } };
          }
        }
        if (!body.key || !body.value) {
          throw new Error("create_document_root requires key and value");
        }
        return ctx.documents.createDocumentRoot(args.repositoryId, body);
      }),
  );

  server.registerTool(
    "create_description_type",
    {
      description:
        "Create a description type in the repository (syfte/scope/ägare fields). Body: { titles: { [languageId]: { title } } } (+ optional dataType/inputType). New repos may be empty until client open — create before update_*_description.",
      inputSchema: {
        repositoryId,
        languageId: languageId.optional(),
        title: z.string().min(1).optional().describe("Shorthand: builds titles for languageId"),
        body: jsonBody
          .optional()
          .describe("Full MtbDescriptionTypeDto — titles map required if title omitted"),
      },
    },
    async (args) =>
      runTool(async () => {
        let body = args.body;
        if (!body) {
          if (!args.title || !args.languageId) {
            throw new Error("create_description_type requires body or (title + languageId)");
          }
          body = {
            titles: {
              [args.languageId]: { title: args.title },
            },
          };
        }
        return ctx.documents.createDescriptionType(args.repositoryId, body);
      }),
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
              points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
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
      description: "Accept a draft model into a target repository and archive the source draft",
      inputSchema: {
        repositoryId: z.string().min(1).describe("Source repository UUID or draft alias"),
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
    "create_model_version",
    {
      description:
        "Create a new model version (POST …/versions). Body: MtbModelVersionChangeDto (message, workflowState).",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        message: z.string().optional(),
        workflowState: z.string().optional(),
        body: jsonBody.optional(),
      },
    },
    async (args) =>
      runTool(() =>
        ctx.client.request({
          method: "POST",
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/versions",
          pathParams: {
            repositoryId: args.repositoryId,
            modelId: args.modelId,
          },
          body: args.body ?? {
            ...(args.message !== undefined ? { message: args.message } : {}),
            ...(args.workflowState !== undefined ? { workflowState: args.workflowState } : {}),
          },
        }),
      ),
  );

  server.registerTool(
    "update_model_version",
    {
      description:
        "Update current model version metadata (PATCH …/versions). Body: MtbModelVersionChangeDto.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        message: z.string().optional(),
        workflowState: z.string().optional(),
        body: jsonBody.optional(),
      },
    },
    async (args) =>
      runTool(() =>
        ctx.client.request({
          method: "PATCH",
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/versions",
          pathParams: {
            repositoryId: args.repositoryId,
            modelId: args.modelId,
          },
          body: args.body ?? {
            ...(args.message !== undefined ? { message: args.message } : {}),
            ...(args.workflowState !== undefined ? { workflowState: args.workflowState } : {}),
          },
        }),
      ),
  );

  server.registerTool(
    "create_layer",
    {
      description:
        "Create a layer on a model. Required: layerType (MtbLayerDto). Optional uuid + extra body fields.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        layerType: z.string().min(1),
        uuid: uuid.optional(),
        body: jsonBody.optional(),
      },
    },
    async (args) =>
      runTool(() =>
        ctx.client.request({
          method: "POST",
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/layers",
          pathParams: {
            repositoryId: args.repositoryId,
            modelId: args.modelId,
          },
          body: {
            layerType: args.layerType,
            ...(args.uuid ? { uuid: args.uuid } : {}),
            ...(args.body ?? {}),
          },
        }),
      ),
  );

  server.registerTool(
    "delete_layer",
    {
      description: "Delete a layer from a model by layerTypeId.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        layerTypeId: uuid,
      },
    },
    async ({ repositoryId: id, modelId, layerTypeId }) =>
      runTool(() =>
        ctx.client.request({
          method: "DELETE",
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/layers/{layerTypeId}",
          pathParams: { repositoryId: id, modelId, layerTypeId },
        }),
      ),
  );

  server.registerTool(
    "update_swimlane_settings",
    {
      description:
        "PATCH canvas.swimlaneSettings on a swimlane model. Pass settings object as returned/expected by GET canvas.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        swimlaneSettings: jsonBody.describe("Canvas swimlaneSettings object"),
      },
    },
    async (args) =>
      runTool(() =>
        ctx.client.request({
          method: "PATCH",
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
          pathParams: {
            repositoryId: args.repositoryId,
            modelId: args.modelId,
          },
          body: { swimlaneSettings: args.swimlaneSettings },
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
            "Defaults to activity; e.g. businessObject, role, or (vägval/Regel Eller). Call resolve_branching_object_type for branching. NEVER gateway or join.",
          ),
        symbolId: uuid.optional().describe("Reuse this symbol UUID if known"),
        connectFromVertexId: uuid.optional().describe("Create flow edge from this vertex"),
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
        edgeType: z.string().optional().describe("Defaults to raciresponsible"),
        x: z.number().optional(),
        y: z.number().optional(),
      },
    },
    async (args) => runTool(() => writer.setActivityPerformer(args)),
  );

  server.registerTool(
    "set_activity_used_by",
    {
      description:
        "Link an application or step-specific mall/blankett to one activity (IS_USED_BY). Places a vertex under the activity (shared symbol UUID OK, never one vertex fan-out). Prefer this over create_canvas_edge. Process-wide docs → link_document on the process symbol.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        activityVertexId: uuid,
        usedBySymbolId: uuid,
        languageId,
        usedByTitle: z.string().optional(),
        objectTypeHint: z
          .string()
          .optional()
          .describe("e.g. application | core_document — layout size; defaults from symbol"),
        edgeType: z.string().optional().describe("Defaults to isusedby"),
        x: z.number().optional(),
        y: z.number().optional(),
      },
    },
    async (args) => runTool(() => writer.setActivityUsedBy(args)),
  );

  server.registerTool(
    "set_activity_controls",
    {
      description:
        "Link a step-specific controlling document above one activity (CONTROLS). Prefer this over create_canvas_edge. Do NOT fan out process-wide policies — those belong on the process via link_document.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        activityVertexId: uuid,
        controlsSymbolId: uuid,
        languageId,
        controlsTitle: z.string().optional(),
        edgeType: z.string().optional().describe("Defaults to controls"),
        x: z.number().optional(),
        y: z.number().optional(),
      },
    },
    async (args) => runTool(() => writer.setActivityControls(args)),
  );

  server.registerTool(
    "set_step_io",
    {
      description: "Connect two vertices with a FLOW edge to express input/output between steps.",
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
        'Create a breakdown (nedbrytning) on the DETAIL model. Preferred body: { symbol: "<overviewSymbolUuid>" }. Do not use ofSymbol/ofModel/ofVertex or nested {uuid,version}. Prefer link_breakdown for the common case.',
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
    "delete_breakdown",
    {
      description:
        "Remove a broken-down-from link from a DETAIL model (not the model itself). Requires writes, not ALLOW_DELETES. Get breakdownId via get_breakdowns / get_navigation_tree.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Detail model that owns the breakdown link"),
        breakdownId: uuid,
      },
    },
    async (args) => runTool(() => writer.deleteBreakdown(args)),
  );

  server.registerTool(
    "create_process_map",
    {
      description:
        "Create a process map / overview. PREFERRED: detailModelIds (or layout.coreDetailModelIds for threeBand) — server derives BO↔process chain from detail scopes. layout.mode=threeBand places management (top) and support (bottom) chevrons without FLOW. Do NOT invent overview BOs.",
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
          .describe(
            "Only if detailModelIds omitted; BOs will be rewritten from detail scopes when detailModelId is set",
          ),
        lockBosToDetailScope: z
          .boolean()
          .optional()
          .describe(
            "Default true when chain has detailModelId — replace BOs with detail inputs/outputs",
          ),
        sideLoops: z
          .array(
            z.object({
              fromBoTitle: z.string().min(1).describe("Business object title on the main chain"),
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
        layout: z
          .object({
            mode: z
              .enum(["linear", "parallelTracks", "threeBand"])
              .optional()
              .describe("Default linear. threeBand = L0 ledning/kärna/stöd"),
            managementProcessIds: z
              .array(uuid)
              .optional()
              .describe("Detail model UUIDs for top band (no FLOW)"),
            coreDetailModelIds: z
              .array(uuid)
              .optional()
              .describe("Middle FLOW spine — used as detailModelIds when that is omitted"),
            supportProcessIds: z
              .array(uuid)
              .optional()
              .describe("Detail model UUIDs for bottom band (no FLOW)"),
          })
          .optional(),
        permissionGroup: permissionGroupHeader,
        owner: uuid.optional(),
        group: uuid.optional(),
        modelId: uuid.optional().describe("Append to existing model; otherwise creates new"),
      },
    },
    async (args) => runTool(() => writer.createProcessMap(args)),
  );

  server.registerTool(
    "link_document",
    {
      description:
        "Create/update an MT document and/or attach document IDs to a symbol. Prefer existing document roots/types. With a root: set prefix to the root key and languages.*.content to the relative path. Symbol PATCH uses MtbDocumentIdDto [{ id, source: 'mt.documents' }] — never plain UUID strings. showInPanel defaults to false (new tab); set true only for web 2c8 panel/iframe.",
      inputSchema: {
        repositoryId,
        symbolId: uuid.optional(),
        documentIds: z.array(z.string()).optional(),
        createDocumentBody: jsonBody
          .optional()
          .describe(
            "Body for POST mt-documents. Optional prefix=<document root key> + relative content. showInPanel omitted → false.",
          ),
        updateDocumentId: uuid.optional(),
        updateDocumentBody: jsonBody.optional(),
      },
    },
    async (args) =>
      runTool(async () => {
        const results: Record<string, unknown> = {};
        let linked = false;
        if (args.createDocumentBody) {
          results.created = await ctx.documents.createMtDocument(
            args.repositoryId,
            args.createDocumentBody,
          );
          const created = results.created as {
            uuid?: string;
            id?: string;
          };
          const createdId = created?.uuid ?? created?.id;
          if (createdId && args.symbolId) {
            results.linked = await ctx.documents.linkDocumentsToSymbol({
              repositoryId: args.repositoryId,
              symbolId: args.symbolId,
              documentIds: [...(args.documentIds ?? []), createdId],
            });
            linked = true;
          }
        } else if (args.updateDocumentId && args.updateDocumentBody) {
          results.updated = await ctx.documents.updateMtDocument(
            args.repositoryId,
            args.updateDocumentId,
            args.updateDocumentBody,
          );
        }
        if (args.symbolId && args.documentIds?.length && !linked) {
          results.linked = await ctx.documents.linkDocumentsToSymbol({
            repositoryId: args.repositoryId,
            symbolId: args.symbolId,
            documentIds: args.documentIds,
          });
        }
        return {
          data: results,
          methodologyNotes: [
            "Document links use { id, source: 'mt.documents' }. Empty HTTP 200 from PATCH is treated as success.",
          ],
          nextSuggestedTools: ["get_object_documents"],
        };
      }),
  );

  server.registerTool(
    "unlink_document",
    {
      description:
        "Remove MT document ID(s) from a symbol documents panel (PATCH remaining refs). Use to undo fan-out or wrong links. Does not delete the mt-document itself.",
      inputSchema: {
        repositoryId,
        symbolId: uuid,
        documentIds: z.array(z.string()).min(1),
      },
    },
    async (args) =>
      runTool(() =>
        ctx.documents.unlinkDocumentsFromSymbol({
          repositoryId: args.repositoryId,
          symbolId: args.symbolId,
          documentIds: args.documentIds,
        }),
      ),
  );

  server.registerTool(
    "confirm_translations",
    {
      description:
        "Mark existing titles as translated (translated:true) without changing text — symbols, models, and canvas edge labels (Ja/Nej etc.). Clears GUI Translation status globes. Pass languageId (e.g. English).",
      inputSchema: {
        repositoryId,
        languageId,
        includeModels: z.boolean().optional().describe("Also confirm model titles (default true)"),
        maxSymbols: z.number().int().positive().optional(),
      },
    },
    async (args) => runTool(() => writer.confirmTranslations(args)),
  );

  server.registerTool(
    "update_titles",
    {
      description:
        "Update model/symbol titles (translations). Writes title + rawTitle and sets translated:true (marks language as translated — clears GUI globe). Prefer items[] to batch many symbols in ONE call.",
      inputSchema: {
        repositoryId,
        languageId: languageId
          .optional()
          .describe("Default language for single or items without per-item languageId"),
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
