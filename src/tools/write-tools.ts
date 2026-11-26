import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { buildAbsoluteDocumentBody } from "../domain/document-paths.js";
import { extractCreatedRepositoryId, WriteScopeError } from "../domain/write-scope.js";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";
import { jsonBody, languageId, permissionGroupHeader, repositoryId, uuid } from "./schemas.js";
import { runMutatingTool } from "./write-guard.js";

export function registerWriteTools(server: McpServer, ctx: ToolContext): void {
  if (!ctx.writer) {
    return;
  }
  const writer = ctx.writer;

  server.registerTool(
    "create_repository",
    {
      description:
        "Create a new 2c8 repository (POST /repositories). Use for sandboxes such as 'Utveckling MCP'. " +
        "When write scope is unlocked and auto-lock is enabled, locks mutating tools to the new repositoryId.",
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
      runTool(async () => {
        ctx.writeScope.assertCanCreateRepository();
        if (ctx.writeScope.isDeniedName(args.name)) {
          throw new WriteScopeError(
            "denied",
            `Cannot create repository with denied name "${args.name}".`,
          );
        }
        const result = await writer.createRepository({
          name: args.name,
          languages: args.languages,
          template: args.template,
          owner: args.owner,
          directory: args.directory,
          colorScheme: args.colorScheme,
          body: args.body,
        });
        const createdId = extractCreatedRepositoryId(result.data);
        let writeScope = ctx.writeScope.snapshot();
        const notes = [...(result.methodologyNotes ?? [])];
        if (createdId) {
          const locked = ctx.writeScope.tryAutoLockOnCreate({
            repositoryId: createdId,
            repositoryName: args.name,
          });
          writeScope = ctx.writeScope.snapshot();
          if (locked) {
            notes.push(
              `Write scope auto-locked to ${createdId} (${args.name}). ` +
                "Mutating tools reject other repositoryIds until unlock/restart.",
            );
          } else if (writeScope.locked && writeScope.repositoryId !== createdId) {
            notes.push(
              `Repository created but write scope remains locked to ${writeScope.repositoryId}. ` +
                "Unlock before using the new repo for writes.",
            );
          }
        } else {
          notes.push(
            "Repository created but id could not be parsed for auto-lock. " +
              "Call lock_write_repository with the new repositoryId before writes.",
          );
        }
        return {
          ...result,
          writeScope,
          methodologyNotes: notes,
          nextSuggestedTools: ["get_write_scope", ...(result.nextSuggestedTools ?? [])],
        };
      }),
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
      runMutatingTool(ctx, args.repositoryId, () =>
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.createCanvasEdge(args)),
  );

  server.registerTool(
    "move_canvas_vertices",
    {
      description:
        "Move one or more canvas symbols (PATCH /canvas). Pass vertices[{ vertexId, x, y }]. Attached edges are re-routed in the **same** PATCH (required by 2c8 — moving then update_canvas_edges separately causes 'Control point end must lie within the to-vertex bounds').",
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.moveCanvasVertices(args)),
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
    async (args) =>
      runMutatingTool(ctx, args.repositoryId, () => writer.retargetVertexSymbol(args)),
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
      runMutatingTool(ctx, args.repositoryId, async () => {
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
        "Create a document root (shared base folder/URL). Required: key + value. Filesystem paths → file:///…/ (URL-encoded). The 2c8 API does NOT bind MT documents to roots via prefix — after creating documents with full absolute URLs, the user matches paths to this root in the 2c8 UI. Create roots before mass link_document so values match the URL prefix of linked files.",
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
          .describe(
            "Stable root id (e.g. inera-docs) — not used as MT document prefix for binding",
          ),
        value: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Base folder or URL. Absolute filesystem path or file:///…/ or https://…/ — MCP normalizes and URL-encodes. Document link URLs must start with this value for UI matching.",
          ),
        body: jsonBody
          .optional()
          .describe(
            "Full body: { key, value, titles: { [languageId]: { title } } }. Overrides shorthand fields when set.",
          ),
      },
    },
    async (args) =>
      runMutatingTool(ctx, args.repositoryId, async () => {
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
        'Create a description type (syfte/scope/ägare). Minimum that works: titles + dataType se.conciliate.rich.text + inputType rich-text-editor + connectedTo[{type:PROCESS|ACTIVITY|…,position,hidden:""}]. Shorthand title+languageId fills those defaults. Do NOT send entries (400). Missing connectedTo → 400 Entries cannot be null.',
      inputSchema: {
        repositoryId,
        languageId: languageId.optional(),
        title: z.string().min(1).optional().describe("Shorthand: builds titles for languageId"),
        connectedTo: z
          .array(
            z.object({
              type: z.string().describe("Object/model type id, e.g. PROCESS, ACTIVITY"),
              position: z.number().int().optional(),
              hidden: z.string().optional(),
            }),
          )
          .optional()
          .describe("Where the field appears; defaults to PROCESS+ACTIVITY+BUSINESS_OBJECT"),
        body: jsonBody
          .optional()
          .describe(
            "Full DTO — titles required if title omitted; server fills dataType/inputType/connectedTo",
          ),
      },
    },
    async (args) =>
      runMutatingTool(ctx, args.repositoryId, async () => {
        let body = args.body ? { ...args.body } : undefined;
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
        if (args.connectedTo?.length) {
          body.connectedTo = args.connectedTo.map((c) => ({
            type: c.type,
            position: c.position ?? 1,
            hidden: c.hidden ?? "",
          }));
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.updateCanvasEdges(args)),
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.deleteCanvasEdges(args)),
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
    async (args) =>
      runMutatingTool(ctx, args.repositoryId, () => writer.deleteCanvasVertices(args)),
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
      runMutatingTool(ctx, id, () =>
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
      runMutatingTool(ctx, args.repositoryId, () =>
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
      runMutatingTool(ctx, args.repositoryId, () =>
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
      runMutatingTool(ctx, args.repositoryId, () =>
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
      runMutatingTool(ctx, id, () =>
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
      runMutatingTool(ctx, args.repositoryId, () =>
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.addProcessStep(args)),
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.reuseSymbol(args)),
  );

  server.registerTool(
    "set_activity_performer",
    {
      description:
        "Link a role/position/organisation as performer of one activity (RACI_RESPONSIBLE). Places under the activity (reuses symbol UUID). Omit x/y to auto-place: first satellite centered, further ones nest to the right (same on spine and side branches). Never one canvas role to multiple activities.",
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
    async (args) =>
      runMutatingTool(ctx, args.repositoryId, () => writer.setActivityPerformer(args)),
  );

  server.registerTool(
    "set_activity_used_by",
    {
      description:
        "Link an application or step-specific mall/blankett to one activity (IS_USED_BY). Omit x/y: nests to the RIGHT of an existing role/satellite under that activity (never on top of the role) — same packing on main path and vägval side branches. Prefer over create_canvas_edge. Process-wide docs → link_document on the process symbol.",
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.setActivityUsedBy(args)),
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.setActivityControls(args)),
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.setStepIo(args)),
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.placeInSwimlane(args)),
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.createBreakdown(args)),
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.linkBreakdown(args)),
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
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.deleteBreakdown(args)),
  );

  server.registerTool(
    "create_process_map",
    {
      description:
        "Create a process map / overview. PREFERRED: detailModelIds (or layout.coreDetailModelIds for threeBand) — server derives BO↔process chain from detail scopes. Peers without shared BO → layout.mode=peerRows (not parallelTracks/linear). threeBand L0: coreDetailModelIds = linear shared-BO spine; coreProcessIds = peer L1/areas as core-band chevrons without FLOW (no shared BO); managementProcessIds/supportProcessIds = ledning/stöd bands without FLOW. Append bands: modelId + support/management/coreProcessIds, omit detailModelIds/chain. Do NOT invent overview BOs.",
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
              .enum(["linear", "parallelTracks", "threeBand", "peerRows"])
              .optional()
              .describe(
                "Default linear. peerRows = one row per detailModelId without shared BO. threeBand = L0 ledning/kärna/stöd. parallelTracks = fan-out from shared BO.",
              ),
            managementProcessIds: z
              .array(uuid)
              .optional()
              .describe(
                "Detail (or L1) model UUIDs for top band — chevrons, no FLOW, no shared BO required between them",
              ),
            coreDetailModelIds: z
              .array(uuid)
              .optional()
              .describe(
                "Middle FLOW spine only — must share handoff BOs. Used as detailModelIds when that is omitted",
              ),
            coreProcessIds: z
              .array(uuid)
              .optional()
              .describe(
                "Peer L1/area models as core-band chevrons without FLOW (no shared BO required). Prefer over putting kärna in support band. Band-append OK with modelId alone.",
              ),
            supportProcessIds: z
              .array(uuid)
              .optional()
              .describe(
                "Detail (or L1) model UUIDs for bottom band — chevrons, no FLOW. Band-append: pass with modelId alone (omit chain)",
              ),
          })
          .optional(),
        permissionGroup: permissionGroupHeader,
        owner: uuid.optional(),
        group: uuid.optional(),
        modelId: uuid.optional().describe("Append to existing model; otherwise creates new"),
      },
    },
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.createProcessMap(args)),
  );

  server.registerTool(
    "link_document",
    {
      description:
        "Create/update an MT document and/or attach to a symbol. PRIMARY: documentRootKey + relativePath + title + languageId (+ optional titles map for other languages) — stores a FULL absolute file:/// or https URL. Same absolute URL reuses the existing mt.documents id (no duplicate UUIDs for one file). content/URL is per language like titles: set every active language or secondary GUI languages get empty non-clickable links. Prefer titles:{ [langId]: title } so the same absolute URL is written to all languages in one call. API prefix is NOT a document-root binding; after mass create the user matches paths to roots in the 2c8 UI. createDocumentBody must use absolute languages.*.content. Symbol PATCH: [{ id, source: 'mt.documents' }]. showInPanel defaults to false. Parallel link_document to the same symbolId are queued in MCP (per-symbol mutex) so document-panel merges do not race.",
      inputSchema: {
        repositoryId,
        symbolId: uuid.optional(),
        documentIds: z.array(z.string()).optional(),
        documentRootKey: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Existing document root key — MCP joins root.value + relativePath into a full absolute URL (does not set API prefix to this key).",
          ),
        relativePath: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Path under the root, e.g. '2. Hantera behov/file.pdf'. Joined with root value → full URL; segments URL-encoded.",
          ),
        title: z
          .string()
          .min(1)
          .optional()
          .describe("Document title for languageId when using documentRootKey + relativePath"),
        languageId: languageId
          .optional()
          .describe(
            "Primary language for title/content when using shorthand. Alone only fills that language — use titles for all languages.",
          ),
        titles: z
          .record(z.string(), z.string().min(1))
          .optional()
          .describe(
            "Optional map languageId → title. Same absolute URL written to every entry (plus languageId/title). Use for bilingual repos so SV/EN both get clickable links.",
          ),
        documentTypeIds: z
          .array(z.string())
          .optional()
          .describe("Optional document type UUIDs for shorthand create"),
        type: z
          .enum(["file", "URL"])
          .optional()
          .describe("MT document type; defaults to file when using documentRootKey + relativePath"),
        createDocumentBody: jsonBody
          .optional()
          .describe(
            "Full POST mt-documents body. languages.*.content must be absolute https:// or file:///… for each language you care about. Do not rely on API prefix for roots.",
          ),
        updateDocumentId: uuid.optional(),
        updateDocumentBody: jsonBody
          .optional()
          .describe(
            "PATCH body. To fill empty secondary-language URLs, set languages.<langId>.{ title, content } with the same absolute URL.",
          ),
      },
    },
    async (args) =>
      runMutatingTool(ctx, args.repositoryId, async () => {
        const results: Record<string, unknown> = {};
        let linked = false;

        let createBody = args.createDocumentBody ? { ...args.createDocumentBody } : undefined;
        if (!createBody && args.documentRootKey && args.relativePath) {
          const titlesMap = args.titles ?? {};
          const primaryLanguageId =
            args.languageId ?? Object.keys(titlesMap).find((id) => titlesMap[id]?.trim());
          const primaryTitle =
            (args.languageId && args.title) ||
            (primaryLanguageId ? titlesMap[primaryLanguageId] : undefined) ||
            args.title;
          if (!primaryLanguageId || !primaryTitle) {
            throw new Error(
              "link_document shorthand requires documentRootKey + relativePath + (title + languageId) and/or titles map with at least one language",
            );
          }
          const { roots } = await ctx.documents.listRoots(args.repositoryId);
          const root = roots.find((r) => r.key === args.documentRootKey);
          if (!root?.value) {
            throw new Error(
              `No document root with key "${args.documentRootKey}". Call create_document_root / list_document_roots first.`,
            );
          }
          const extraTitles: Record<string, string> = { ...titlesMap };
          if (args.languageId && args.title) {
            extraTitles[args.languageId] = args.title;
          }
          createBody = buildAbsoluteDocumentBody({
            documentRootValue: root.value,
            relativePath: args.relativePath,
            title: primaryTitle,
            languageId: primaryLanguageId,
            type: args.type,
            documentTypes: args.documentTypeIds,
            extraTitles,
          });
          const languageCount = Object.keys(
            (createBody.languages as Record<string, unknown>) ?? {},
          ).length;
          results.documentRoot = {
            key: root.key,
            value: root.value,
            note: "Full absolute URL stored on the document. Bind to this root in the 2c8 UI (match paths) after create.",
          };
          results.languagesWritten = languageCount;
          if (languageCount < 2) {
            results.languageWarning =
              "Only one language got content/URL. In bilingual repos pass titles:{ [enId]:…, [svId]:… } (same file → same absolute URL) or secondary languages will show empty links.";
          }
        } else if (
          !createBody &&
          (args.documentRootKey || args.relativePath) &&
          !(args.documentRootKey && args.relativePath)
        ) {
          throw new Error(
            "link_document: documentRootKey and relativePath must be provided together (with title + languageId and/or titles)",
          );
        }

        if (createBody) {
          const upsert = await ctx.documents.createOrReuseMtDocument(args.repositoryId, createBody);
          results.created = upsert.document;
          results.reused = upsert.reused;
          results.documentId = upsert.documentId;
          if (upsert.matchedUrl) {
            results.matchedUrl = upsert.matchedUrl;
          }
          if (upsert.reused) {
            results.dedupeNote =
              "Existing MT document with the same absolute content URL was reused — no new UUID minted.";
          }
          const createdId = upsert.documentId;
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
            "Workflow: (1) create_document_root (2) link_document with full absolute URLs for every language (shorthand titles map joins root.value + relativePath into each languages.*.content) (3) user runs 2c8 UI match to bind paths to the root.",
            "Same absolute URL → reuse existing mt.documents id (response.reused=true + documentId). Prefer storing that UUID in CATALOG/STATE; later attaches may use documentIds:[id] only.",
            "content/URL is language-specific like titles — one languageId alone leaves other languages with empty GUI links.",
            "API prefix is not a document-root foreign key — do not set prefix to the root key for binding.",
            "Document symbol links use { id, source: 'mt.documents' }. Empty HTTP 200 from PATCH is success.",
            "Same-symbol link/unlink is serialized in MCP (parallel calls to different symbols still run concurrently).",
            "After create/update: verify_document_links without languageId (checks all repo languages).",
          ],
          nextSuggestedTools: [
            "get_object_documents",
            "resolve_documents",
            "verify_document_links",
          ],
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
      runMutatingTool(ctx, args.repositoryId, () =>
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
        "Mark existing titles as translated (translated:true) without changing text — symbols, models, and canvas edge labels (Ja/Nej etc.). Clears GUI globes ONLY. Does NOT translate: if secondary text is still English, use update_titles with real target-language strings first. Pass languageId (e.g. Swedish).",
      inputSchema: {
        repositoryId,
        languageId,
        includeModels: z.boolean().optional().describe("Also confirm model titles (default true)"),
        maxSymbols: z.number().int().positive().optional(),
      },
    },
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.confirmTranslations(args)),
  );

  server.registerTool(
    "update_titles",
    {
      description:
        "Update model/symbol/edge-label titles (translations). Writes title + rawTitle and sets translated:true (clears GUI globe). Prefer items[] to batch in ONE call. Canvas Ja/Nej labels: items[{ modelId, edgeId, title }] (edgeId from describe_process outgoing[].edgeId).",
      inputSchema: {
        repositoryId,
        languageId: languageId
          .optional()
          .describe("Default language for single or items without per-item languageId"),
        title: z.string().min(1).optional().describe("Title for single-target update"),
        modelId: uuid.optional(),
        symbolId: uuid.optional(),
        edgeId: uuid.optional().describe("Canvas edge UUID; requires modelId"),
        titles: z
          .record(z.string(), z.string())
          .optional()
          .describe("Optional extra languageId → title entries in the same call"),
        items: z
          .array(
            z.object({
              modelId: uuid.optional(),
              symbolId: uuid.optional(),
              edgeId: uuid.optional().describe("Canvas edge; requires modelId"),
              title: z.string().min(1),
              languageId: languageId.optional(),
              titles: z.record(z.string(), z.string()).optional(),
            }),
          )
          .max(100)
          .optional()
          .describe(
            "Batch: [{ symbolId, title }] | [{ modelId, title }] | [{ modelId, edgeId, title }] — max 100 items",
          ),
      },
    },
    async (args) => runMutatingTool(ctx, args.repositoryId, () => writer.updateTitles(args)),
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
      runMutatingTool(ctx, id, () =>
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
      description:
        "Create or update a symbol description. For activities: short purpose/why/caveats from sources only — do not restate RACI, documents, or BO in/out (get_methodology topic activity → descriptionGuidance). Skip if sources lack that text.",
      inputSchema: {
        repositoryId,
        symbolId: uuid,
        descriptionTypeId: uuid,
        body: jsonBody,
      },
    },
    async ({ repositoryId: id, symbolId, descriptionTypeId, body }) =>
      runMutatingTool(ctx, id, () =>
        ctx.client.request({
          method: "PATCH",
          path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}/descriptions/{descriptionTypeId}",
          pathParams: { repositoryId: id, symbolId, descriptionTypeId },
          body,
        }),
      ),
  );
}
