import type { MethodologyPack } from "../methodology/loader.js";
import {
  checkNaming,
  methodologyNotesForObject,
} from "../methodology/rules-engine.js";

export interface ProposedStep {
  title: string;
  objectType: string;
  performerTitle?: string;
  inputs?: string[];
  outputs?: string[];
  documents?: string[];
}

export interface ModelProposal {
  modelType: string;
  title: string;
  steps: ProposedStep[];
  methodologyNotes: string[];
  namingChecks: Array<{ title: string; objectType: string; pass: boolean; hint?: string }>;
  nextSuggestedTools: string[];
}

const ACTIVITY_HINTS =
  /^(aktivitet|activity|steg|step)\s*[:\-–]\s*/i;
const ROLE_HINTS = /^(roll|role|ansvarig|befattning|utförare)\s*[:\-–]\s*/i;
const DOC_HINTS = /^(dokument|document|länk|link)\s*[:\-–]\s*/i;
const INPUT_HINTS = /^(input|in|ingång)\s*[:\-–]\s*/i;
const OUTPUT_HINTS = /^(output|ut|resultat|utgång)\s*[:\-–]\s*/i;
const PROCESS_TITLE = /^(process|processmodell|modell)\s*[:\-–]\s*/i;

function guessObjectType(line: string): string {
  const lower = line.toLowerCase();
  if (ROLE_HINTS.test(line) || /\b(roll|befattning)\b/.test(lower)) {
    return "role";
  }
  if (DOC_HINTS.test(line)) {
    return "document";
  }
  if (INPUT_HINTS.test(line) || OUTPUT_HINTS.test(line)) {
    return "businessObject";
  }
  return "activity";
}

function cleanTitle(line: string): string {
  return line
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(ACTIVITY_HINTS, "")
    .replace(ROLE_HINTS, "")
    .replace(DOC_HINTS, "")
    .replace(INPUT_HINTS, "")
    .replace(OUTPUT_HINTS, "")
    .replace(PROCESS_TITLE, "")
    .trim();
}

/**
 * Heuristic text → process proposal (no API writes).
 */
export function proposeModelFromText(
  pack: MethodologyPack,
  text: string,
  modelType = "process",
): ModelProposal {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let title = "Ny process";
  const steps: ProposedStep[] = [];
  let pendingPerformer: string | undefined;
  const docs: string[] = [];
  const inputs: string[] = [];
  const outputs: string[] = [];

  for (const line of lines) {
    if (PROCESS_TITLE.test(line) || (steps.length === 0 && !line.includes(":"))) {
      if (PROCESS_TITLE.test(line) || lines.indexOf(line) === 0) {
        const cleaned = cleanTitle(line);
        if (cleaned && PROCESS_TITLE.test(line)) {
          title = cleaned;
          continue;
        }
        if (lines.indexOf(line) === 0 && !ACTIVITY_HINTS.test(line)) {
          title = cleaned || title;
          continue;
        }
      }
    }

    if (ROLE_HINTS.test(line)) {
      pendingPerformer = cleanTitle(line);
      continue;
    }
    if (DOC_HINTS.test(line)) {
      docs.push(cleanTitle(line));
      continue;
    }
    if (INPUT_HINTS.test(line)) {
      inputs.push(cleanTitle(line));
      continue;
    }
    if (OUTPUT_HINTS.test(line)) {
      outputs.push(cleanTitle(line));
      continue;
    }

    const objectType = guessObjectType(line);
    const stepTitle = cleanTitle(line);
    if (!stepTitle) {
      continue;
    }

    if (objectType === "activity" || objectType === "businessObject") {
      steps.push({
        title: stepTitle,
        objectType: objectType === "businessObject" ? "businessObject" : "activity",
        performerTitle: pendingPerformer,
        inputs: inputs.length ? [...inputs] : undefined,
        outputs: outputs.length ? [...outputs] : undefined,
        documents: docs.length ? [...docs] : undefined,
      });
      pendingPerformer = undefined;
      docs.length = 0;
      inputs.length = 0;
      outputs.length = 0;
    } else if (objectType === "role") {
      pendingPerformer = stepTitle;
    } else if (objectType === "document") {
      docs.push(stepTitle);
    }
  }

  if (steps.length === 0) {
    // Fallback: treat non-empty sentences as activities
    for (const line of lines.slice(0, 20)) {
      const t = cleanTitle(line);
      if (t && t !== title) {
        steps.push({ title: t, objectType: "activity" });
      }
    }
  }

  const namingChecks = steps.map((s) => {
    const check = checkNaming(pack, s.objectType, s.title);
    return {
      title: s.title,
      objectType: s.objectType,
      pass: check.pass,
      hint: check.hint,
    };
  });

  const notes = [
    ...methodologyNotesForObject(pack, "process"),
    "Proposal only — call apply_model_proposal or create tools after validation.",
    "Search for reusable symbols before applying.",
  ];

  return {
    modelType,
    title,
    steps,
    methodologyNotes: notes,
    namingChecks,
    nextSuggestedTools: [
      "validate_against_methodology",
      "search_symbols",
      "apply_model_proposal",
    ],
  };
}

export function proposeModelFromDocument(
  pack: MethodologyPack,
  args: { title?: string; text: string; sourceUrl?: string },
): ModelProposal {
  const proposal = proposeModelFromText(pack, args.text, "process");
  if (args.title) {
    proposal.title = args.title;
  }
  proposal.methodologyNotes = [
    ...proposal.methodologyNotes,
    "Derived from document text (document-to-model). Review extracted steps before apply.",
    args.sourceUrl ? `Source: ${args.sourceUrl}` : "",
  ].filter(Boolean);
  return proposal;
}
