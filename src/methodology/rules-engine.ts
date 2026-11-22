import type { TwoC8Client } from "../api/twoc8-client.js";
import type { MethodologyPack, ObjectTypeDef } from "./loader.js";

export interface NamingCheck {
  pass: boolean;
  hint?: string;
  objectTypeId?: string;
}

export interface ValidationResult {
  ok: boolean;
  methodologyNotes: string[];
  namingCheck?: NamingCheck;
  configViolations: string[];
  reuseAdvice?: string;
}

function normalize(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function findObjectType(
  pack: MethodologyPack,
  objectType: string,
): ObjectTypeDef | undefined {
  const needle = normalize(objectType);
  return pack.objectTypes.find(
    (ot) =>
      normalize(ot.id) === needle ||
      (ot.apiObjectTypeHints ?? []).some((h) => normalize(h) === needle),
  );
}

export function checkNaming(
  pack: MethodologyPack,
  objectType: string,
  title: string,
): NamingCheck {
  const def = findObjectType(pack, objectType);
  const patternKey = def?.id ?? normalize(objectType);
  const pattern = pack.naming?.patterns?.[patternKey];
  if (!pattern?.regex) {
    return {
      pass: title.trim().length > 0,
      hint: pattern?.hint ?? def?.naming,
      objectTypeId: def?.id,
    };
  }
  try {
    const re = new RegExp(pattern.regex, "u");
    return {
      pass: re.test(title.trim()),
      hint: pattern.hint ?? def?.naming,
      objectTypeId: def?.id,
    };
  } catch {
    return { pass: true, hint: pattern.hint, objectTypeId: def?.id };
  }
}

const BO_VALUE_HINT =
  "Name the value, artefact or capability produced (value stream) — not a status echo of the activity (avoid 'Godkänd X' after 'Godkänna X', 'Dokumenterad Y' after 'Dokumentera Y').";

/** Strip soft hyphens / ¬ for comparison. */
function plainTitle(title: string): string {
  return title.replace(/[\u00AC\u00AD]/g, "").trim();
}

/**
 * Detect BO titles that are past-participle restatements of the previous
 * activity (status stickers) rather than value/artefact names.
 */
export function isBusinessObjectStatusEcho(
  boTitle: string,
  previousActivityTitle: string,
): boolean {
  const bo = plainTitle(boTitle).toLowerCase();
  const act = plainTitle(previousActivityTitle).toLowerCase();
  if (!bo || !act) return false;

  const pairs: Array<{ act: RegExp; bo: RegExp }> = [
    { act: /\bgodkänn/i, bo: /^godkänd\b/i },
    { act: /\bdokumenter/i, bo: /^dokumenterad\b/i },
    { act: /\brevider|revision/i, bo: /^reviderad\b/i },
    { act: /\bgenomför/i, bo: /^genomförd\b/i },
    { act: /\bregistrer/i, bo: /^registrerad\b/i },
    { act: /\bplanera\b/i, bo: /^planerad\b/i },
    { act: /\bbestäm/i, bo: /^bestämd\b/i },
    { act: /\bskap/i, bo: /^skapad\b/i },
    { act: /\buför/i, bo: /^utförd\b/i },
  ];

  const statusBo =
    /^(dokumenterad|godkänd|reviderad|genomförd|utförd|avklarad|beslutad|planerad|registrerad|skapad)\b/i.test(
      bo,
    );
  if (!statusBo) {
    return false;
  }

  const pairHit = pairs.some((p) => p.act.test(act) && p.bo.test(bo));

  const stop = new Set([
    "och",
    "för",
    "av",
    "att",
    "en",
    "ett",
    "den",
    "det",
    "i",
    "på",
    "med",
    "via",
  ]);
  const tokens = (s: string) =>
    s
      .split(/[^a-zåäöé0-9]+/i)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 3 && !stop.has(t));

  const actToks = tokens(
    act.replace(
      /^(genomföra|dokumentera|godkänna|revidera|planera|bestämma|registrera|utföra)\s+/i,
      "",
    ),
  );
  const boToks = tokens(
    bo.replace(
      /^(dokumenterad|godkänd|reviderad|genomförd|utförd|avklarad|beslutad|planerad)\s+/i,
      "",
    ),
  );
  if (actToks.length === 0 || boToks.length === 0) {
    return pairHit;
  }
  const overlap = boToks.filter((t) =>
    actToks.some(
      (a) =>
        a.includes(t) ||
        t.includes(a) ||
        a.startsWith(t.slice(0, Math.min(4, t.length))) ||
        t.startsWith(a.slice(0, Math.min(4, a.length))),
    ),
  );
  return pairHit || overlap.length > 0;
}

/**
 * Naming check for FLOW business objects: value/artefact vs status echo.
 */
export function checkBusinessObjectValue(
  pack: MethodologyPack,
  boTitle: string,
  previousActivityTitle?: string,
): NamingCheck {
  const base = checkNaming(pack, "businessObject", boTitle);
  if (
    previousActivityTitle &&
    isBusinessObjectStatusEcho(boTitle, previousActivityTitle)
  ) {
    return {
      pass: false,
      hint: BO_VALUE_HINT,
      objectTypeId: "businessObject",
    };
  }
  // Standalone weak anti-pattern: bare "Dokumenterad/Genomförd …" without artefact clarity
  if (
    /^(dokumenterad|genomförd|utförd|avklarad)\s+\S+/i.test(plainTitle(boTitle))
  ) {
    return {
      pass: false,
      hint: BO_VALUE_HINT,
      objectTypeId: "businessObject",
    };
  }
  return {
    ...base,
    hint: base.hint ?? BO_VALUE_HINT,
  };
}

export function methodologyNotesForObject(
  pack: MethodologyPack,
  objectType: string,
): string[] {
  const def = findObjectType(pack, objectType);
  if (!def) {
    return [`No methodology entry for objectType '${objectType}'.`];
  }
  const notes = [
    `${def.title?.sv ?? def.id}: ${def.usage ?? ""}`.trim(),
  ];
  if (def.naming) {
    notes.push(`Naming: ${def.naming}`);
  }
  if (def.requiresPerformer) {
    notes.push("Activity requires a performer (role, position or organisation).");
  }
  return notes.filter(Boolean);
}

export async function loadRepoConfiguration(
  client: TwoC8Client,
  repositoryId: string,
): Promise<unknown | null> {
  try {
    return await client.request({
      path: "/api/v1/repositories/{repositoryId}/configuration",
      pathParams: { repositoryId },
    });
  } catch {
    return null;
  }
}

export interface SymbolSizeSpec {
  width: number;
  height: number;
  canChange?: boolean;
}

export interface QuickdrawDistance {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** Fallback sizes when repository configuration omits a type (common for activity/application). */
const FALLBACK_SYMBOL_SIZES: Record<string, SymbolSizeSpec> = {
  activity: { width: 75, height: 50 },
  process: { width: 90, height: 50 },
  businessobject: { width: 18, height: 18 },
  role: { width: 30, height: 18 },
  position: { width: 30, height: 18 },
  organization: { width: 30, height: 18 },
  organisation: { width: 30, height: 18 },
  application: { width: 20, height: 25 },
  coredocument: { width: 18, height: 18 },
  document: { width: 18, height: 18 },
  or: { width: 30, height: 30 },
  eller: { width: 30, height: 30 },
  decision: { width: 30, height: 30 },
  and: { width: 30, height: 30 },
  gateway: { width: 30, height: 30 },
};

function objectTypeKey(objectType: string): string {
  return objectType.trim().toLowerCase().replace(/[_\s-]/g, "");
}

/**
 * Parse symbolsizes.symbol[] from repository configuration.
 */
export function extractSymbolSizes(
  config: unknown,
): Map<string, SymbolSizeSpec> {
  const map = new Map<string, SymbolSizeSpec>();
  const root = config as {
    symbolsizes?: { symbol?: Array<Record<string, unknown>> };
  } | null;
  const list = root?.symbolsizes?.symbol;
  if (!Array.isArray(list)) {
    return map;
  }
  for (const item of list) {
    const type = String(item.type ?? "");
    const width = Number(item.width);
    const height = Number(item.height);
    if (!type || !Number.isFinite(width) || !Number.isFinite(height)) {
      continue;
    }
    map.set(objectTypeKey(type), {
      width,
      height,
      canChange: item.canchange === true || item.canchange === "true",
    });
  }
  return map;
}

/**
 * Quickdraw placement margins (not a general process-flow gap).
 * Present as quickdraw["distance-to-new-symbol"] = { top, left, bottom, right }.
 */
export function extractQuickdrawDistance(
  config: unknown,
): QuickdrawDistance | null {
  const root = config as {
    quickdraw?: Record<string, unknown>;
  } | null;
  const dist = root?.quickdraw?.["distance-to-new-symbol"] as
    | Record<string, unknown>
    | undefined;
  if (!dist) {
    return null;
  }
  const top = Number(dist.top);
  const left = Number(dist.left);
  const bottom = Number(dist.bottom);
  const right = Number(dist.right);
  if (![top, left, bottom, right].every(Number.isFinite)) {
    return null;
  }
  return { top, left, bottom, right };
}

export function resolveSymbolSize(
  objectType: string,
  config: unknown | null,
): SymbolSizeSpec {
  const key = objectTypeKey(objectType);
  if (config) {
    const fromConfig = extractSymbolSizes(config).get(key);
    if (fromConfig) {
      return fromConfig;
    }
  }
  return (
    FALLBACK_SYMBOL_SIZES[key] ?? {
      width: 75,
      height: 50,
    }
  );
}

export type OutsideLabelSide = "above" | "below" | "left" | "right";
export type LabelPlacement = "inside" | OutsideLabelSide;

/**
 * Large symbols (activity/process) keep labels inside; small icons use an outside label.
 */
export function labelPlacementForObjectType(
  objectType: string,
  size: SymbolSizeSpec,
): LabelPlacement {
  const key = objectTypeKey(objectType);
  if (key === "activity" || key === "process") {
    return "inside";
  }
  // OpenAPI: vertices smaller than 65×20 with centerLabel use above/below
  if (size.width < 65 || size.height < 40) {
    return "below";
  }
  return "inside";
}

/**
 * Place outside label on the opposite side of the edge attachment so text
 * does not sit on the relation (e.g. CONTROLS doc above activity → label above).
 */
export function outsideLabelAwayFromEdge(
  edgeAttachSide: "top" | "bottom" | "left" | "right",
): OutsideLabelSide {
  switch (edgeAttachSide) {
    case "top":
      return "below";
    case "bottom":
      return "above";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

/**
 * Best-effort extraction of allowed type strings from opaque configuration JSON.
 */
export function extractAllowedTypes(config: unknown): {
  modelTypes: string[];
  objectTypes: string[];
} {
  const modelTypes = new Set<string>();
  const objectTypes = new Set<string>();

  const visit = (node: unknown, keyHint = ""): void => {
    if (node == null) {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, keyHint);
      }
      return;
    }
    if (typeof node !== "object") {
      if (typeof node === "string") {
        const key = normalize(keyHint);
        if (key.includes("modeltype") || key === "modeltypes") {
          modelTypes.add(node);
        }
        if (
          key.includes("objecttype") ||
          key === "objecttypes" ||
          key.includes("symboltype")
        ) {
          objectTypes.add(node);
        }
      }
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (
        typeof v === "string" &&
        (normalize(k) === "modeltype" || normalize(k) === "objecttype")
      ) {
        if (normalize(k) === "modeltype") {
          modelTypes.add(v);
        } else {
          objectTypes.add(v);
        }
      }
      visit(v, k);
    }
  };

  visit(config);
  return {
    modelTypes: [...modelTypes],
    objectTypes: [...objectTypes],
  };
}

export function validateProposedSymbol(
  pack: MethodologyPack,
  args: {
    objectType: string;
    title: string;
    repoConfig?: unknown | null;
    /** Preceding activity title — used to detect BO status echoes. */
    previousActivityTitle?: string;
  },
): ValidationResult {
  const notes = methodologyNotesForObject(pack, args.objectType);
  const isBo =
    normalize(args.objectType) === "businessobject" ||
    findObjectType(pack, args.objectType)?.id === "businessObject";
  const namingCheck = isBo
    ? checkBusinessObjectValue(
        pack,
        args.title,
        args.previousActivityTitle,
      )
    : checkNaming(pack, args.objectType, args.title);
  const configViolations: string[] = [];

  if (args.repoConfig) {
    const allowed = extractAllowedTypes(args.repoConfig);
    if (
      allowed.objectTypes.length > 0 &&
      !allowed.objectTypes.some(
        (t) => normalize(t) === normalize(args.objectType),
      )
    ) {
      // Only flag when we found an allow-list that looks intentional
      const def = findObjectType(pack, args.objectType);
      const hints = def?.apiObjectTypeHints ?? [args.objectType];
      const match = hints.some((h) =>
        allowed.objectTypes.some((t) => normalize(t) === normalize(h)),
      );
      if (!match) {
        configViolations.push(
          `objectType '${args.objectType}' may not be allowed by repository configuration`,
        );
      }
    }
  }

  return {
    ok: namingCheck.pass && configViolations.length === 0,
    methodologyNotes: notes,
    namingCheck,
    configViolations,
    reuseAdvice:
      "Call search_symbols before creating; reuse existing UUID when the concept matches.",
  };
}

export function getMethodologyTopic(
  pack: MethodologyPack,
  topic: string,
): unknown {
  const t = normalize(topic);
  // Fold accents so vägval / vagval both resolve
  const tFold = t.normalize("NFD").replace(/\p{M}/gu, "");

  if (t === "sources") {
    return pack.sources;
  }

  // Vägval / "gateway" jargon → Regel (Eller) = or
  const exclusiveAliases = new Set([
    "vagval",
    "vägval",
    "gateway",
    "gateways",
    "decision",
    "regel",
    "eller",
    "beslut",
    "xor",
    "or",
  ]);
  if (exclusiveAliases.has(t) || exclusiveAliases.has(tFold)) {
    const object = pack.objectTypes.find((ot) => ot.id === "or");
    const rule = pack.rules.gateways;
    if (rule || object) {
      return {
        ...(rule && typeof rule === "object" ? (rule as object) : {}),
        kind: "vägval",
        id: "vägval",
        createObjectType: "or",
        methodologyNameSv: "Regel (Eller)",
        searchObjectTypes: ["or", "vägval", "decision"],
        neverUse: ["gateway", "join", "förbinda"],
        agentNote:
          'There is no "gateway" create type in 2c8. Call resolve_branching_object_type — useObjectType is "or".',
        objectType: object,
      };
    }
  }

  const object = pack.objectTypes.find(
    (ot) =>
      normalize(ot.id) === t ||
      normalize(ot.id).normalize("NFD").replace(/\p{M}/gu, "") === tFold ||
      (ot.apiObjectTypeHints ?? []).some(
        (h) =>
          normalize(h) === t ||
          normalize(h).normalize("NFD").replace(/\p{M}/gu, "") === tFold,
      ),
  );
  const model = pack.modelTypes.find(
    (mt) =>
      normalize(mt.id) === t ||
      (mt.apiModelTypeHints ?? []).some((h) => normalize(h) === t),
  );
  if (object && model) {
    return { kind: "modelAndObjectType", modelType: model, objectType: object };
  }
  if (model) {
    return { kind: "modelType", ...model };
  }
  if (object) {
    return { kind: "objectType", ...object };
  }

  // Process-wide vs step-specific document placement
  const docOnProcessAliases = new Set([
    "documents-on-process",
    "document-on-process",
    "process-wide-documents",
    "document-fan-out",
    "documents-fan-out",
    "styrdokument-placering",
  ]);
  if (docOnProcessAliases.has(t) || docOnProcessAliases.has(tFold)) {
    const rule = pack.rules["documents-on-process"];
    if (rule) {
      return { kind: "rule", ...(rule as object) };
    }
  }

  if (pack.rules[t]) {
    return { kind: "rule", ...(pack.rules[t] as object) };
  }
  if (pack.documents[t]) {
    return { kind: "documents", ...(pack.documents[t] as object) };
  }
  if (pack.structure[t]) {
    return { kind: "structure", ...(pack.structure[t] as object) };
  }
  if (pack.relations[t]) {
    return { kind: "relations", ...(pack.relations[t] as object) };
  }

  return {
    kind: "index",
    availableTopics: [
      ...pack.objectTypes.map((o) => o.id),
      ...pack.modelTypes.map((m) => m.id),
      ...Object.keys(pack.rules),
      ...Object.keys(pack.documents),
      ...Object.keys(pack.structure),
      ...Object.keys(pack.relations),
      "sources",
    ],
  };
}
