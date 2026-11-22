import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";
import { pagination, repositoryId, uuid } from "./schemas.js";

export function registerConsumeTools(
  server: McpServer,
  ctx: ToolContext,
): void {
  server.registerTool(
    "list_repositories",
    {
      description: "List repositories available to the API key",
      inputSchema: { ...pagination },
    },
    async (args) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories",
          query: args,
        }),
      ),
  );

  server.registerTool(
    "get_repository",
    {
      description: "Get a repository by UUID",
      inputSchema: {
        repositoryId,
        fields: pagination.fields,
        projection: pagination.projection,
      },
    },
    async ({ repositoryId: id, ...query }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}",
          pathParams: { repositoryId: id },
          query,
        }),
      ),
  );

  server.registerTool(
    "find_models",
    {
      description:
        "Find process/swimlane models in a repository. Uses server-side title filter so matches outside the first page are found. Prefer this for process discovery.",
      inputSchema: {
        repositoryId,
        query: z.string().optional().describe("Title substring filter"),
        modelType: z
          .string()
          .optional()
          .describe("Model type filter, e.g. process or swimlane"),
        startAt: pagination.startAt,
        maxResults: pagination.maxResults,
      },
    },
    async (args) =>
      runTool(async () => ({
        ...(await ctx.reader.findModels(args)),
        nextSuggestedTools: ["describe_process", "get_process_overview"],
      })),
  );

  server.registerTool(
    "get_process_overview",
    {
      description:
        "Summary of a process/swimlane model: title, type, version, vertex/edge counts, layers.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Model UUID"),
      },
    },
    async (args) =>
      runTool(async () => ({
        data: await ctx.reader.getOverview(args),
        nextSuggestedTools: [
          "describe_process",
          "get_process_flow",
          "get_roles_and_responsibilities",
        ],
      })),
  );

  server.registerTool(
    "get_process_flow",
    {
      description:
        "Ordered process flow with titles, grouped relations (inputs/outputs/responsible/applications), and document names when present. Prefer describe_process for a ready-made narrative.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Model UUID"),
        includeDocuments: z
          .boolean()
          .optional()
          .describe("Resolve document titles when hasDocument (default true)"),
      },
    },
    async (args) =>
      runTool(async () => ({
        data: await ctx.reader.getFlow(args),
        methodologyNotes: [
          "Titles come from canvas labels (and symbol.titles when expanded).",
          "FLOW / RACI_RESPONSIBLE / IS_USED_BY edges are grouped per step.",
        ],
        nextSuggestedTools: [
          "describe_process",
          "get_roles_and_responsibilities",
        ],
      })),
  );

  server.registerTool(
    "describe_process",
    {
      description:
        "Primary tool for activity-level processes: inputs → activities (responsible + applications) → outputs, plus summaryText. For process maps / overviews (process chevrons, no activities), use describe_process_map instead (this tool will hint kind=process-map-candidate).",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Model UUID"),
      },
    },
    async (args) => runTool(() => ctx.reader.describeProcess(args)),
  );

  server.registerTool(
    "review_process_model",
    {
      description:
        "Post-create QA for a model: 2c8 methodology (activity/process BO in/out, performers, no join/gateway, no role fan-out) + visual layout (overlap, spine alignment, spacing, FLOW left-in/right-out, edge crossings, multi-I/O stacking). Call after apply_model_proposal / create_process_map before considering the work done. Optional detailModelIds for overview scope checks.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Model UUID to review"),
        detailModelIds: z
          .array(uuid)
          .optional()
          .describe(
            "For process maps: detail model UUIDs left→right to include scopeViolations",
          ),
      },
    },
    async (args) => runTool(() => ctx.reader.reviewProcessModel(args)),
  );

  server.registerTool(
    "describe_process_map",
    {
      description:
        "Describe a process map / overview: process chevrons + BOs on FLOW, side loops, breakdowns. Pass detailModelIds (left→right) to return scopeViolations when overview I/O ≠ detail I/O.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Overview model UUID"),
        detailModelIds: z
          .array(uuid)
          .optional()
          .describe(
            "Optional detail model UUIDs in main-chain order — enables scopeChecks/scopeViolations",
          ),
      },
    },
    async (args) => runTool(() => ctx.reader.describeProcessMap(args)),
  );

  server.registerTool(
    "get_detail_process_scope",
    {
      description:
        "Canonical inputs/outputs (with symbolIds) of a detail process model. REQUIRED before building an overview: the map must reuse these same BOs for that process — never invent different overview I/O.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Detail process model UUID"),
      },
    },
    async (args) => runTool(() => ctx.reader.getDetailProcessScope(args)),
  );

  server.registerTool(
    "get_roles_and_responsibilities",
    {
      description:
        "Extract performers and activities with responsible/application assignments already grouped.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Model UUID"),
      },
    },
    async (args) =>
      runTool(() => ctx.reader.getRolesAndResponsibilities(args)),
  );

  server.registerTool(
    "get_object_documents",
    {
      description:
        "List document links attached to a symbol and/or model. Provide symbolId and/or modelId.",
      inputSchema: {
        repositoryId,
        symbolId: uuid.optional().describe("Symbol UUID"),
        modelId: uuid.optional().describe("Model UUID"),
      },
    },
    async (args) =>
      runTool(async () => ({
        data: await ctx.reader.getObjectDocuments(args),
        methodologyNotes: [
          "Document links should be reachable by publication end users; prefer document roots for shared paths.",
        ],
        nextSuggestedTools: ["link_document", "resolve_symbols"],
      })),
  );

  server.registerTool(
    "resolve_symbols",
    {
      description:
        "Batch-resolve symbol UUIDs to { uuid, title, objectType, documents }. Prefer this over N× get_object_documents when enriching a flow.",
      inputSchema: {
        repositoryId,
        symbolIds: z
          .array(uuid)
          .min(1)
          .describe("Symbol UUIDs to resolve"),
      },
    },
    async (args) =>
      runTool(async () => ({
        ...(await ctx.reader.resolveSymbols(args)),
        nextSuggestedTools: ["get_process_flow", "reuse_symbol"],
      })),
  );

  server.registerTool(
    "find_symbol_usage",
    {
      description:
        "Where is this symbol used? Scans process models for a role/object (symbolId or titleQuery) and lists activities it is RACI-responsible for. Prefer this over calling get_roles_and_responsibilities on many models. enrich=full adds same-model inputs/outputs/controlledBy refs per activity.",
      inputSchema: {
        repositoryId,
        symbolId: uuid.optional(),
        titleQuery: z
          .string()
          .optional()
          .describe("e.g. Däckmontör — used if symbolId omitted"),
        enrich: z
          .enum(["basic", "full"])
          .optional()
          .describe("basic (default) = RACI titles; full = + inputs/outputs/doc refs"),
      },
    },
    async (args) => runTool(() => ctx.reader.findSymbolUsage(args)),
  );

  server.registerTool(
    "describe_role",
    {
      description:
        "Operational RACI view for a role: processes, responsible activities, IT-stöd, controlling documents, plus summaryText. For layered intro (HR + operational) use describe_role_introduction.",
      inputSchema: {
        repositoryId,
        symbolId: uuid.optional(),
        titleQuery: z.string().optional().describe("Role title, e.g. Däckmontör"),
      },
    },
    async (args) => runTool(() => ctx.reader.describeRole(args)),
  );

  server.registerTool(
    "describe_role_introduction",
    {
      description:
        "Methodology-layered introduction path for a role: (1) operationalCompetence via RACI, (2) formalIntroduction via HR/rekrytera CONTROLS docs (role often subject, not performer), (3) supportContext title-hints only. Does NOT invent role→checklist CONTROLS links.",
      inputSchema: {
        repositoryId,
        symbolId: uuid.optional(),
        titleQuery: z.string().optional().describe("Role title, e.g. Däckmontör"),
        enrichOperational: z
          .boolean()
          .optional()
          .describe("Default true: enrich operational usages with inputs/outputs"),
      },
    },
    async (args) => runTool(() => ctx.reader.describeRoleIntroduction(args)),
  );

  server.registerTool(
    "get_controlling_documents",
    {
      description:
        "Get CONTROLS/steering documents for activities in a model (optionally filter by activity title/vertex/symbol). E.g. Genomföra introduktion → Checklista onboarding.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        activityTitle: z.string().optional(),
        activityVertexId: uuid.optional(),
        activitySymbolId: uuid.optional(),
      },
    },
    async (args) => runTool(() => ctx.reader.getControllingDocuments(args)),
  );

  server.registerTool(
    "search_documents",
    {
      description:
        "Search MT documents by title/type substring (e.g. 'Checklista onboarding'). Returns resolved metadata + links.",
      inputSchema: {
        repositoryId,
        query: z.string().min(1),
        sourceId: z.string().optional().describe("Defaults to mt.documents"),
        languageId: uuid.optional(),
        maxResults: z.number().optional(),
      },
    },
    async (args) => runTool(() => ctx.documents.searchDocuments(args)),
  );

  server.registerTool(
    "resolve_documents",
    {
      description:
        "Resolve document keys/ids via documents/sources/{source}/documents/resolve to title, link and metadata.",
      inputSchema: {
        repositoryId,
        documentKeys: z.array(z.string()).min(1),
        sourceId: z.string().optional().describe("Defaults to mt.documents"),
        languageId: uuid.optional(),
      },
    },
    async (args) => runTool(() => ctx.documents.resolveDocuments(args)),
  );

  server.registerTool(
    "get_document_content",
    {
      description:
        "Resolve document(s) and extract text content when the link is readable (local file:// or http(s), including PDF). Use after search_documents / get_controlling_documents.",
      inputSchema: {
        repositoryId,
        documentId: z.string().optional(),
        documentKeys: z.array(z.string()).optional(),
        sourceId: z.string().optional(),
        languageId: uuid.optional(),
        maxChars: z.number().optional(),
      },
    },
    async (args) => runTool(() => ctx.documents.getDocumentContent(args)),
  );

  server.registerTool(
    "get_breakdowns",
    {
      description:
        "List broken-down-from links for a DETAIL model (parent overview symbol). Overview models often return empty/404 — use get_navigation_tree(repositoryId) for L0→… navigation and missing links.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Detail model UUID (not the overview)"),
      },
    },
    async (args) => runTool(() => ctx.reader.getBreakdowns(args)),
  );

  server.registerTool(
    "search_symbols",
    {
      description:
        "Search symbols in THIS repository only (reuse-first; UUIDs are not valid across repos). Returns { total, symbols, items } — items is an alias for symbols. Param: query (title alias accepted). VÄGVAL: objectType=or|vägval|decision. NEVER join.",
      inputSchema: {
        repositoryId,
        query: z
          .string()
          .optional()
          .describe(
            "Title substring — or type alias or/vägval/gateway/decision (auto objectType filter)",
          ),
        title: z
          .string()
          .optional()
          .describe("Alias for query (same title substring search)"),
        objectType: z
          .string()
          .optional()
          .describe(
            "Filter: or|vägval|decision (exclusive), and (parallel), activity, businessObject, …",
          ),
        modelId: uuid
          .optional()
          .describe("Limit search to symbols on this model canvas"),
        startAt: pagination.startAt,
        maxResults: pagination.maxResults,
      },
    },
    async (args) =>
      runTool(() =>
        ctx.reader.searchSymbols({
          repositoryId: args.repositoryId,
          query: args.query ?? args.title,
          objectType: args.objectType,
          modelId: args.modelId,
          startAt: args.startAt,
          maxResults: args.maxResults,
        }),
      ),
  );

  server.registerTool(
    "list_document_roots",
    {
      description:
        "List document roots in a repository. A root is a shared base URL/folder for relative document links — update the root once when the host or library path moves.",
      inputSchema: { repositoryId },
    },
    async ({ repositoryId: id }) =>
      runTool(() => ctx.documents.listRoots(id)),
  );

  server.registerTool(
    "list_document_types",
    {
      description: "List document types used to categorise document links",
      inputSchema: { repositoryId },
    },
    async ({ repositoryId: id }) =>
      runTool(() => ctx.documents.listTypes(id)),
  );

  server.registerTool(
    "list_document_sources",
    {
      description: "List document sources available in a repository",
      inputSchema: { repositoryId },
    },
    async ({ repositoryId: id }) =>
      runTool(() => ctx.documents.listSources(id)),
  );

  server.registerTool(
    "list_directories",
    {
      description: "List directories",
      inputSchema: { ...pagination },
    },
    async (args) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/directories",
          query: args,
        }),
      ),
  );

  server.registerTool(
    "get_directory",
    {
      description: "Get a directory by UUID",
      inputSchema: {
        directoryId: uuid.describe("Directory UUID"),
        fields: pagination.fields,
        projection: pagination.projection,
      },
    },
    async ({ directoryId, ...query }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/directories/{directoryId}",
          pathParams: { directoryId },
          query,
        }),
      ),
  );

  server.registerTool(
    "list_languages",
    {
      description: "List languages configured for a repository",
      inputSchema: { repositoryId },
    },
    async ({ repositoryId: id }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/languages",
          pathParams: { repositoryId: id },
        }),
      ),
  );

  server.registerTool(
    "list_description_types",
    {
      description: "List description types in a repository",
      inputSchema: { repositoryId },
    },
    async ({ repositoryId: id }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/description-types",
          pathParams: { repositoryId: id },
        }),
      ),
  );

  server.registerTool(
    "get_model_descriptions",
    {
      description:
        "Read model description(s) — syfte/scope/ägare/ISO etc. Omit descriptionTypeId to list all; set it for one type. Pair with list_description_types / update_model_description.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        descriptionTypeId: uuid.optional(),
      },
    },
    async ({ repositoryId: id, modelId, descriptionTypeId }) =>
      runTool(() =>
        descriptionTypeId
          ? ctx.client.request({
              path: "/api/v1/repositories/{repositoryId}/models/{modelId}/descriptions/{descriptionTypeId}",
              pathParams: {
                repositoryId: id,
                modelId,
                descriptionTypeId,
              },
            })
          : ctx.client.request({
              path: "/api/v1/repositories/{repositoryId}/models/{modelId}/descriptions",
              pathParams: { repositoryId: id, modelId },
            }),
      ),
  );

  server.registerTool(
    "get_symbol_descriptions",
    {
      description:
        "Read symbol description(s). Omit descriptionTypeId to list all; set it for one type. Pair with list_description_types / update_symbol_description.",
      inputSchema: {
        repositoryId,
        symbolId: uuid,
        descriptionTypeId: uuid.optional(),
      },
    },
    async ({ repositoryId: id, symbolId, descriptionTypeId }) =>
      runTool(() =>
        descriptionTypeId
          ? ctx.client.request({
              path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}/descriptions/{descriptionTypeId}",
              pathParams: {
                repositoryId: id,
                symbolId,
                descriptionTypeId,
              },
            })
          : ctx.client.request({
              path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}/descriptions",
              pathParams: { repositoryId: id, symbolId },
            }),
      ),
  );

  server.registerTool(
    "get_symbol_properties",
    {
      description:
        "Read symbol properties for a provider (OpenAPI: GET only — no write). Omit key to list provider bag; set key for one property.",
      inputSchema: {
        repositoryId,
        symbolId: uuid,
        providerId: z.string().min(1),
        key: z.string().min(1).optional(),
      },
    },
    async ({ repositoryId: id, symbolId, providerId, key }) =>
      runTool(() =>
        key
          ? ctx.client.request({
              path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}/properties/{providerId}/{key}",
              pathParams: { repositoryId: id, symbolId, providerId, key },
            })
          : ctx.client.request({
              path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}/properties/{providerId}",
              pathParams: { repositoryId: id, symbolId, providerId },
            }),
      ),
  );

  server.registerTool(
    "get_model_properties",
    {
      description:
        "Read model properties for a provider (OpenAPI: GET only — no write). Omit key to list provider bag; set key for one property.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        providerId: z.string().min(1),
        key: z.string().min(1).optional(),
      },
    },
    async ({ repositoryId: id, modelId, providerId, key }) =>
      runTool(() =>
        key
          ? ctx.client.request({
              path: "/api/v1/repositories/{repositoryId}/models/{modelId}/properties/{providerId}/{key}",
              pathParams: { repositoryId: id, modelId, providerId, key },
            })
          : ctx.client.request({
              path: "/api/v1/repositories/{repositoryId}/models/{modelId}/properties/{providerId}",
              pathParams: { repositoryId: id, modelId, providerId },
            }),
      ),
  );

  server.registerTool(
    "get_vertex_properties",
    {
      description:
        "Read canvas vertex properties for a provider (OpenAPI: GET only). Omit key to list; set key for one property.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        vertexId: uuid,
        providerId: z.string().min(1),
        key: z.string().min(1).optional(),
      },
    },
    async ({ repositoryId: id, modelId, vertexId, providerId, key }) =>
      runTool(() =>
        key
          ? ctx.client.request({
              path: "/api/v1/repositories/{repositoryId}/models/{modelId}/vertices/{vertexId}/properties/{providerId}/{key}",
              pathParams: {
                repositoryId: id,
                modelId,
                vertexId,
                providerId,
                key,
              },
            })
          : ctx.client.request({
              path: "/api/v1/repositories/{repositoryId}/models/{modelId}/vertices/{vertexId}/properties/{providerId}",
              pathParams: {
                repositoryId: id,
                modelId,
                vertexId,
                providerId,
              },
            }),
      ),
  );

  server.registerTool(
    "list_model_versions",
    {
      description: "List version history for a model.",
      inputSchema: { repositoryId, modelId: uuid },
    },
    async ({ repositoryId: id, modelId }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/versions",
          pathParams: { repositoryId: id, modelId },
        }),
      ),
  );

  server.registerTool(
    "get_model_version",
    {
      description: "Get one model version by version number.",
      inputSchema: {
        repositoryId,
        modelId: uuid,
        versionNumber: z.union([z.string(), z.number()]),
      },
    },
    async ({ repositoryId: id, modelId, versionNumber }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/versions/{versionNumber}",
          pathParams: {
            repositoryId: id,
            modelId,
            versionNumber: String(versionNumber),
          },
        }),
      ),
  );

  server.registerTool(
    "list_symbol_versions",
    {
      description: "List version history for a symbol (list only — no get-by-number in OpenAPI).",
      inputSchema: { repositoryId, symbolId: uuid },
    },
    async ({ repositoryId: id, symbolId }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}/versions",
          pathParams: { repositoryId: id, symbolId },
        }),
      ),
  );

  server.registerTool(
    "list_layers",
    {
      description:
        "List layers on a model. Also summarized in get_process_overview.",
      inputSchema: { repositoryId, modelId: uuid },
    },
    async ({ repositoryId: id, modelId }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/layers",
          pathParams: { repositoryId: id, modelId },
        }),
      ),
  );
}
