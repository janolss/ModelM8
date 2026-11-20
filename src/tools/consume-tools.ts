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
        "Primary tool for 'what happens in process X?': returns inputs → activities (with responsible + applications) → outputs, plus summaryText in Swedish. Prefer this over many raw flow/symbol calls.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Model UUID"),
      },
    },
    async (args) => runTool(() => ctx.reader.describeProcess(args)),
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
        "List breakdowns (nedbrytningar) for a model — navigation from high-level process to detail.",
      inputSchema: {
        repositoryId,
        modelId: uuid.describe("Model UUID"),
      },
    },
    async (args) => runTool(() => ctx.reader.getBreakdowns(args)),
  );

  server.registerTool(
    "search_symbols",
    {
      description:
        "Search reusable symbols by title and/or objectType. Pass modelId to search only symbols placed on that model. ALWAYS call before creating a new symbol (reuse-first).",
      inputSchema: {
        repositoryId,
        query: z.string().optional().describe("Title substring"),
        objectType: z.string().optional().describe("Object type filter"),
        modelId: uuid
          .optional()
          .describe("Limit search to symbols on this model canvas"),
        startAt: pagination.startAt,
        maxResults: pagination.maxResults,
      },
    },
    async (args) => runTool(() => ctx.reader.searchSymbols(args)),
  );

  server.registerTool(
    "list_document_roots",
    {
      description: "List document roots in a repository",
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
}
