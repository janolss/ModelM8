import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";
import { repositoryId, uuid } from "./schemas.js";

export function registerQualityTools(
  server: McpServer,
  ctx: ToolContext,
): void {
  server.registerTool(
    "list_untranslated_symbols",
    {
      description:
        "List symbols missing or not marked translated for a languageId. Reasons: missing, not-marked (translated!==true → GUI globe), or same as compareLanguageId with Swedish chars. Use confirm_translations to clear globes without rewriting text.",
      inputSchema: {
        repositoryId,
        languageId: uuid.describe("Language to check (e.g. English)"),
        compareLanguageId: uuid
          .optional()
          .describe(
            "Usually primary/default language; flags titles identical to this with åäö",
          ),
        objectType: z.string().optional(),
        maxResults: z.number().int().positive().optional(),
      },
    },
    async (args) => runTool(() => ctx.quality.listUntranslatedSymbols(args)),
  );

  server.registerTool(
    "list_orphan_symbols",
    {
      description:
        "List symbols not placed on any model canvas (orphans). Useful for ZZ_UTGÅR cleanup and reuse-first audits. Canvas-only — documents panel / breakdowns may still reference symbols.",
      inputSchema: {
        repositoryId,
        languageId: uuid
          .optional()
          .describe("Preferred language for title pick"),
        titlePrefix: z
          .string()
          .optional()
          .describe('Filter titles starting with prefix, e.g. "ZZ_"'),
        objectType: z.string().optional(),
        includeUsedOnCanvas: z
          .boolean()
          .optional()
          .describe("Default false — only orphans; true also returns used"),
        maxResults: z.number().int().positive().optional(),
      },
    },
    async (args) => runTool(() => ctx.quality.listOrphanSymbols(args)),
  );

  server.registerTool(
    "verify_handoffs",
    {
      description:
        "Verify process handoffs: each BO (symbolId or title) must appear on producer and consumer. Provide handoffs[] and/or contract[] (producer/consumer aliases) and/or autoDiscover.modelIds (pairwise primary outputs ∩ inputs). Default also checks FLOW I/O via get_detail_process_scope.",
      inputSchema: {
        repositoryId,
        handoffs: z
          .array(
            z.object({
              fromModelId: uuid,
              toModelId: uuid,
              symbolId: uuid.optional(),
              title: z.string().optional(),
              checkIo: z
                .boolean()
                .optional()
                .describe("Default true — require output on from and input on to"),
            }),
          )
          .optional(),
        contract: z
          .array(
            z.object({
              producerModelId: uuid,
              consumerModelId: uuid,
              symbolId: uuid.optional(),
              title: z.string().optional(),
              checkIo: z.boolean().optional(),
            }),
          )
          .optional()
          .describe("IMS handoff-contract alias for handoffs[]"),
        autoDiscover: z
          .object({
            modelIds: z.array(uuid).min(2),
            checkIo: z
              .boolean()
              .optional()
              .describe("Default true for discovered pairs"),
          })
          .optional()
          .describe(
            "Derive checks from primary outputs(A) ∩ inputs(B) for each ordered pair",
          ),
      },
    },
    async (args) => runTool(() => ctx.quality.verifyHandoffs(args)),
  );

  server.registerTool(
    "get_navigation_tree",
    {
      description:
        "Build model navigation L0→… from detail broken-down-from links. Prefer this over get_breakdowns(overview) which is often empty. Reports missingUpwardLinks.",
      inputSchema: {
        repositoryId,
        rootModelId: uuid
          .optional()
          .describe("Optional L0 / root model UUID to anchor the tree"),
      },
    },
    async (args) => runTool(() => ctx.quality.getNavigationTree(args)),
  );

  server.registerTool(
    "verify_process_coverage",
    {
      description:
        "Map expected process register rows (code / title / titleContains) to models. Optional rootModelId checks reachability via get_navigation_tree. Agent supplies expected[] from the register — tool does not parse documents.",
      inputSchema: {
        repositoryId,
        expected: z
          .array(
            z.object({
              code: z.string().optional(),
              title: z.string().optional(),
              titleContains: z.string().optional(),
            }),
          )
          .min(1),
        rootModelId: uuid.optional(),
      },
    },
    async (args) => runTool(() => ctx.quality.verifyProcessCoverage(args)),
  );
}
