import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

export function registerMethodologyPrompts(server: McpServer): void {
  server.registerPrompt(
    "consume_process",
    {
      description:
        "Workflow to understand an existing 2c8 process model (flow, roles, documents, breakdowns).",
      argsSchema: {
        repositoryId: z.string(),
        modelId: z.string().optional(),
        titleQuery: z.string().optional(),
      },
    },
    ({ repositoryId, modelId, titleQuery }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Follow this order strictly:",
              "1) get_methodology topic=process (optional context)",
              modelId
                ? `2) describe_process for repositoryId=${repositoryId} modelId=${modelId}`
                : `2) find_models for repositoryId=${repositoryId}${titleQuery ? ` query=${titleQuery}` : ""} then describe_process on the chosen modelId`,
              "3) Use summaryText / activities from describe_process as the primary answer",
              "4) Only if needed: get_breakdowns, get_process_flow, resolve_symbols",
              "5) Answer in Swedish: purpose, steps with responsible + systems, inputs/outputs, open questions.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "text_to_process_model",
    {
      description: "Workflow for text-to-model / talk-to-model creating a process in 2c8.",
      argsSchema: {
        repositoryId: z.string(),
        languageId: z.string(),
        processDescription: z.string(),
      },
    },
    ({ repositoryId, languageId, processDescription }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Create/update a 2c8 process from the description below.",
              "Order:",
              "1) get_methodology (process, activity, naming, reuse-first) + list_allowed_types",
              "2) propose_model_from_text — chain BO↔activity↔vägval, branches Ja/Nej. Prefixed: Vägval: … / Ja: … / Nej: …",
              "3) Review BOs: value/artefacts, NOT status echoes. Rewrite failing namingChecks.",
              '4) ANY choice/gateway: call resolve_branching_object_type — exclusive → objectType "or" (Regel Eller). NEVER create gateway or join.',
              "5) search_symbols objectType=or (vägval/decision aliases). Titles are questions, not 'vägval'.",
              "6) validate_against_methodology; fix titles if needed",
              "7) apply_model_proposal (chain nodes with objectType or)",
              "8) describe_process — expect decisions[]",
              "9) Gaps: create_canvas_edge(label=Ja|Nej) / set_activity_performer",
              "10) review_process_model — REQUIRED before done. Fix all errors (BO in/out, performers, layout spaghetti/alignment/spacing). Re-run until ok or only acceptable infos.",
              "",
              `repositoryId=${repositoryId}`,
              `languageId=${languageId}`,
              "",
              "Description:",
              processDescription,
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "describe_role_onboarding",
    {
      description:
        "Workflow: which processes/activities a role needs (e.g. new Däckmontör) plus onboarding checklist content.",
      argsSchema: {
        repositoryId: z.string(),
        roleTitle: z.string(),
      },
    },
    ({ repositoryId, roleTitle }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Describe onboarding / required processes for role "${roleTitle}".`,
              "Order:",
              `1) describe_role_introduction repositoryId=${repositoryId} titleQuery=${roleTitle}`,
              "2) Present layers separately: operationalCompetence (RACI) vs formalIntroduction (HR CONTROLS) vs supportContext (hints only)",
              "3) get_document_content on formalIntroduction.controllingDocuments (search_documents if id missing)",
              "4) Answer in Swedish: role-specific process skills vs formal HR introduction checklist.",
              "Do NOT invent role→checklist CONTROLS or RACI ownership — keep sources labeled as returned.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "create_process_map_overview",
    {
      description:
        "Workflow: build a process map / lifecycle overview (process chevrons + BO + breakdowns), not an activity detail model.",
      argsSchema: {
        repositoryId: z.string(),
        languageId: z.string(),
        title: z.string(),
        description: z.string().optional().describe("Optional narrative of how processes connect"),
      },
    },
    ({ repositoryId, languageId, title, description }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Create process map / overview titled "${title}".`,
              "SCOPE RULE: each overview process must show the SAME inputs/outputs as its detail model (same symbol UUIDs). Never invent overview BOs.",
              "Order:",
              "1) get_methodology topic=process-map and topic=breakdowns",
              "2) For each detail model: get_detail_process_scope — note inputs/outputs/symbolIds",
              "3) create_process_map({ title, detailModelIds: […ordered detail UUIDs…] }) — server builds BO↔process from those scopes",
              "   (Alternative: propose_process_map_from_models then create_process_map with the same detailModelIds)",
              "4) describe_process_map(detailModelIds) — must report scopeOk / no scopeViolations",
              "5) review_process_model(detailModelIds) — REQUIRED before done (scope + layout)",
              "6) If scope/layout fails: fix DETAIL models / rebuild — do not invent a map-only BO",
              "Do NOT place activities on the overview. Do NOT invent different input/output titles than get_detail_process_scope.",
              "Never stack symbols on the same coordinates.",
              "",
              `repositoryId=${repositoryId}`,
              `languageId=${languageId}`,
              description ? `Context:\n${description}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "document_to_process_model",
    {
      description: "Workflow for document-to-model extraction into a 2c8 process.",
      argsSchema: {
        repositoryId: z.string(),
        languageId: z.string(),
        documentText: z.string(),
        sourceUrl: z.string().optional(),
      },
    },
    ({ repositoryId, languageId, documentText, sourceUrl }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Extract a process model from the document text.",
              "Order:",
              "1) get_methodology (process, document-links, document-roots, reuse-first)",
              "2) If docs share a base URL/folder: list_document_roots → create_document_root if missing; plan relative paths",
              "3) propose_model_from_document",
              "4) Present the proposal; rewrite business objects that are status echoes of activities into value/artefact titles",
              "5) search_symbols + validate_against_methodology (BOs: pass previousActivityTitle)",
              "6) apply_model_proposal when approved",
              "7) link_document (with prefix=root key + relative content when a root applies)",
              "",
              `repositoryId=${repositoryId}`,
              `languageId=${languageId}`,
              sourceUrl ? `sourceUrl=${sourceUrl}` : "",
              "",
              "Document text:",
              documentText,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  );
}
