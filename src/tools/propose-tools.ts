import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
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
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  documents: z.array(z.string()).optional(),
});

const proposalSchema = z.object({
  modelType: z.string(),
  title: z.string(),
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
        "Text-to-model: parse free text into a structured process proposal (no writes). Review, search_symbols, validate, then apply_model_proposal.",
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

  if (ctx.writer) {
    server.registerTool(
      "apply_model_proposal",
      {
        description:
          "Apply a previously proposed process model (batch write with reuse-first step creation). Prefer draft write mode.",
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
          const proposal = args.proposal as ModelProposal;
          return ctx.writer!.applyProposal({
            repositoryId: args.repositoryId,
            languageId: args.languageId,
            proposal: {
              modelType: proposal.modelType,
              title: proposal.title,
              steps: proposal.steps,
              methodologyNotes: proposal.methodologyNotes ?? [],
              namingChecks: proposal.namingChecks ?? [],
              nextSuggestedTools: proposal.nextSuggestedTools ?? [],
            },
            modelId: args.modelId,
            permissionGroup: args.permissionGroup,
            owner: args.owner,
            group: args.group,
          });
        }),
    );
  }
}
