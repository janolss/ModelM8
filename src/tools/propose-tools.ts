import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  normalizeProposal,
  proposeModelFromDocument,
  proposeModelFromText,
  type ModelProposal,
} from "../domain/proposals.js";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";
import {
  languageId,
  permissionGroupHeader,
  repositoryId,
  uuid,
} from "./schemas.js";

const proposedStepSchema = z.object({
  title: z.string(),
  objectType: z.string(),
  performerTitle: z.string().optional(),
  performers: z.array(z.string()).optional(),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  documents: z.array(z.string()).optional(),
  controlledBy: z.array(z.string()).optional(),
  usedBy: z.array(z.string()).optional(),
});

const chainNodeSchema = z.object({
  kind: z.enum(["businessObject", "activity", "gateway", "and"]),
  title: z.string(),
  objectType: z.string(),
});

const activityDetailSchema = z.object({
  title: z.string(),
  performers: z.array(z.string()).default([]),
  controlledBy: z.array(z.string()).default([]),
  usedBy: z.array(z.string()).default([]),
  usedByTypes: z.record(z.string(), z.string()).optional(),
});

const branchSchema = z.object({
  fromTitle: z.string().describe("Vägval / gateway / decision title"),
  label: z.string().optional().describe("FLOW edge label, e.g. Ja / Nej"),
  toTitle: z.string(),
  toKind: z
    .enum(["businessObject", "activity", "gateway", "and", "process"])
    .optional(),
  objectType: z.string().optional(),
});

const proposalSchema = z.object({
  modelType: z.string(),
  title: z.string(),
  processTitle: z.string().optional(),
  chain: z.array(chainNodeSchema).optional(),
  activities: z.array(activityDetailSchema).optional(),
  branches: z
    .array(branchSchema)
    .optional()
    .describe("Gateway branches with optional Ja/Nej edge labels"),
  steps: z.array(proposedStepSchema),
  methodologyNotes: z.array(z.string()).optional(),
  namingChecks: z
    .array(
      z.object({
        title: z.string(),
        objectType: z.string(),
        pass: z.boolean(),
        hint: z.string().optional(),
      }),
    )
    .optional(),
  nextSuggestedTools: z.array(z.string()).optional(),
});

export function registerProposeTools(
  server: McpServer,
  ctx: ToolContext,
): void {
  server.registerTool(
    "propose_model_from_text",
    {
      description:
        "Text-to-model → FLOW + RACI/CONTROLS/IS_USED_BY + vägval branches. Prefixed: 'Vägval: Finns X?' / 'Ja: …' / 'Nej: …'. Exclusive choice objectType is \"or\" (Regel Eller) — call resolve_branching_object_type first. NEVER gateway or join.",
      inputSchema: {
        text: z.string().min(1),
        modelType: z.string().optional().describe("Defaults to process"),
      },
    },
    async ({ text, modelType }) =>
      runTool(async () =>
        proposeModelFromText(ctx.pack, text, modelType ?? "process"),
      ),
  );

  server.registerTool(
    "propose_model_from_document",
    {
      description:
        "Document-to-model: extract a candidate process from document text/URL metadata (no writes).",
      inputSchema: {
        text: z.string().min(1).describe("Document body or extracted text"),
        title: z.string().optional(),
        sourceUrl: z.string().optional(),
      },
    },
    async (args) =>
      runTool(async () => proposeModelFromDocument(ctx.pack, args)),
  );

  server.registerTool(
    "propose_process_map_from_models",
    {
      description:
        "Propose overview chain FROM detail scopes only (get_detail_process_scope per model). BO titles/symbolIds come from detail inputs/outputs — never invent. Review readyForCreate, then create_process_map({ detailModelIds: same list }).",
      inputSchema: {
        repositoryId,
        modelIds: z
          .array(uuid)
          .min(1)
          .describe("Detail process model UUIDs to place on the overview"),
        title: z.string().optional().describe("Suggested overview title"),
      },
    },
    async (args) =>
      runTool(() => ctx.reader.proposeProcessMapFromModels(args)),
  );

  server.registerTool(
    "validate_process_map_bridges",
    {
      description:
        "Validate overview SCOPE: each process's left/right BO must match that detail's inputs/outputs; handoff BO = prev OUTPUT ∩ next INPUT (same symbol). Call before create if building chain manually; prefer create_process_map(detailModelIds) instead.",
      inputSchema: {
        repositoryId,
        chain: z
          .array(
            z.object({
              kind: z.enum(["businessObject", "process"]),
              title: z.string().min(1),
              symbolId: uuid.optional(),
              detailModelId: uuid.optional(),
            }),
          )
          .min(1),
      },
    },
    async (args) =>
      runTool(() => ctx.reader.validateProcessMapBoBridges(args)),
  );

  if (ctx.writer) {
    server.registerTool(
      "apply_model_proposal",
      {
        description:
          "Apply proposal: FLOW (BO↔activity↔or/vägval), branches with Ja/Nej, RACI/CONTROLS/IS_USED_BY. Exclusive choice creates as objectType or (Regel Eller). NEVER gateway/join.",
        inputSchema: {
          repositoryId,
          languageId,
          proposal: proposalSchema,
          modelId: uuid
            .optional()
            .describe("Existing model to append to; otherwise creates new"),
          permissionGroup: permissionGroupHeader,
          owner: uuid.optional(),
          group: uuid.optional(),
        },
      },
      async (args) =>
        runTool(() => {
          const proposal = normalizeProposal(args.proposal as ModelProposal);
          return ctx.writer!.applyProposal({
            repositoryId: args.repositoryId,
            languageId: args.languageId,
            proposal,
            modelId: args.modelId,
            permissionGroup: args.permissionGroup,
            owner: args.owner,
            group: args.group,
          });
        }),
    );
  }
}
