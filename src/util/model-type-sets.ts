/**
 * Single source for canvas/object-type Sets used by review, reader, and helpers.
 * Keep in sync with knowledge/rules/gateways.yaml aliases (see model-type-sets.test.ts).
 */

function normKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[_\s-]/g, "");
}

/** Exclusive + parallel branching aliases (Regel Eller/Och + legacy). */
export const DECISION_TYPE_KEYS = [
  "decision",
  "or",
  "eller",
  "and",
  "och",
  "gateway",
  "regel",
  "vagval",
  "vägval",
  "xor",
  "beslut",
  "parallel",
  "parallell",
] as const;

export const DECISION_TYPES = new Set<string>(DECISION_TYPE_KEYS.map(normKey));
// Keep raw unicode forms for sets that callers feed through light normType (no NFD).
DECISION_TYPES.add("vägval");
DECISION_TYPES.add("vagval");

export const ACTIVITY_TYPES = new Set(["activity", "aktivitet"]);
export const PROCESS_OBJECT_TYPES = new Set(["process"]);

/** Value-stream BOs on FLOW spine — excludes styrdokument/document icons. */
export const VALUE_BUSINESS_OBJECT_TYPES = new Set([
  "businessobject",
  "business_object",
  "verksamhetsobjekt",
  "message",
  "meddelande",
]);

export const DOCUMENT_OBJECT_TYPES = new Set([
  "coredocument",
  "core_document",
  "document",
  "dokument",
  "styrdokument",
]);

/**
 * Broader BO bag (value + document) for flow classification where documents
 * still participate as endpoints — prefer VALUE_BUSINESS_OBJECT_TYPES for spine rules.
 */
export const BUSINESS_OBJECT_TYPES = new Set([
  ...VALUE_BUSINESS_OBJECT_TYPES,
  ...DOCUMENT_OBJECT_TYPES,
]);

export const RESPONSIBILITY_TYPES = new Set([
  "role",
  "position",
  "organisation",
  "organization",
  "befattning",
  "roll",
  "stakeholder",
  "intressent",
]);

export const APPLICATION_TYPES = new Set(["application", "applikation", "it", "system"]);

export const FLOW_EDGE_TYPES = new Set(["flow", "sequence"]);

const RESPONSIBLE_RAW = ["raci_responsible", "responsible", "ansvarig", "performs", "utför"];
export const RESPONSIBLE_EDGE_TYPES = new Set<string>(RESPONSIBLE_RAW);
/** Pre-normalized for O(1) edge checks. */
export const RESPONSIBLE_EDGE_NORM = new Set(RESPONSIBLE_RAW.map(normKey));

const CONTROLS_RAW = ["controls", "control", "styr"];
export const CONTROLS_EDGE_TYPES = new Set<string>(CONTROLS_RAW);
export const CONTROLS_EDGE_NORM = new Set(CONTROLS_RAW.map(normKey));

const DOC_LINK_RAW = [
  "controls",
  "control",
  "styr",
  "isusedby",
  "is_used_by",
  "usedby",
  "used_by",
  "anvandsav",
];
export const DOC_LINK_EDGE_TYPES = new Set<string>(DOC_LINK_RAW);
export const DOC_LINK_EDGE_NORM = new Set(DOC_LINK_RAW.map(normKey));

export function lightNormType(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[\s_-]+/g, "");
}

export function isDecisionType(objectType: string | undefined): boolean {
  const n = lightNormType(objectType);
  return DECISION_TYPES.has(n) || DECISION_TYPES.has(normKey(objectType ?? ""));
}

export function isValueBusinessObject(objectType: string | undefined): boolean {
  return VALUE_BUSINESS_OBJECT_TYPES.has(lightNormType(objectType));
}

export function isControlsEdgeType(edgeType: string | undefined): boolean {
  return CONTROLS_EDGE_NORM.has(normKey(edgeType ?? ""));
}

export function isRaciEdgeType(edgeType: string | undefined): boolean {
  return RESPONSIBLE_EDGE_NORM.has(normKey(edgeType ?? ""));
}

export function isDocLinkEdgeType(edgeType: string | undefined): boolean {
  return DOC_LINK_EDGE_NORM.has(normKey(edgeType ?? ""));
}

export function isFlowEdgeType(edgeType: string | undefined): boolean {
  const n = lightNormType(edgeType);
  return !n || FLOW_EDGE_TYPES.has(n);
}

/** Compact helper for review finding vertexIds. */
export function compactIds(...ids: Array<string | undefined | null>): string[] {
  return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
}
