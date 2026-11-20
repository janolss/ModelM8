import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  extractAllowedTypes,
  getMethodologyTopic,
  loadRepoConfiguration,
  validateProposedSymbol,
} from "../methodology/rules-engine.js";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";
import { repositoryId } from "./schemas.js";

export function registerMethodologyTools(
  server: McpServer,
  ctx: ToolContext,
): void {
  server.registerTool(
    "get_methodology",
    {
      description:
        "Load 2c8 methodology guidance for a topic (object type, model type, rule, documents, structure). Use before modeling decisions.",
      inputSchema: {
        topic: z
          .string()
          .min(1)
          .describe(
            "e.g. process, activity, role, swimlane, naming, reuse-first, document-links, breakdowns",
          ),
      },
    },
    async ({ topic }) =>
      runTool(async () => getMethodologyTopic(ctx.pack, topic)),
  );

  server.registerTool(
    "list_allowed_types",
    {
      description:
        "List model/object types allowed by the repository configuration (runtime source of truth). Falls back to methodology pack phase-1 types if configuration is unavailable.",
      inputSchema: { repositoryId },
    },
    async ({ repositoryId: id }) =>
      runTool(async () => {
        const config = await loadRepoConfiguration(ctx.client, id);
        const extracted = config ? extractAllowedTypes(config) : null;
        return {
          repositoryId: id,
          fromConfiguration: Boolean(config),
          allowed: extracted,
          methodologyPhase1: {
            modelTypes: ctx.pack.modelTypes
              .filter((m) => m.phase1)
              .map((m) => m.id),
            objectTypes: ctx.pack.objectTypes
              .filter((o) => o.phase1)
              .map((o) => o.id),
          },
          rawConfiguration: config,
          nextSuggestedTools: ["get_methodology", "find_models"],
        };
      }),
  );

  server.registerTool(
    "validate_against_methodology",
    {
      description:
        "Validate a proposed symbol (objectType + title) against naming rules and repository configuration before write.",
      inputSchema: {
        repositoryId: repositoryId.optional(),
        objectType: z.string().min(1),
        title: z.string().min(1),
      },
    },
    async ({ repositoryId: id, objectType, title }) =>
      runTool(async () => {
        const repoConfig = id
          ? await loadRepoConfiguration(ctx.client, id)
          : null;
        const result = validateProposedSymbol(ctx.pack, {
          objectType,
          title,
          repoConfig,
        });
        return {
          ...result,
          nextSuggestedTools: result.ok
            ? ["search_symbols", "add_process_step"]
            : ["get_methodology"],
        };
      }),
  );

  server.registerTool(
    "get_api_versions",
    {
      description: "Get backend/API version information",
      inputSchema: {},
    },
    async () =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/versions",
        }),
      ),
  );
}
