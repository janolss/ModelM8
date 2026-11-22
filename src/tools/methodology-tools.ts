import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { resolveBranchingObjectType } from "../domain/branching-resolve.js";
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
    "resolve_branching_object_type",
    {
      description:
        "REQUIRED before creating a branch/choice symbol. Translates agent jargon (gateway, vägval, decision, xor, parallel, …) into the real 2c8 methodology object type. 2c8 has NO gateway type — exclusive choice = Regel (Eller) objectType \"or\"; parallel = Regel (Och) objectType \"and\". Join is forbidden. Pass ask (or query) e.g. {\"ask\":\"gateway\"} or {\"query\":\"gateway\"}.",
      inputSchema: {
        ask: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Preferred: what the agent wants, e.g. gateway, vägval, decision, xor, parallel, and, eller, och",
          ),
        query: z
          .string()
          .min(1)
          .optional()
          .describe("Alias for ask — many agents send query instead of ask"),
        topic: z
          .string()
          .min(1)
          .optional()
          .describe("Alias for ask"),
      },
    },
    async (args) =>
      runTool(async () => {
        const ask = (args.ask ?? args.query ?? args.topic ?? "").trim();
        if (!ask) {
          throw new Error(
            'resolve_branching_object_type requires ask (or query/topic), e.g. {"ask":"gateway"} or {"query":"vägval"}.',
          );
        }
        return {
          ...resolveBranchingObjectType(ask),
          methodologyNotes: [
            "2c8 methodology object types for branching are only: or (Regel Eller / vägval) and and (Regel Och).",
            'Never create objectType "gateway" or "join".',
            "Pass useObjectType from this tool into add_process_step / propose chain / apply_model_proposal.",
          ],
        };
      }),
  );

  server.registerTool(
    "get_methodology",
    {
      description:
        "Load 2c8 methodology for a topic. For branching ALWAYS prefer resolve_branching_object_type first (gateway→or). Topics: vägval, or, and, process, naming, …",
      inputSchema: {
        topic: z
          .string()
          .min(1)
          .describe(
            "e.g. vägval, or, and, process, process-map, activity, naming, business-objects, reuse-first",
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
        "Compact list of allowed model/object types for a repository. Prefer get_methodology + validate_against_methodology for normal text-to-model — only call this when confirming an unfamiliar type id. Set includeRawConfig=true only if you need the full configuration dump.",
      inputSchema: {
        repositoryId,
        includeRawConfig: z
          .boolean()
          .optional()
          .describe("Include full rawConfiguration (very large). Default false."),
      },
    },
    async ({ repositoryId: id, includeRawConfig }) =>
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
          ...(includeRawConfig ? { rawConfiguration: config } : {}),
          nextSuggestedTools: [
            "get_methodology",
            "validate_against_methodology",
            "find_models",
          ],
        };
      }),
  );

  server.registerTool(
    "validate_against_methodology",
    {
      description:
        "Validate a proposed symbol (objectType + title) against naming rules and repository configuration before write. For businessObject, pass previousActivityTitle to detect status-echo names.",
      inputSchema: {
        repositoryId: repositoryId.optional(),
        objectType: z.string().min(1),
        title: z.string().min(1),
        previousActivityTitle: z
          .string()
          .optional()
          .describe(
            "When objectType is businessObject: preceding activity title, to flag status echoes like 'Godkänd X' after 'Godkänna X'",
          ),
      },
    },
    async ({ repositoryId: id, objectType, title, previousActivityTitle }) =>
      runTool(async () => {
        const repoConfig = id
          ? await loadRepoConfiguration(ctx.client, id)
          : null;
        const result = validateProposedSymbol(ctx.pack, {
          objectType,
          title,
          repoConfig,
          previousActivityTitle,
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
