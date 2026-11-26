import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";
import { repositoryId, uuid } from "./schemas.js";

export function registerQualityTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_untranslated_symbols",
    {
      description:
        "List symbols missing or not marked translated for a languageId. Reasons: missing, not-marked (globe), same-as-compare (identical to compareLanguageId — needs real update_titles, not confirm_translations alone), same-as-compare-with-swedish-chars. Pass compareLanguageId (=primary) for Q6 fidelity.",
      inputSchema: {
        repositoryId,
        languageId: uuid.describe("Language to check (e.g. secondary / Swedish)"),
        compareLanguageId: uuid
          .optional()
          .describe("Primary language; flags identical titles (untranslated copies)"),
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
        languageId: uuid.optional().describe("Preferred language for title pick"),
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
        "Verify process handoffs: each BO (symbolId or title) must appear on producer and consumer. Provide handoffs[] and/or contract[] (producer/consumer aliases) and/or autoDiscover.modelIds (pairwise primary outputs ∩ inputs). Default checks FLOW I/O via get_detail_process_scope. Mid-spine shared BOs (not process terminals): set checkIo=false — UUID presence still verified.",
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
                .describe(
                  "Default true — require output on from and input on to. Use false for mid-spine handoffs (UUID on both models, not primary terminals).",
                ),
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
              checkIo: z.boolean().optional().describe("false = mid-spine handoff (UUID only)"),
            }),
          )
          .optional()
          .describe("IMS handoff-contract alias for handoffs[]"),
        autoDiscover: z
          .object({
            modelIds: z.array(uuid).min(2),
            checkIo: z.boolean().optional().describe("Default true for discovered pairs"),
          })
          .optional()
          .describe("Derive checks from primary outputs(A) ∩ inputs(B) for each ordered pair"),
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
        rootModelId: uuid.optional().describe("Optional L0 / root model UUID to anchor the tree"),
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

  server.registerTool(
    "verify_document_links",
    {
      description:
        "Verify MT document links resolve to absolute https:// or file:/// URLs. content/URL is per language — omit languageId to check ALL repo languages (default; catches empty SV while EN looks fine). Flags bare relative / invalid file:// / missing-link per language and optionally missing local files. Use after mass link_document / Q3–Q5. Fix: link_document with titles map (or updateDocumentBody languages.*.content) for every language. API prefix is not a root binding — user matches roots in 2c8 UI after create.",
      inputSchema: {
        repositoryId,
        languageId: uuid
          .optional()
          .describe(
            "Optional: check only this language. Omit to verify every repo language (recommended for bilingual repos).",
          ),
        documentIds: z
          .array(z.string())
          .optional()
          .describe("Optional subset of mt.documents ids; default = all keys"),
        requireRootsIfDocuments: z
          .boolean()
          .optional()
          .describe("Default true — fail if documents exist but no document roots"),
        checkFileExists: z
          .boolean()
          .optional()
          .describe("Default false — when true, probe file:/// with fs.existsSync"),
        maxResults: z.number().int().positive().optional().describe("Max findings (default 100)"),
      },
    },
    async (args) => runTool(() => ctx.quality.verifyDocumentLinks(args)),
  );
}
