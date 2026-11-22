import type { MethodologyPack } from "../methodology/loader.js";
import {
  checkBusinessObjectValue,
  checkNaming,
  methodologyNotesForObject,
} from "../methodology/rules-engine.js";

/** Node on the main FLOW spine (business object, activity, or rule/gateway). */
export interface ProposedChainNode {
  /** gateway kind = exclusive Regel (Eller); create objectType is "or". */
  kind: "businessObject" | "activity" | "gateway" | "and";
  title: string;
  objectType: string;
}

/** Per-activity relations outside the FLOW spine. */
export interface ProposedActivityDetail {
  title: string;
  performers: string[];
  /** CORE_DOCUMENT titles linked with CONTROLS. */
  controlledBy: string[];
  /** APPLICATION or CORE_DOCUMENT titles linked with IS_USED_BY. */
  usedBy: string[];
  /** Object type hint per usedBy title (default application vs core_document). */
  usedByTypes?: Record<string, string>;
}

/**
 * Branch from a gateway (Regel Eller/vägval). Main-path answers that continue
 * the chain should also appear here so FLOW edge labels (Ja/Nej) are applied.
 * Side-path targets not in `chain` are created below the gateway on apply.
 */
export interface ProposedBranch {
  fromTitle: string;
  /** Answer on the FLOW edge label, e.g. Ja / Nej. */
  label?: string;
  toTitle: string;
  toKind?: "businessObject" | "activity" | "gateway" | "and" | "process";
  objectType?: string;
}

/** Legacy step shape kept for backward-compatible apply/Zod. */
export interface ProposedStep {
  title: string;
  objectType: string;
  performerTitle?: string;
  performers?: string[];
  inputs?: string[];
  outputs?: string[];
  documents?: string[];
  controlledBy?: string[];
  usedBy?: string[];
}

export interface ModelProposal {
  modelType: string;
  title: string;
  /** Process chevron title (defaults to title). */
  processTitle?: string;
  /** Ordered FLOW chain: BO → activity → BO → … (may include gateway/and). Never join. */
  chain?: ProposedChainNode[];
  /** Activity-level RACI / CONTROLS / IS_USED_BY. */
  activities?: ProposedActivityDetail[];
  /** Vägval/gateway branch edges (optional Ja/Nej labels). */
  branches?: ProposedBranch[];
  /** Derived/legacy linear steps (compat). */
  steps: ProposedStep[];
  methodologyNotes: string[];
  namingChecks: Array<{
    title: string;
    objectType: string;
    pass: boolean;
    hint?: string;
  }>;
  nextSuggestedTools: string[];
}

const ACTIVITY_HINTS = /^(aktivitet(?:er)?|activit(?:y|ies)|steg|step)\s*[:\-–]\s*/i;
const ROLE_HINTS = /^(roll(?:er)?|role(?:s)?|ansvarig|befattning|utförare)\s*[:\-–]\s*/i;
const DOC_HINTS = /^(dokument|document|länk|link|styrdokument|checklista)\s*[:\-–]\s*/i;
/** Explicit BO prefix used heavily by agents (English + Swedish). */
const BO_HINTS =
  /^(?:input\s+|output\s+)?(?:business\s*objects?|verksamhetsobjekt|värdeobjekt|bo)\s*[:\-–]\s*/i;
const INPUT_HINTS = /^(input|in|ingång|start|tillstånd)\s*[:\-–]\s*/i;
const OUTPUT_HINTS = /^(output|ut|resultat|utgång)\s*[:\-–]\s*/i;
const PROCESS_TITLE = /^(process|processmodell|modell)\s*[:\-–]\s*/i;
const APP_HINTS = /^(applikation(?:er)?|applications?|systems?|it-stöd|itstöd)\s*[:\-–]\s*/i;
const USED_BY_HINTS = /^(används|mall|verktyg)\s*[:\-–]\s*/i;
const NOTES_HINTS = /^(notes?|anteckningar?|kommentar(?:er)?)\s*[:\-–]/i;
const GATEWAY_HINTS =
  /^(vägval|vagval|gateway|decision|beslut|regel(?:\s*\((?:eller|och)\))?|eller|och-regel)\s*[:\-–]\s*/i;
/** Ja:/Nej: or Ja → title */
const BRANCH_HINTS = /^(ja|nej|yes|no|gren|branch)\s*(?:[:\-–]|→|->)\s*/i;

/** Skip instructional / meta lines agents paste into proposals. */
function isMetaOrInstructionLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (NOTES_HINTS.test(t)) return true;
  // Bare section headers without content
  if (
    /^(notes?|anteckningar?|kommentar(?:er)?|roles?|roller|business objects?|activit(?:y|ies)|aktivitet(?:er)?|systems?|applikation(?:er)?|applications?)\s*:?\s*$/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/^business objects and activities\b/i.test(t)) return true;
  if (/never status echoes/i.test(t)) return true;
  if (/infinitive verb\s*\+/i.test(t)) return true;
  if (/on FLOW\s*\(/i.test(t)) return true;
  if (/^#+\s/.test(t)) return true;
  return false;
}

function capitalizeFirst(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function cleanTitle(line: string): string {
  return line
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(ACTIVITY_HINTS, "")
    .replace(ROLE_HINTS, "")
    .replace(DOC_HINTS, "")
    .replace(BO_HINTS, "")
    .replace(INPUT_HINTS, "")
    .replace(OUTPUT_HINTS, "")
    .replace(PROCESS_TITLE, "")
    .replace(APP_HINTS, "")
    .replace(USED_BY_HINTS, "")
    .replace(GATEWAY_HINTS, "")
    .replace(BRANCH_HINTS, "")
    .replace(NOTES_HINTS, "")
    .trim();
}

/**
 * Parse "Title — performer: X — used by: A, B — controlled by: C" style lines.
 */
function parseInlineActivityAnnotations(line: string): {
  title: string;
  performers: string[];
  usedBy: string[];
  controlledBy: string[];
} {
  const normalized = line
    .replace(/\s+[—–]\s+/g, " — ")
    .replace(/\s+-\s+(?=(?:performer|ansvarig|used by|används|controlled by|styr))/i, " — ");
  const parts = normalized.split(/\s+—\s+/);
  const titlePart = parts[0] ?? line;
  const title = cleanTitle(titlePart.replace(ACTIVITY_HINTS, "").trim()) || titlePart.trim();
  const performers: string[] = [];
  const usedBy: string[] = [];
  const controlledBy: string[] = [];

  for (const part of parts.slice(1)) {
    const m = part.match(
      /^(performer|performers|ansvarig|role|roles|used by|används(?:\s+av)?|controlled by|controls?|styrdokument)\s*:\s*(.+)$/i,
    );
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const values = m[2]!
      .split(/\s*,\s*/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (/performer|ansvarig|^role/.test(key)) {
      for (const v of values) performers.push(normalizeRole(v));
    } else if (/used|används/.test(key)) {
      usedBy.push(...values);
    } else if (/control|styr/.test(key)) {
      controlledBy.push(...values);
    }
  }
  return { title, performers, usedBy, controlledBy };
}

function guessObjectType(line: string): string {
  const lower = line.toLowerCase();
  if (NOTES_HINTS.test(line) || isMetaOrInstructionLine(line)) {
    return "skip";
  }
  if (BO_HINTS.test(line) || INPUT_HINTS.test(line) || OUTPUT_HINTS.test(line)) {
    return "businessObject";
  }
  if (ROLE_HINTS.test(line)) {
    return "role";
  }
  // Bare "roll/befattning" as a word — not "Roles:" list already handled
  if (/^(roll|befattning)\b/.test(lower) && !/^roles?\b/i.test(line)) {
    return "role";
  }
  if (DOC_HINTS.test(line)) {
    return "core_document";
  }
  if (APP_HINTS.test(line)) {
    return "application";
  }
  if (GATEWAY_HINTS.test(line)) {
    return gatewayObjectTypeFromLine(line);
  }
  // Explicit activity prefix wins over trailing "?"
  if (ACTIVITY_HINTS.test(line)) {
    return "activity";
  }
  // Question ending with ? → exclusive vägval create type "or" (never "gateway")
  if (/\?\s*$/.test(line.trim()) && line.trim().length > 3) {
    return "or";
  }
  return "activity";
}

function gatewayObjectTypeFromLine(line: string): string {
  const lower = line.toLowerCase();
  if (/\boch\b/.test(lower) && /regel|och-regel/.test(lower)) return "and";
  // Exclusive vägval → 2c8 create type "or" (Regel Eller)
  return "or";
}

function gatewayKind(objectType: string): ProposedChainNode["kind"] {
  const t = objectType.toLowerCase();
  if (t === "and" || t === "och") return "and";
  // kind "gateway" in proposals = exclusive; objectType must be "or"
  return "gateway";
}

function stepsFromChain(
  chain: ProposedChainNode[],
  activities: ProposedActivityDetail[],
): ProposedStep[] {
  const byTitle = new Map(activities.map((a) => [a.title.toLowerCase(), a]));
  return chain.map((node) => {
    if (node.kind === "activity") {
      const detail = byTitle.get(node.title.toLowerCase());
      return {
        title: node.title,
        objectType: "activity",
        performers: detail?.performers,
        performerTitle: detail?.performers?.[0],
        controlledBy: detail?.controlledBy,
        usedBy: detail?.usedBy,
        documents: detail?.controlledBy,
      };
    }
    return {
      title: node.title,
      objectType: node.objectType,
    };
  });
}

function buildNamingChecks(
  pack: MethodologyPack,
  chain: ProposedChainNode[],
  activities: ProposedActivityDetail[],
  branches: ProposedBranch[] = [],
): ModelProposal["namingChecks"] {
  const checks: ModelProposal["namingChecks"] = [];
  let previousActivityTitle: string | undefined;
  for (const node of chain) {
    if (node.kind === "businessObject") {
      const c = checkBusinessObjectValue(pack, node.title, previousActivityTitle);
      checks.push({
        title: node.title,
        objectType: node.objectType,
        pass: c.pass,
        hint: c.hint,
      });
    } else if (node.kind === "gateway" || node.kind === "and") {
      const c = checkNaming(pack, node.objectType, node.title);
      checks.push({
        title: node.title,
        objectType: node.objectType,
        pass: c.pass,
        hint: c.hint,
      });
    } else {
      const c = checkNaming(pack, node.objectType, node.title);
      checks.push({
        title: node.title,
        objectType: node.objectType,
        pass: c.pass,
        hint: c.hint,
      });
      previousActivityTitle = node.title;
    }
  }
  for (const b of branches) {
    const ot = b.objectType ?? (b.toKind === "businessObject" ? "businessObject" : "activity");
    if (ot === "or" || ot === "gateway" || ot === "decision" || b.toKind === "gateway") {
      const c = checkNaming(pack, "or", b.toTitle);
      checks.push({
        title: b.toTitle,
        objectType: "or",
        pass: c.pass,
        hint: c.hint,
      });
    }
  }
  for (const act of activities) {
    for (const p of act.performers) {
      const c = checkNaming(pack, "role", p);
      checks.push({
        title: p,
        objectType: "role",
        pass: c.pass,
        hint: c.hint,
      });
    }
    for (const d of act.controlledBy) {
      const c = checkNaming(pack, "core_document", d);
      checks.push({
        title: d,
        objectType: "core_document",
        pass: c.pass,
        hint: c.hint,
      });
    }
    for (const u of act.usedBy) {
      const ot = act.usedByTypes?.[u] ?? "application";
      const c = checkNaming(pack, ot, u);
      checks.push({ title: u, objectType: ot, pass: c.pass, hint: c.hint });
    }
  }
  return checks;
}

function finalizeProposal(
  pack: MethodologyPack,
  modelType: string,
  title: string,
  chain: ProposedChainNode[],
  activities: ProposedActivityDetail[],
  extraNotes: string[] = [],
  branches: ProposedBranch[] = [],
): ModelProposal {
  const steps = stepsFromChain(chain, activities);
  const hasGateway =
    chain.some((n) => n.kind === "gateway" || n.kind === "and") || branches.length > 0;
  return {
    modelType,
    title,
    processTitle: title,
    chain,
    activities,
    branches: branches.length ? branches : undefined,
    steps,
    methodologyNotes: [
      ...methodologyNotesForObject(pack, "process"),
      ...methodologyNotesForObject(pack, "businessObject"),
      "Proposal includes FLOW chain (business objects + activities), RACI performers, CONTROLS and IS_USED_BY.",
      "FLOW business objects name value created (artefact/capability/outcome), not status echoes of the activity.",
      ...(hasGateway
        ? [
            ...methodologyNotesForObject(pack, "gateway"),
            "Vägval = Regel (Eller) = objectType or (NOT gateway). Call resolve_branching_object_type. Ja/Nej on branches[].label. NEVER join.",
          ]
        : []),
      "Review failing namingChecks for business objects before apply_model_proposal.",
      "Search for reusable symbols before apply_model_proposal.",
      ...extraNotes,
    ],
    namingChecks: buildNamingChecks(pack, chain, activities, branches),
    nextSuggestedTools: [
      "resolve_branching_object_type",
      "validate_against_methodology",
      "search_symbols",
      "apply_model_proposal",
    ],
  };
}

/** Normalize spoken role phrases to symbol titles. */
function normalizeRole(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  const lower = t.toLowerCase();
  if (/^kandidaten?$/.test(lower) || /kandidat/.test(lower)) {
    return "Kandidat för anställning";
  }
  if (/personalansvarig/.test(lower)) {
    return "Personalansvarig";
  }
  if (/servicetekniker/.test(lower)) {
    return "Servicetekniker";
  }
  return capitalizeFirst(t);
}

function extractRolesFromSentence(sentence: string): string[] {
  const roles: string[] = [];
  const lower = sentence.toLowerCase();
  if (lower.includes("personalansvarig")) {
    roles.push("Personalansvarig");
  }
  if (/\bkandidaten?\b/.test(lower) || /kandidat för/.test(lower)) {
    roles.push("Kandidat för anställning");
  }
  if (lower.includes("servicetekniker")) {
    roles.push("Servicetekniker");
  }
  // "X och Y ... ansvaret"
  const ans = sentence.match(
    /(?:delar|tar)\s+([^,.]+?)\s+(?:och\s+([^,.]+?)\s+)?(?:på\s+)?ansvaret/i,
  );
  if (ans) {
    for (const g of [ans[1], ans[2]]) {
      if (!g) continue;
      const parts = g.split(/\s+och\s+/i);
      for (const p of parts) {
        const n = normalizeRole(p.replace(/^en\s+/i, "").trim());
        if (n && !roles.includes(n)) roles.push(n);
      }
    }
  }
  return roles;
}

function looksLikeNarrative(text: string): boolean {
  const lower = text.toLowerCase();
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (paras.length >= 2 && /först|därefter|sedan|sista|heter\s+/i.test(lower)) {
    return true;
  }
  if (/heter\s+\S+/.test(lower) && /när\s+/.test(lower)) {
    return true;
  }
  // Prose paragraphs without "Aktivitet:" prefixes
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const prefixed = lines.filter(
    (l) =>
      ACTIVITY_HINTS.test(l) ||
      ROLE_HINTS.test(l) ||
      PROCESS_TITLE.test(l) ||
      BO_HINTS.test(l) ||
      INPUT_HINTS.test(l) ||
      OUTPUT_HINTS.test(l) ||
      GATEWAY_HINTS.test(l) ||
      DOC_HINTS.test(l) ||
      APP_HINTS.test(l),
  ).length;
  return lines.length >= 2 && prefixed === 0 && text.length > 120;
}

/**
 * Swedish narrative → structured process proposal (recruitment-style and similar).
 */
function proposeFromNarrative(
  pack: MethodologyPack,
  text: string,
  modelType: string,
): ModelProposal | null {
  if (!looksLikeNarrative(text)) {
    return null;
  }

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const full = paragraphs.join(" ");

  // Title: "heter X," / "processen X"
  let title = "Ny process";
  const heter = full.match(/heter\s+([A-ZÅÄÖÉa-zåäöé][^,.]{2,80}?)(?:,|\s+och\s+den|\s*$)/);
  if (heter) {
    title = capitalizeFirst(heter[1].trim());
  } else {
    const named = full.match(/(?:process(?:en|modell)?)\s+([A-ZÅÄÖ][^,.]{2,60})/);
    if (named) title = capitalizeFirst(named[1].trim());
  }

  // Start BO from "sätter igång när …" / "startar när …"
  let startBo: string | undefined;
  const startMatch = full.match(
    /(?:sätter igång|startar|börjar)\s+när\s+(?:det finns\s+)?(?:ett\s+)?([^,.]+)/i,
  );
  if (startMatch) {
    let raw = startMatch[1].trim();
    // "beslut att ta in en ny medarbetare" → "Beslut att ta in ny anställd"
    raw = raw
      .replace(/\ben ny medarbetare\b/gi, "ny anställd")
      .replace(/\ben nyanställd\b/gi, "ny anställd");
    startBo = capitalizeFirst(raw);
  }

  const chain: ProposedChainNode[] = [];
  const activities: ProposedActivityDetail[] = [];

  if (startBo) {
    chain.push({
      kind: "businessObject",
      title: startBo,
      objectType: "businessObject",
    });
  }

  const stepParas = paragraphs.length >= 2 ? paragraphs.slice(1) : paragraphs;

  for (let i = 0; i < stepParas.length; i++) {
    const para = stepParas[i];
    const lower = para.toLowerCase();
    const isLast = i === stepParas.length - 1;

    // Skip if this is the opening para already used for title/start
    if (
      i === 0 &&
      paragraphs.length >= 2 &&
      /heter\s+/i.test(paragraphs[0]) &&
      para === paragraphs[0]
    ) {
      continue;
    }

    let activityTitle: string | undefined;
    const performers = extractRolesFromSentence(para);
    const controlledBy: string[] = [];
    const usedBy: string[] = [];
    const usedByTypes: Record<string, string> = {};

    // Activity title heuristics
    if (/bestämmer villkor|bestämma villkor|villkoren för anställning/i.test(para)) {
      activityTitle = "Bestämma villkor för anställning";
    } else if (
      /förbereder|förbereda/.test(lower) &&
      /medarbetare|nyanställd|personen ska börja/i.test(para)
    ) {
      activityTitle = "Förbereda för medarbetare";
    } else if (/introduktion/i.test(para)) {
      activityTitle = "Genomföra introduktion";
    } else if (
      /först\s+/i.test(para) ||
      /därefter\s+/i.test(para) ||
      /sedan\s+/i.test(para) ||
      /sista\s+/i.test(para)
    ) {
      // Generic: try "verb ... noun" after connector
      const m = para.match(
        /(?:först|därefter|sedan|sista steget(?: är)?)\s+(?:är\s+)?(.+?)(?:\.|,| och | där )/i,
      );
      if (m) {
        const frag = m[1].trim();
        if (/introduktion/i.test(frag)) {
          activityTitle = "Genomföra introduktion";
        } else {
          activityTitle = capitalizeFirst(frag.slice(0, 80));
        }
      }
    }

    // Fallback: first infinitive-like verb phrase
    if (!activityTitle) {
      const verb = para.match(
        /\b(bestämmer|förbereder|genomför|registrerar|godkänner|granskar|skickar|kontrollerar)\s+([^,.]+)/i,
      );
      if (verb) {
        const map: Record<string, string> = {
          bestämmer: "Bestämma",
          förbereder: "Förbereda",
          genomför: "Genomföra",
          registrerar: "Registrera",
          godkänner: "Godkänna",
          granskar: "Granska",
          skickar: "Skicka",
          kontrollerar: "Kontrollera",
        };
        const v = map[verb[1].toLowerCase()] ?? capitalizeFirst(verb[1]);
        activityTitle = `${v} ${verb[2].trim()}`.replace(/\s+/g, " ").slice(0, 80);
      }
    }

    if (!activityTitle) {
      continue;
    }

    // CONTROLS: "styrs av X" / "stöd av X" / checklista
    const styr = para.match(
      /styrs av\s+(?:den\s+)?([^,.]+)|stöd av\s+(?:samma\s+|den\s+)?([^,.]+)|(?:checklista(?:n)?\s+(?:för\s+)?onboarding)/i,
    );
    if (styr || /onboardingchecklista|checklista(?:n)?\s+(?:för\s+)?onboarding/i.test(para)) {
      controlledBy.push("Checklista onboarding");
    }

    // IS_USED_BY mall
    if (
      /mall(?:en)?\s+för\s+anställningsavtal|anställningsavtal/i.test(para) &&
      /utgår från|mall/i.test(para)
    ) {
      usedBy.push("Mall anställningsavtal");
      usedByTypes["Mall anställningsavtal"] = "core_document";
    }

    // Application: personalliggare / system
    const appMatch = para.match(
      /(?:i|via)\s+([A-ZÅÄÖÉa-zåäöé][^,.]{0,40}?(?:personalliggare|system|liggare|portal|register))/i,
    );
    if (appMatch) {
      let app = appMatch[1].trim();
      app = app.replace(/\s+s\s+/i, "s "); // Lättkrängts → keep
      if (/personalliggare/i.test(app)) {
        app = /lättkrängt/i.test(app)
          ? "Lättkrängt Personalliggare"
          : capitalizeFirst(app.replace(/s\s+personalliggare/i, " Personalliggare"));
      } else {
        app = capitalizeFirst(app);
      }
      usedBy.push(app);
      usedByTypes[app] = "application";
    } else if (/personalliggare/i.test(para)) {
      const app = /lättkrängt/i.test(para) ? "Lättkrängt Personalliggare" : "Personalliggare";
      usedBy.push(app);
      usedByTypes[app] = "application";
    }

    // Ensure personalansvarig when "tar personalansvarig vid"
    if (/personalansvarig/i.test(para) && !performers.includes("Personalansvarig")) {
      performers.unshift("Personalansvarig");
    }

    chain.push({
      kind: "activity",
      title: activityTitle,
      objectType: "activity",
    });
    activities.push({
      title: activityTitle,
      performers: [...new Set(performers)],
      controlledBy: [...new Set(controlledBy)],
      usedBy: [...new Set(usedBy)],
      usedByTypes,
    });

    // Result BO after activity: "när … har man X" / "när … finns X" / "är X — landa"
    let resultBo: string | undefined;
    const resultMatch = para.match(
      /när\s+[^,]{5,80}?,\s*(?:har man|finns|är)\s+(?:ett\s+|en\s+|alla\s+)?([^—.]+)/i,
    );
    if (resultMatch) {
      resultBo = capitalizeFirst(
        resultMatch[1]
          .replace(/\s+för den nyanställda\.?$/i, " för nyanställd")
          .replace(/\s+och det är också.*$/i, "")
          .trim(),
      );
    }

    // Last paragraph landing: "redo att arbeta självständigt" / "landa i"
    if (isLast || /landa|landar|redo att arbeta/i.test(para)) {
      const landa = para.match(
        /(?:är\s+)?medarbetaren\s+redo[^.]*|([^.]{5,80}redo att arbeta självständigt)/i,
      );
      if (landa) {
        resultBo = "Medarbetare redo att arbeta självständigt";
      }
    }

    // Specific known results
    if (/påskrivet anställningsavtal/i.test(para)) {
      resultBo = "Påskrivet anställningsavtal";
    }
    if (/alla förutsättningar på plats/i.test(para)) {
      resultBo = "Alla förutsättningar på plats för nyanställd";
    }

    if (resultBo) {
      chain.push({
        kind: "businessObject",
        title: resultBo,
        objectType: "businessObject",
      });
    }
  }

  if (chain.filter((n) => n.kind === "activity").length === 0) {
    return null;
  }

  // Ensure end BO if last node is activity and text mentions landing
  const last = chain[chain.length - 1];
  if (last?.kind === "activity" && /redo att arbeta|landa/i.test(full)) {
    chain.push({
      kind: "businessObject",
      title: "Medarbetare redo att arbeta självständigt",
      objectType: "businessObject",
    });
  }

  return finalizeProposal(pack, modelType, title, chain, activities, [
    "Extracted from Swedish narrative prose.",
  ]);
}

/**
 * Prefix-line heuristic (Aktivitet:, Roll:, Input:, …).
 */
function proposeFromPrefixedLines(
  pack: MethodologyPack,
  text: string,
  modelType: string,
): ModelProposal {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let title = "Ny process";
  const chain: ProposedChainNode[] = [];
  const activities: ProposedActivityDetail[] = [];
  const branches: ProposedBranch[] = [];
  let pendingPerformers: string[] = [];
  let pendingGatewayTitle: string | undefined;
  let gatewayBranchCount = 0;
  const docs: string[] = [];
  const usedBy: string[] = [];
  const usedByTypes: Record<string, string> = {};
  const inputs: string[] = [];
  const outputs: string[] = [];

  const flushBo = (t: string) => {
    chain.push({
      kind: "businessObject",
      title: t,
      objectType: "businessObject",
    });
  };

  const pushActivity = (stepTitle: string) => {
    chain.push({
      kind: "activity",
      title: stepTitle,
      objectType: "activity",
    });
    activities.push({
      title: stepTitle,
      performers: [...pendingPerformers],
      controlledBy: [...docs],
      usedBy: [...usedBy],
      usedByTypes: { ...usedByTypes },
    });
    pendingPerformers = [];
    docs.length = 0;
    usedBy.length = 0;
    for (const k of Object.keys(usedByTypes)) delete usedByTypes[k];
  };

  const resolveBranchTarget = (
    raw: string,
  ): { title: string; kind: ProposedChainNode["kind"]; objectType: string } => {
    const t = raw.trim();
    if (/\?\s*$/.test(t)) {
      return { title: t, kind: "gateway", objectType: "or" };
    }
    if (/^(process|processmodell)\s*[:\-–]/i.test(t)) {
      return {
        title: cleanTitle(t),
        kind: "activity",
        objectType: "activity",
      };
    }
    return { title: cleanTitle(t) || t, kind: "activity", objectType: "activity" };
  };

  const pushActivityAnnotated = (
    stepTitle: string,
    extra?: {
      performers?: string[];
      usedBy?: string[];
      controlledBy?: string[];
    },
  ) => {
    for (const p of extra?.performers ?? []) {
      if (p && !pendingPerformers.includes(p)) pendingPerformers.push(p);
    }
    for (const d of extra?.controlledBy ?? []) {
      if (d && !docs.includes(d)) docs.push(d);
    }
    for (const u of extra?.usedBy ?? []) {
      if (u && !usedBy.includes(u)) {
        usedBy.push(u);
        if (!usedByTypes[u]) {
          usedByTypes[u] = /mall|checklista|dokument|policy|act|directive/i.test(u)
            ? "core_document"
            : "application";
        }
      }
    }
    pushActivity(stepTitle);
  };

  for (const line of lines) {
    if (isMetaOrInstructionLine(line)) {
      continue;
    }

    if (
      PROCESS_TITLE.test(line) ||
      (chain.length === 0 && !line.includes(":") && lines.indexOf(line) === 0)
    ) {
      if (PROCESS_TITLE.test(line) || lines.indexOf(line) === 0) {
        const cleaned = cleanTitle(line);
        if (cleaned && PROCESS_TITLE.test(line)) {
          title = cleaned;
          continue;
        }
        if (
          lines.indexOf(line) === 0 &&
          !ACTIVITY_HINTS.test(line) &&
          !GATEWAY_HINTS.test(line) &&
          !BRANCH_HINTS.test(line) &&
          !BO_HINTS.test(line)
        ) {
          title = cleaned || title;
          continue;
        }
      }
    }

    if (ROLE_HINTS.test(line)) {
      const roles = cleanTitle(line)
        .split(/\s*,\s*/)
        .map((r) => normalizeRole(r))
        .filter(Boolean);
      pendingPerformers.push(...roles);
      continue;
    }
    if (DOC_HINTS.test(line)) {
      docs.push(cleanTitle(line));
      continue;
    }
    if (APP_HINTS.test(line) || USED_BY_HINTS.test(line)) {
      const t = cleanTitle(line);
      usedBy.push(t);
      usedByTypes[t] = APP_HINTS.test(line) ? "application" : "core_document";
      continue;
    }
    // Explicit "Business object:" → spine BO immediately (not an activity)
    if (BO_HINTS.test(line)) {
      const t = cleanTitle(line);
      if (t) flushBo(t);
      continue;
    }
    if (INPUT_HINTS.test(line)) {
      const t = cleanTitle(line);
      if (t) inputs.push(t);
      continue;
    }
    if (OUTPUT_HINTS.test(line)) {
      const t = cleanTitle(line);
      if (t) outputs.push(t);
      continue;
    }

    // Vägval / Regel / Gateway → always create as or/and (never objectType gateway)
    if (GATEWAY_HINTS.test(line)) {
      for (const inp of inputs) flushBo(inp);
      inputs.length = 0;
      const ot = gatewayObjectTypeFromLine(line);
      const kind = gatewayKind(ot);
      const stepTitle = cleanTitle(line);
      if (!stepTitle) continue;
      chain.push({ kind, title: stepTitle, objectType: ot });
      pendingGatewayTitle = kind === "gateway" || kind === "and" ? stepTitle : undefined;
      gatewayBranchCount = 0;
      continue;
    }

    // Ja: / Nej: / Ja → … after a gateway
    if (BRANCH_HINTS.test(line) && pendingGatewayTitle) {
      const labelMatch = line.match(BRANCH_HINTS);
      const labelRaw = labelMatch?.[1] ?? "";
      const label = /^(ja|yes)$/i.test(labelRaw)
        ? "Ja"
        : /^(nej|no)$/i.test(labelRaw)
          ? "Nej"
          : capitalizeFirst(labelRaw);
      const targetRaw = line.replace(BRANCH_HINTS, "").trim();
      if (!targetRaw) continue;
      const target = resolveBranchTarget(targetRaw);
      gatewayBranchCount += 1;
      branches.push({
        fromTitle: pendingGatewayTitle,
        label,
        toTitle: target.title,
        toKind: target.kind,
        objectType: target.objectType,
      });
      // First answer continues on the main spine; further answers are side branches
      if (gatewayBranchCount === 1) {
        if (target.kind === "gateway" || target.kind === "and") {
          chain.push({
            kind: target.kind,
            title: target.title,
            objectType: target.objectType === "gateway" ? "or" : target.objectType,
          });
          pendingGatewayTitle = target.title;
          gatewayBranchCount = 0;
        } else if (target.kind === "businessObject") {
          flushBo(target.title);
        } else {
          pushActivityAnnotated(target.title);
        }
      }
      continue;
    }

    const objectType = guessObjectType(line);
    if (objectType === "skip") continue;

    if (objectType === "or" || objectType === "and" || objectType === "gateway") {
      for (const inp of inputs) flushBo(inp);
      inputs.length = 0;
      const ot = objectType === "gateway" ? "or" : objectType;
      const kind = gatewayKind(ot);
      const stepTitle = cleanTitle(line);
      if (!stepTitle) continue;
      chain.push({ kind, title: stepTitle, objectType: ot });
      pendingGatewayTitle = kind === "gateway" || kind === "and" ? stepTitle : undefined;
      gatewayBranchCount = 0;
      continue;
    }

    if (objectType === "activity") {
      for (const inp of inputs) flushBo(inp);
      inputs.length = 0;

      const annotated = parseInlineActivityAnnotations(line);
      pushActivityAnnotated(annotated.title, annotated);

      for (const out of outputs) flushBo(out);
      outputs.length = 0;
      pendingGatewayTitle = undefined;
    } else if (objectType === "businessObject") {
      const stepTitle = cleanTitle(line);
      if (stepTitle) flushBo(stepTitle);
      pendingGatewayTitle = undefined;
    } else if (objectType === "role") {
      const roles = cleanTitle(line)
        .split(/\s*,\s*/)
        .map((r) => normalizeRole(r))
        .filter(Boolean);
      pendingPerformers.push(...roles);
    } else if (objectType === "core_document") {
      const stepTitle = cleanTitle(line);
      if (stepTitle) docs.push(stepTitle);
    } else if (objectType === "application") {
      const stepTitle = cleanTitle(line);
      if (stepTitle) {
        usedBy.push(stepTitle);
        usedByTypes[stepTitle] = "application";
      }
    }
  }

  for (const out of outputs) flushBo(out);
  outputs.length = 0;
  for (const inp of inputs) flushBo(inp);
  inputs.length = 0;

  if (chain.length === 0) {
    for (const line of lines.slice(0, 20)) {
      if (isMetaOrInstructionLine(line)) continue;
      const objectType = guessObjectType(line);
      if (objectType === "skip" || objectType === "role") continue;
      if (objectType === "businessObject") {
        const t = cleanTitle(line);
        if (t && t !== title) flushBo(t);
        continue;
      }
      if (objectType === "activity") {
        const annotated = parseInlineActivityAnnotations(line);
        if (annotated.title && annotated.title !== title) {
          pushActivityAnnotated(annotated.title, annotated);
        }
      }
    }
  }

  return finalizeProposal(
    pack,
    modelType,
    title,
    chain,
    activities,
    [
      "Extracted from prefixed / structured lines.",
      ...(branches.length
        ? ["Parsed vägval/gateway branches — review branches[].label (Ja/Nej) before apply."]
        : []),
    ],
    branches,
  );
}

/**
 * Text → process proposal (no API writes).
 * Prefers Swedish narrative extraction; falls back to prefix-line parser.
 */
export function proposeModelFromText(
  pack: MethodologyPack,
  text: string,
  modelType = "process",
): ModelProposal {
  const narrative = proposeFromNarrative(pack, text, modelType);
  if (narrative) {
    return narrative;
  }
  return proposeFromPrefixedLines(pack, text, modelType);
}

export function proposeModelFromDocument(
  pack: MethodologyPack,
  args: { title?: string; text: string; sourceUrl?: string },
): ModelProposal {
  const proposal = proposeModelFromText(pack, args.text, "process");
  if (args.title) {
    proposal.title = args.title;
    proposal.processTitle = args.title;
  }
  proposal.methodologyNotes = [
    ...proposal.methodologyNotes,
    "Derived from document text (document-to-model). Review extracted steps before apply.",
    args.sourceUrl ? `Source: ${args.sourceUrl}` : "",
  ].filter(Boolean);
  return proposal;
}

/** Ensure chain/activities exist when only legacy steps were supplied. */
/**
 * When agents put BO titles only on steps[].inputs/outputs (or send an
 * activity-only chain), weave those BOs into the FLOW spine so apply does
 * not silently create activity→activity models.
 */
function pushBoUnique(chain: ProposedChainNode[], title: string | undefined): void {
  const t = (title ?? "").trim();
  if (!t) return;
  const last = chain[chain.length - 1];
  if (last?.kind === "businessObject" && last.title.toLowerCase() === t.toLowerCase()) {
    return;
  }
  chain.push({
    kind: "businessObject",
    title: t,
    objectType: "businessObject",
  });
}

function enrichChainFromStepIo(
  chain: ProposedChainNode[],
  steps: ProposedStep[],
): ProposedChainNode[] {
  if (!chain.length) return chain;
  if (chain.some((n) => n.kind === "businessObject")) return chain;
  const byTitle = new Map(steps.map((s) => [s.title.trim().toLowerCase(), s]));
  const hasIo = steps.some((s) => (s.inputs?.length ?? 0) > 0 || (s.outputs?.length ?? 0) > 0);
  if (!hasIo) return chain;

  const out: ProposedChainNode[] = [];
  for (const node of chain) {
    if (node.kind !== "activity") {
      out.push(node);
      continue;
    }
    const step = byTitle.get(node.title.toLowerCase());
    for (const inp of step?.inputs ?? []) pushBoUnique(out, inp);
    out.push(node);
    for (const o of step?.outputs ?? []) pushBoUnique(out, o);
  }
  return out;
}

export function normalizeProposal(proposal: ModelProposal): ModelProposal {
  if (proposal.chain?.length && proposal.activities) {
    const chain = enrichChainFromStepIo(proposal.chain, proposal.steps ?? []);
    return {
      ...proposal,
      processTitle: proposal.processTitle ?? proposal.title,
      chain,
      branches: proposal.branches ?? [],
      steps: stepsFromChain(chain, proposal.activities),
    };
  }
  const chain: ProposedChainNode[] = [];
  const activities: ProposedActivityDetail[] = [];
  for (const step of proposal.steps) {
    const ot = step.objectType.toLowerCase().replace(/[_\s-]/g, "");
    if (ot.includes("business") || ot === "businessobject") {
      pushBoUnique(chain, step.title);
    } else if (
      ot === "gateway" ||
      ot === "decision" ||
      ot === "vägval" ||
      ot === "vagval" ||
      ot === "eller" ||
      ot === "or" ||
      ot === "xor"
    ) {
      chain.push({
        kind: "gateway",
        title: step.title,
        objectType: "or",
      });
    } else if (ot === "and" || ot === "och") {
      chain.push({ kind: "and", title: step.title, objectType: "and" });
    } else if (ot === "join" || ot.includes("forbind") || ot.includes("förbind")) {
    } else {
      // Legacy steps: inputs/outputs become spine BOs (were previously ignored).
      for (const inp of step.inputs ?? []) pushBoUnique(chain, inp);
      chain.push({
        kind: "activity",
        title: step.title,
        objectType: "activity",
      });
      activities.push({
        title: step.title,
        performers: step.performers ?? (step.performerTitle ? [step.performerTitle] : []),
        controlledBy: step.controlledBy ?? step.documents ?? [],
        usedBy: step.usedBy ?? [],
      });
      for (const o of step.outputs ?? []) pushBoUnique(chain, o);
    }
  }
  return {
    ...proposal,
    processTitle: proposal.processTitle ?? proposal.title,
    chain,
    activities,
    branches: proposal.branches ?? [],
    steps: stepsFromChain(chain, activities),
  };
}
