import type { CanvasDto, EdgeView, FlowStep, VertexView } from "../api/types.js";
import { isCompoundPerformerTitle, type QuickdrawDistance } from "../methodology/rules-engine.js";
import {
  ACTIVITY_TYPES,
  APPLICATION_TYPES as APPLICATION_OBJECT_TYPES,
  compactIds,
  DECISION_TYPES,
  DOCUMENT_OBJECT_TYPES,
  isControlsEdgeType,
  isDecisionType,
  isDocLinkEdgeType,
  isFlowEdgeType,
  isRaciEdgeType,
  isValueBusinessObject,
  lightNormType,
  PROCESS_OBJECT_TYPES,
  RESPONSIBILITY_TYPES,
  VALUE_BUSINESS_OBJECT_TYPES,
} from "../util/model-type-sets.js";
import { isForbiddenJoinType } from "../util/object-types.js";

export type ReviewSeverity = "error" | "warning" | "info";
export type ReviewCategory = "methodology" | "layout";

export interface ReviewFinding {
  id: string;
  severity: ReviewSeverity;
  category: ReviewCategory;
  message: string;
  suggestion?: string;
  titles?: string[];
  vertexIds?: string[];
}

/** Spine / value-stream BOs only — documents are not FLOW value objects (Q4-11). */
const BUSINESS_OBJECT_TYPES = VALUE_BUSINESS_OBJECT_TYPES;

const MAP_LEFT_MARGIN = 80;
const DEFAULT_VERTEX_WIDTH = 75;
const DEFAULT_VERTEX_HEIGHT = 50;
const OVERLAP_PAD = 4;
const SPINE_ALIGN_TOL = 8;
const SIDE_BRANCH_MIDY_SKIP = 40;
const PEER_ROW_MIDY_SKIP = 70;

function normType(value: string | undefined): string {
  return lightNormType(value);
}

function isFlowEdge(et: string | undefined): boolean {
  return isFlowEdgeType(et);
}

function isRaciEdge(et: string | undefined): boolean {
  return isRaciEdgeType(et);
}

function isControlsEdge(et: string | undefined): boolean {
  return isControlsEdgeType(et);
}

function isDocLinkEdge(et: string | undefined): boolean {
  return isDocLinkEdgeType(et);
}

function symbolIdOf(v: VertexView): string {
  const sym = v.symbol;
  if (typeof sym === "string" && sym) return sym;
  if (sym && typeof sym === "object" && typeof sym.uuid === "string") {
    return sym.uuid;
  }
  return v.uuid ?? "";
}

function vertexTitle(v: VertexView): string {
  for (const lab of Object.values(v.labels ?? {})) {
    if (lab && typeof lab === "object" && typeof lab.title === "string" && lab.title) {
      return lab.title;
    }
  }
  return "?";
}

function objectTypeOf(v: VertexView, stepById: Map<string, FlowStep>): string {
  const step = v.uuid ? stepById.get(v.uuid) : undefined;
  if (step?.objectType) return step.objectType;
  if (typeof v.objectType === "string") return v.objectType;
  const sym = v.symbol;
  if (sym && typeof sym === "object" && typeof sym.objectType === "string") {
    return sym.objectType;
  }
  return "";
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  pad = OVERLAP_PAD,
): boolean {
  return !(
    a.x + a.width + pad <= b.x ||
    b.x + b.width + pad <= a.x ||
    a.y + a.height + pad <= b.y ||
    b.y + b.height + pad <= a.y
  );
}

function midY(v: { y?: number; height?: number }): number {
  return (v.y ?? 0) + (v.height ?? DEFAULT_VERTEX_HEIGHT) / 2;
}

function midX(v: { x?: number; width?: number }): number {
  return (v.x ?? 0) + (v.width ?? DEFAULT_VERTEX_WIDTH) / 2;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = nums.toSorted((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Segment intersection (proper), ignoring shared endpoints. */
function segmentsCross(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): boolean {
  const orient = (
    p: { x: number; y: number },
    q: { x: number; y: number },
    r: { x: number; y: number },
  ) => {
    const v = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(v) < 1e-6) return 0;
    return v > 0 ? 1 : 2;
  };
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);
  if (o1 === 0 || o2 === 0 || o3 === 0 || o4 === 0) return false;
  return o1 !== o2 && o3 !== o4;
}

function edgePoints(
  e: EdgeView,
  from: VertexView | undefined,
  to: VertexView | undefined,
): Array<{ x: number; y: number }> {
  const raw = (e as { points?: Array<{ x?: number; y?: number }> }).points;
  if (raw && raw.length >= 2) {
    return raw.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 }));
  }
  // Fallback: centers
  return [
    { x: midX(from ?? {}), y: midY(from ?? {}) },
    { x: midX(to ?? {}), y: midY(to ?? {}) },
  ];
}

/** Count distinct horizontal bands among steps (midY clusters). */
function yBandCount(items: Array<{ y?: number; height?: number }>, bandGap = 80): number {
  if (items.length === 0) return 0;
  const mids = items.map((s) => midY(s)).toSorted((a, b) => a - b);
  let bands = 1;
  for (let i = 1; i < mids.length; i++) {
    if ((mids[i] ?? 0) - (mids[i - 1] ?? 0) > bandGap) bands += 1;
  }
  return bands;
}

/** Cluster steps into Y-bands for peer-row layout checks. */
function clusterByYBand<T extends { y?: number; height?: number }>(
  items: T[],
  bandGap = 80,
): T[][] {
  if (items.length === 0) return [];
  const sorted = [...items].toSorted((a, b) => midY(a) - midY(b));
  const bands: T[][] = [[sorted[0]!]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const band = bands[bands.length - 1]!;
    const ref = band[0]!;
    if (Math.abs(midY(cur) - midY(ref)) > bandGap) {
      bands.push([cur]);
    } else {
      band.push(cur);
    }
  }
  return bands;
}

function attachSide(
  box: { x?: number; y?: number; width?: number; height?: number },
  pt: { x: number; y: number },
): "left" | "right" | "top" | "bottom" | "inside" {
  const x = box.x ?? 0;
  const y = box.y ?? 0;
  const w = box.width ?? 75;
  const h = box.height ?? 50;
  const tol = 8;
  if (Math.abs(pt.x - x) <= tol) return "left";
  if (Math.abs(pt.x - (x + w)) <= tol) return "right";
  if (Math.abs(pt.y - y) <= tol) return "top";
  if (Math.abs(pt.y - (y + h)) <= tol) return "bottom";
  if (pt.x > x && pt.x < x + w && pt.y > y && pt.y < y + h) return "inside";
  // nearest border
  const dl = Math.abs(pt.x - x);
  const dr = Math.abs(pt.x - (x + w));
  const dt = Math.abs(pt.y - y);
  const db = Math.abs(pt.y - (y + h));
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return "left";
  if (m === dr) return "right";
  if (m === dt) return "top";
  return "bottom";
}

export type ReviewLayoutMode = "linear" | "parallelTracks" | "peerRows" | "threeBand" | "auto";

export function reviewProcessCanvas(args: {
  steps: FlowStep[];
  canvas: CanvasDto;
  distance?: QuickdrawDistance | null;
  modelKind?: "process" | "process-map" | "unknown";
  /** Layout hint — peerRows/parallelTracks use per-row midlines; threeBand softens band I/O. */
  layoutMode?: ReviewLayoutMode;
}): {
  findings: ReviewFinding[];
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
    ok: boolean;
  };
  summaryText: string;
} {
  const findings: ReviewFinding[] = [];
  const steps = args.steps;
  const vertices = args.canvas.vertices ?? [];
  const edges = args.canvas.edges ?? [];
  const byId = new Map(vertices.filter((v) => v.uuid).map((v) => [v.uuid!, v]));
  const stepById = new Map(steps.filter((s) => s.vertexId).map((s) => [s.vertexId!, s] as const));
  const gapX = Math.max(args.distance?.left ?? 40, args.distance?.right ?? 40, 30);

  const activities = steps.filter((s) => ACTIVITY_TYPES.has(normType(s.objectType)));
  const processes = steps.filter((s) => PROCESS_OBJECT_TYPES.has(normType(s.objectType)));
  const bos = steps.filter((s) => BUSINESS_OBJECT_TYPES.has(normType(s.objectType)));
  const isMap =
    args.modelKind === "process-map" || (processes.length > 0 && activities.length === 0);
  const layoutMode: ReviewLayoutMode = args.layoutMode ?? "auto";

  const processHasFlowIo = (p: FlowStep): boolean => {
    const inn = (p.inputs ?? []).some((i) => BUSINESS_OBJECT_TYPES.has(normType(i.objectType)));
    const out = (p.outputs ?? []).some((o) => BUSINESS_OBJECT_TYPES.has(normType(o.objectType)));
    return inn || out;
  };
  const withFlow = processes.filter(
    (p) => processHasFlowIo(p) && !((p.x ?? 0) < 80 && (p.y ?? 0) < 80 && processes.length > 1),
  );
  const withoutFlow = processes.filter(
    (p) => !processHasFlowIo(p) && !((p.x ?? 0) < 80 && (p.y ?? 0) < 80 && processes.length > 1),
  );
  const multiRowLayout =
    layoutMode === "peerRows" ||
    layoutMode === "parallelTracks" ||
    (layoutMode === "auto" && isMap && withFlow.length >= 2 && yBandCount(withFlow) >= 2);
  const threeBandLayout =
    layoutMode === "threeBand" ||
    (layoutMode === "auto" && isMap && withFlow.length >= 1 && withoutFlow.length >= 2);

  // --- Methodology ---
  if (!isMap) {
    for (const a of activities) {
      const flowInBo = (a.inputs ?? []).filter((i) =>
        BUSINESS_OBJECT_TYPES.has(normType(i.objectType)),
      );
      const flowInDecision = (a.inputs ?? []).filter((i) =>
        DECISION_TYPES.has(normType(i.objectType)),
      );
      const flowOut = (a.outputs ?? []).filter((o) =>
        BUSINESS_OBJECT_TYPES.has(normType(o.objectType)),
      );
      // Vägval pattern: activity → BO → or → activity. FLOW from vägval to
      // activity is correct; decision-only input does not require an extra BO.
      if (flowInBo.length === 0 && flowInDecision.length === 0) {
        findings.push({
          id: "activity-missing-input-bo",
          severity: "error",
          category: "methodology",
          message: `Activity "${a.title ?? "?"}" has no FLOW business-object input.`,
          suggestion:
            "Add a value/artefact BO on the left of the activity and connect with FLOW (left-in).",
          titles: [a.title ?? ""],
          vertexIds: a.vertexId ? [a.vertexId] : [],
        });
      }
      if (flowOut.length === 0) {
        findings.push({
          id: "activity-missing-output-bo",
          severity: "error",
          category: "methodology",
          message: `Activity "${a.title ?? "?"}" has no FLOW business-object output.`,
          suggestion:
            "Add a value/artefact BO on the right of the activity and connect with FLOW (right-out).",
          titles: [a.title ?? ""],
          vertexIds: a.vertexId ? [a.vertexId] : [],
        });
      }
      if (!(a.responsible ?? []).length) {
        findings.push({
          id: "activity-missing-performer",
          severity: "warning",
          category: "methodology",
          message: `Activity "${a.title ?? "?"}" has no RACI_RESPONSIBLE performer.`,
          suggestion:
            "Place a role under the activity and link with set_activity_performer (one placement per activity).",
          titles: [a.title ?? ""],
          vertexIds: a.vertexId ? [a.vertexId] : [],
        });
      }
    }
    // Vägval → BO is wrong; decision is taken in the activity before the or,
    // carried in that activity's output BO. Pattern: activity → BO → or → activity.
    for (const d of steps) {
      if (!DECISION_TYPES.has(normType(d.objectType))) continue;
      for (const out of d.outputs ?? []) {
        if (!BUSINESS_OBJECT_TYPES.has(normType(out.objectType))) continue;
        findings.push({
          id: "vägval-flow-to-bo",
          severity: "error",
          category: "methodology",
          message: `FLOW from vägval "${d.title ?? "?"}" to business object "${out.title ?? "?"}" — branches must target activities.`,
          suggestion:
            "Vägval is a reader aid: activity → BO → or → real next activity. The BO before the or carries the decision; do not emit a new BO from the vägval, and do not invent filler activities after it.",
          titles: [d.title ?? "", out.title ?? ""],
          vertexIds: compactIds(d.vertexId, out.vertexId),
        });
      }
    }
    // BO → BO without an activity/decision between is not a value stream
    for (const bo of bos) {
      for (const out of bo.outputs ?? []) {
        if (!BUSINESS_OBJECT_TYPES.has(normType(out.objectType))) continue;
        findings.push({
          id: "bo-to-bo-flow",
          severity: "error",
          category: "methodology",
          message: `FLOW from business object "${bo.title ?? "?"}" directly to business object "${out.title ?? "?"}" — insert an activity (or vägval) between them.`,
          suggestion: "Value stream is BO → activity → BO, never BO → BO.",
          titles: [bo.title ?? "", out.title ?? ""],
          vertexIds: compactIds(bo.vertexId, out.vertexId),
        });
      }
    }
    // Activity → Activity skips the value BO (often a duplicate chord beside BO→activity→BO)
    for (const a of activities) {
      for (const out of a.outputs ?? []) {
        if (!ACTIVITY_TYPES.has(normType(out.objectType))) continue;
        findings.push({
          id: "activity-to-activity-flow",
          severity: "error",
          category: "methodology",
          message: `FLOW from activity "${a.title ?? "?"}" directly to activity "${out.title ?? "?"}" — value stream must go through a business object.`,
          suggestion:
            "Remove the activity→activity edge; keep BO → activity → BO (e.g. output BO of the first as input of the next).",
          titles: [a.title ?? "", out.title ?? ""],
          vertexIds: compactIds(a.vertexId, out.vertexId),
        });
      }
    }
    // Spine content left of map margin (title icon process at ~20,20 is OK)
    for (const s of [...activities, ...bos]) {
      if ((s.x ?? 0) < MAP_LEFT_MARGIN) {
        findings.push({
          id: "spine-too-far-left",
          severity: "warning",
          category: "layout",
          message: `"${s.title ?? "?"}" is left of the ${MAP_LEFT_MARGIN}px spine margin (x=${Math.round(s.x ?? 0)}).`,
          suggestion: `Start the FLOW spine at x≥${MAP_LEFT_MARGIN}.`,
          titles: [s.title ?? ""],
          vertexIds: s.vertexId ? [s.vertexId] : [],
        });
      }
    }
  } else {
    // Side-loop detection from BO spine midY (not average of all processes)
    const boMids = bos.map((b) => midY(b));
    const mapSpineMid =
      boMids.length > 0
        ? median(boMids)
        : median(
            processes.filter((p) => !((p.x ?? 0) < 80 && (p.y ?? 0) < 80)).map((p) => midY(p)),
          );
    for (const p of processes) {
      const flowIn = (p.inputs ?? []).filter((i) =>
        BUSINESS_OBJECT_TYPES.has(normType(i.objectType)),
      );
      const flowOut = (p.outputs ?? []).filter((o) =>
        BUSINESS_OBJECT_TYPES.has(normType(o.objectType)),
      );
      // Skip tiny corner process chevron used as title icon (often top-left)
      if ((p.x ?? 0) < 80 && (p.y ?? 0) < 80 && processes.length > 1) {
        continue;
      }
      if ((p.x ?? 0) < MAP_LEFT_MARGIN) {
        findings.push({
          id: "map-too-far-left",
          severity: "warning",
          category: "layout",
          message: `Process "${p.title ?? "?"}" is left of the ${MAP_LEFT_MARGIN}px map margin (x=${Math.round(p.x ?? 0)}).`,
          suggestion:
            "Place side loops under/right of the state BO — never to the left of the spine.",
          titles: [p.title ?? ""],
          vertexIds: p.vertexId ? [p.vertexId] : [],
        });
      }
      // Side loops sit under a state BO: FLOW in only — no spine output required
      const isSideLoop =
        !multiRowLayout && !threeBandLayout && Math.abs(midY(p) - mapSpineMid) > 55;
      // L0 three-band: management/support chevrons intentionally have no FLOW
      const bandException = threeBandLayout && flowIn.length === 0 && flowOut.length === 0;
      if (flowIn.length === 0) {
        findings.push({
          id: bandException ? "process-missing-input-bo-approved" : "process-missing-input-bo",
          severity: bandException ? "info" : "error",
          category: "methodology",
          message: bandException
            ? `Process "${p.title ?? "?"}" has no FLOW input (approved threeBand L0 band exception — ledning/stöd/coreProcessIds).`
            : `Process "${p.title ?? "?"}" on the map has no FLOW business-object input.`,
          suggestion: bandException
            ? "Expected for threeBand management/support/coreProcessIds chevrons without FLOW — do not invent bridge BOs."
            : isSideLoop
              ? "Side loop must FLOW from a state business object on the map (fromBoTitle)."
              : multiRowLayout
                ? "Peer row should have its own detail-scope input BO — use create_process_map(layout.mode=peerRows)."
                : "Overview I/O must match detail scope — use get_detail_process_scope / create_process_map(detailModelIds).",
          titles: [p.title ?? ""],
          vertexIds: p.vertexId ? [p.vertexId] : [],
        });
      }
      if (flowOut.length === 0 && !isSideLoop && !bandException) {
        findings.push({
          id: "process-missing-output-bo",
          severity: "error",
          category: "methodology",
          message: `Process "${p.title ?? "?"}" on the map has no FLOW business-object output.`,
          suggestion: multiRowLayout
            ? "Peer row should have its own detail-scope output BO — use create_process_map(layout.mode=peerRows)."
            : "Overview I/O must match detail scope — use get_detail_process_scope / create_process_map(detailModelIds).",
          titles: [p.title ?? ""],
          vertexIds: p.vertexId ? [p.vertexId] : [],
        });
      }
    }
  }

  for (const s of steps) {
    if (isForbiddenJoinType(s.objectType ?? "")) {
      findings.push({
        id: "forbidden-join",
        severity: "error",
        category: "methodology",
        message: `Forbidden Join/Förbinda symbol "${s.title ?? "?"}" is present.`,
        suggestion: "Remove join; reconnect FLOW paths without a join object.",
        titles: [s.title ?? ""],
        vertexIds: s.vertexId ? [s.vertexId] : [],
      });
    }
    if (normType(s.objectType) === "gateway") {
      findings.push({
        id: "forbidden-gateway-type",
        severity: "error",
        category: "methodology",
        message: `Invalid objectType gateway on "${s.title ?? "?"}".`,
        suggestion: 'Replace with Regel (Eller) objectType "or".',
        titles: [s.title ?? ""],
        vertexIds: s.vertexId ? [s.vertexId] : [],
      });
    }
  }

  // Role fan-out: one role vertex → multiple activities via RACI
  const roleToActivities = new Map<string, string[]>();
  for (const e of edges) {
    if (!isRaciEdge(e.edgeType)) continue;
    const from = byId.get(e.fromVertex ?? "");
    const to = byId.get(e.toVertex ?? "");
    if (!from || !to) continue;
    const fromOt = normType(
      typeof from.objectType === "string"
        ? from.objectType
        : (from as { objectType?: string }).objectType,
    );
    // objectType may live on symbol; use step map
    const fromStep = from.uuid ? stepById.get(from.uuid) : undefined;
    const toStep = to.uuid ? stepById.get(to.uuid) : undefined;
    if (!RESPONSIBILITY_TYPES.has(normType(fromStep?.objectType ?? fromOt))) {
      continue;
    }
    if (!ACTIVITY_TYPES.has(normType(toStep?.objectType))) continue;
    const key = from.uuid!;
    const list = roleToActivities.get(key) ?? [];
    list.push(toStep?.title ?? to.uuid!);
    roleToActivities.set(key, list);
  }
  for (const [vid, acts] of roleToActivities) {
    const uniq = [...new Set(acts)];
    if (uniq.length > 1) {
      const role = stepById.get(vid);
      findings.push({
        id: "role-fan-out",
        severity: "error",
        category: "methodology",
        message: `Role "${role?.title ?? vid}" is linked to multiple activities from one canvas placement: ${uniq.join(", ")}.`,
        suggestion:
          "Place a separate role vertex under each activity (shared symbol UUID, separate placements).",
        titles: [role?.title ?? "", ...uniq],
        vertexIds: [vid],
      });
    }
  }

  // Performer hygiene: compound titles, orphan placements, illegal role→CONTROLS
  const raciVertexIds = new Set<string>();
  for (const e of edges) {
    if (!isRaciEdge(e.edgeType)) continue;
    if (e.fromVertex) raciVertexIds.add(e.fromVertex);
    if (e.toVertex) raciVertexIds.add(e.toVertex);
  }
  for (const v of vertices) {
    if (!v.uuid) continue;
    const ot = normType(objectTypeOf(v, stepById));
    if (!RESPONSIBILITY_TYPES.has(ot)) continue;
    const title = (v.uuid ? stepById.get(v.uuid) : undefined)?.title ?? vertexTitle(v);

    if (isCompoundPerformerTitle(title)) {
      findings.push({
        id: "compound-performer-title",
        severity: "warning",
        category: "methodology",
        message: `Performer "${title}" joins two actors with "och" in one title.`,
        suggestion:
          "Prefer two symbols + two RACI_RESPONSIBLE edges (search_symbols per part). Keep one combined title only for an intentional joint function; coordinated 'X- och Y…' compounds are fine.",
        titles: [title],
        vertexIds: [v.uuid],
      });
    }

    if (!raciVertexIds.has(v.uuid)) {
      findings.push({
        id: "orphan-performer-vertex",
        severity: "warning",
        category: "methodology",
        message: `Performer "${title}" is on the canvas without a RACI_RESPONSIBLE edge.`,
        suggestion:
          "Link with set_activity_performer (one placement under the owned activity), or delete_canvas_vertex if the icon is leftover.",
        titles: [title],
        vertexIds: [v.uuid],
      });
    }
  }

  for (const e of edges) {
    if (!isControlsEdge(e.edgeType)) continue;
    const from = byId.get(e.fromVertex ?? "");
    const to = byId.get(e.toVertex ?? "");
    if (!from || !to) continue;
    const fromOt = normType(objectTypeOf(from, stepById));
    const toOt = normType(objectTypeOf(to, stepById));
    const fromIsPerformer = RESPONSIBILITY_TYPES.has(fromOt);
    const toIsPerformer = RESPONSIBILITY_TYPES.has(toOt);
    if (!fromIsPerformer && !toIsPerformer) continue;
    const performer = fromIsPerformer ? from : to;
    const other = fromIsPerformer ? to : from;
    const performerTitle =
      (performer.uuid ? stepById.get(performer.uuid) : undefined)?.title ?? vertexTitle(performer);
    const otherTitle =
      (other.uuid ? stepById.get(other.uuid) : undefined)?.title ?? vertexTitle(other);
    findings.push({
      id: "role-controls-document",
      severity: "error",
      category: "methodology",
      message: `CONTROLS edge involves performer "${performerTitle}" and "${otherTitle}" — checklists/policies govern activities, not roles.`,
      suggestion:
        "delete_canvas_edge the role CONTROLS link; attach step-specific CONTROLS on the activity (set_activity_controls) or process-wide docs on the process/model Documents panel.",
      titles: [performerTitle, otherTitle],
      vertexIds: compactIds(performer.uuid, other.uuid),
    });
  }

  // Process-wide document fan-out: same CORE_DOCUMENT CONTROLS/IS_USED_BY on most activities
  if (!isMap) {
    const activityCount = activities.length;
    type DocFan = {
      title: string;
      objectType: string;
      edgeType: string;
      activityTitles: Set<string>;
      vertexIds: string[];
    };
    const bySymbol = new Map<string, DocFan>();
    for (const e of edges) {
      if (!isDocLinkEdge(e.edgeType)) continue;
      const from = byId.get(e.fromVertex ?? "");
      const to = byId.get(e.toVertex ?? "");
      if (!from || !to) continue;
      const fromOt = normType(objectTypeOf(from, stepById));
      const toOt = normType(objectTypeOf(to, stepById));
      if (!ACTIVITY_TYPES.has(toOt)) continue;
      const isDoc = DOCUMENT_OBJECT_TYPES.has(fromOt);
      const isApp = APPLICATION_OBJECT_TYPES.has(fromOt);
      if (!isDoc && !isApp) continue;
      const sid = symbolIdOf(from) || from.uuid || "";
      if (!sid) continue;
      const edgeNorm = normType(e.edgeType);
      const key = `${sid}|${edgeNorm}|${isDoc ? "doc" : "app"}`;
      const toTitle = (to.uuid ? stepById.get(to.uuid) : undefined)?.title ?? vertexTitle(to);
      const cur = bySymbol.get(key) ?? {
        title: vertexTitle(from),
        objectType: isDoc ? "document" : "application",
        edgeType: edgeNorm.includes("control") || edgeNorm === "styr" ? "CONTROLS" : "IS_USED_BY",
        activityTitles: new Set<string>(),
        vertexIds: [],
      };
      cur.activityTitles.add(toTitle);
      if (from.uuid) cur.vertexIds.push(from.uuid);
      bySymbol.set(key, cur);
    }
    const halfThreshold = Math.max(3, Math.ceil(activityCount / 2));
    for (const fan of bySymbol.values()) {
      const n = fan.activityTitles.size;
      if (activityCount < 3 || n < halfThreshold) continue;
      const nearlyAll = n >= activityCount || (activityCount >= 4 && n >= activityCount - 1);
      if (fan.objectType === "application") {
        if (!nearlyAll) continue;
        findings.push({
          id: "process-wide-application-fan-out",
          severity: "info",
          category: "methodology",
          message: `Application "${fan.title}" is IS_USED_BY-linked to ${n}/${activityCount} activities.`,
          suggestion:
            "Only draw systems under steps that uniquely use them; generic always-on tools can stay off the canvas.",
          titles: [fan.title, ...fan.activityTitles],
          vertexIds: [...new Set(fan.vertexIds)],
        });
        continue;
      }
      findings.push({
        id: "process-wide-document-fan-out",
        severity: nearlyAll ? "error" : "warning",
        category: "methodology",
        message: `Document "${fan.title}" has ${fan.edgeType} links to ${n}/${activityCount} activities (process-wide fan-out).`,
        suggestion:
          "Keep only step-specific CONTROLS (policy/riktlinje) and IS_USED_BY (mall/blankett) on activities. Attach process-wide docs on the process/model instead — see get_methodology(documents-on-process).",
        titles: [fan.title, ...fan.activityTitles],
        vertexIds: [...new Set(fan.vertexIds)],
      });
    }
  }

  // --- Layout: overlap ---
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    if (!a.uuid) continue;
    const boxA = {
      x: a.x ?? 0,
      y: a.y ?? 0,
      width: a.width ?? 75,
      height: a.height ?? 50,
    };
    for (let j = i + 1; j < vertices.length; j++) {
      const b = vertices[j]!;
      if (!b.uuid) continue;
      const boxB = {
        x: b.x ?? 0,
        y: b.y ?? 0,
        width: b.width ?? 75,
        height: b.height ?? 50,
      };
      if (boxesOverlap(boxA, boxB)) {
        const ta = (a.uuid ? stepById.get(a.uuid) : undefined)?.title ?? a.uuid;
        const tb = (b.uuid ? stepById.get(b.uuid) : undefined)?.title ?? b.uuid;
        findings.push({
          id: "overlapping-vertices",
          severity: "error",
          category: "layout",
          message: `Symbols overlap: "${ta}" and "${tb}".`,
          suggestion: "Move apart; stack secondary I/O below primary, not on top.",
          titles: [String(ta), String(tb)],
          vertexIds: [a.uuid, b.uuid],
        });
      }
    }
  }

  // --- Layout: spine alignment ---
  // Single-spine: median of activity/process midY. Multi-row peers: per Y-band.
  // Gold layout: activity y=119 h=50 and BO y=135 h=18 share midY≈144.
  const spineCandidates = steps.filter((s) => {
    const ot = normType(s.objectType);
    return ACTIVITY_TYPES.has(ot) || PROCESS_OBJECT_TYPES.has(ot) || BUSINESS_OBJECT_TYPES.has(ot);
  });
  const activityMids = activities
    .filter((a) => !((a.x ?? 0) < 80 && (a.y ?? 0) < 80))
    .map((a) => midY(a));
  // Prefer FLOW spine processes / BOs — ignore three-band management/support without I/O
  const processMidsOnMap = (withFlow.length > 0 ? withFlow : processes)
    .filter((p) => !((p.x ?? 0) < 80 && (p.y ?? 0) < 80))
    .map((p) => midY(p));
  const boMidsForSpine = bos.map((b) => midY(b));
  const globalSpineMid =
    activityMids.length > 0
      ? median(activityMids)
      : boMidsForSpine.length > 0
        ? median(boMidsForSpine)
        : processMidsOnMap.length > 0
          ? median(processMidsOnMap)
          : median(spineCandidates.map((s) => midY(s)));

  const alignmentBands: Array<{ mid: number; members: typeof spineCandidates }> = multiRowLayout
    ? clusterByYBand(
        spineCandidates.filter((s) => {
          const ot = normType(s.objectType);
          if (PROCESS_OBJECT_TYPES.has(ot) && (s.x ?? 0) < 80 && (s.y ?? 0) < 80) return false;
          return true;
        }),
        70,
      ).map((members) => {
        const anchors = members.filter((m) => {
          const ot = normType(m.objectType);
          return ACTIVITY_TYPES.has(ot) || PROCESS_OBJECT_TYPES.has(ot);
        });
        const mid =
          anchors.length > 0
            ? median(anchors.map((a) => midY(a)))
            : median(members.map((m) => midY(m)));
        return { mid, members };
      })
    : [{ mid: globalSpineMid, members: spineCandidates }];

  const onSpine: typeof spineCandidates = [];
  for (const band of alignmentBands) {
    for (const s of band.members) {
      const ot = normType(s.objectType);
      if (PROCESS_OBJECT_TYPES.has(ot) && (s.x ?? 0) < 80 && (s.y ?? 0) < 80) continue;
      const dy = Math.abs(midY(s) - band.mid);
      if (dy > 55) continue;
      onSpine.push(s);
      if (BUSINESS_OBJECT_TYPES.has(ot)) {
        if (dy > 8) {
          findings.push({
            id: "bo-off-spine-midline",
            severity: "error",
            category: "layout",
            message: `Business object "${s.title ?? "?"}" midY is ${Math.round(dy)}px off the FLOW midline (expected midY≈${Math.round(band.mid)}).`,
            suggestion:
              "Center primary BOs on the same horizontal midline as the activity/process on that row (e.g. activity y=119 h=50 → BO y=135 h=18).",
            titles: [s.title ?? ""],
            vertexIds: s.vertexId ? [s.vertexId] : [],
          });
        }
        continue;
      }
      if (!ACTIVITY_TYPES.has(ot) && !PROCESS_OBJECT_TYPES.has(ot)) continue;
      if (dy > 40) {
        findings.push({
          id: "spine-misaligned",
          severity: "warning",
          category: "layout",
          message: `"${s.title ?? "?"}" is ${Math.round(dy)}px off the FLOW midline.`,
          suggestion: multiRowLayout
            ? "Align symbols within each peer row; cross-row midY differences are expected."
            : "Align activities/processes (and primary BOs) on one horizontal baseline.",
          titles: [s.title ?? ""],
          vertexIds: s.vertexId ? [s.vertexId] : [],
        });
      }
    }
  }

  // Zigzag FLOW: only within the same Y-band (skip cross-row peer edges)
  for (const e of edges) {
    if (!isFlowEdge(e.edgeType)) continue;
    const fromStep = e.fromVertex ? stepById.get(e.fromVertex) : undefined;
    const toStep = e.toVertex ? stepById.get(e.toVertex) : undefined;
    if (!fromStep || !toStep) continue;
    const fromOt = normType(fromStep.objectType);
    const toOt = normType(toStep.objectType);
    const spineTypes = (ot: string) =>
      ACTIVITY_TYPES.has(ot) || BUSINESS_OBJECT_TYPES.has(ot) || PROCESS_OBJECT_TYPES.has(ot);
    if (!spineTypes(fromOt) || !spineTypes(toOt)) continue;
    if ((toStep.x ?? 0) <= (fromStep.x ?? 0)) continue;
    const dyMid = Math.abs(midY(fromStep) - midY(toStep));
    if (dyMid <= SPINE_ALIGN_TOL) continue;
    if (multiRowLayout && dyMid > PEER_ROW_MIDY_SKIP) continue; // different peer rows
    // Side-branch / stacked secondary BO under vägval-Nej: intentional midY offset
    const involvesBo = isValueBusinessObject(fromOt) || isValueBusinessObject(toOt);
    if (involvesBo && dyMid > SIDE_BRANCH_MIDY_SKIP) continue;
    const involvesGateway = isDecisionType(fromOt) || isDecisionType(toOt);
    if (involvesGateway && dyMid > SIDE_BRANCH_MIDY_SKIP) continue;
    findings.push({
      id: "flow-spine-zigzag",
      severity: "warning",
      category: "layout",
      message: `FLOW "${fromStep.title}" → "${toStep.title}" zigzags (midY delta ${Math.round(dyMid)}px) — spine symbols should share one midline.`,
      suggestion: "Align BO and activity midY, then update_canvas_edges with reorthogonalize:true.",
      titles: [fromStep.title ?? "", toStep.title ?? ""],
      vertexIds: compactIds(fromStep.vertexId, toStep.vertexId),
    });
  }

  // --- Layout: horizontal spacing between consecutive spine L→R objects ---
  // Overview gold: ~32px gaps; flag wide gaps earlier (was gapX*4 ≈ 160, missed 130–140).
  const wideGapThreshold = isMap ? gapX * 2 : gapX * 2.5;
  const spineOrdered = onSpine.toSorted((a, b) => (a.x ?? 0) - (b.x ?? 0));
  for (let i = 0; i < spineOrdered.length - 1; i++) {
    const a = spineOrdered[i]!;
    const b = spineOrdered[i + 1]!;
    if (Math.abs((a.x ?? 0) - (b.x ?? 0)) < 10) continue;
    // Same row only when multi-row
    if (multiRowLayout && Math.abs(midY(a) - midY(b)) > 70) continue;
    const gap = (b.x ?? 0) - ((a.x ?? 0) + (a.width ?? 75));
    const minGap = Math.max(16, Math.floor(gapX * 0.35));
    if (gap < minGap) {
      findings.push({
        id: "spacing-too-tight",
        severity: gap < 10 ? "error" : "warning",
        category: "layout",
        message: `Tight horizontal gap (${Math.round(gap)}px) between "${a.title}" and "${b.title}".`,
        suggestion: `Use ~${gapX}px quickdraw spacing between spine symbols.`,
        titles: [a.title ?? "", b.title ?? ""],
        vertexIds: compactIds(a.vertexId, b.vertexId),
      });
    } else if (gap > wideGapThreshold) {
      findings.push({
        id: "spacing-too-wide",
        severity: isMap ? "warning" : "info",
        category: "layout",
        message: `Large horizontal gap (${Math.round(gap)}px) between "${a.title}" and "${b.title}".`,
        suggestion: `Tighten toward ~${Math.round(gapX)}–${Math.round(gapX * 1.2)}px (overview gold ≈32px with tight quickdraw).`,
        titles: [a.title ?? "", b.title ?? ""],
        vertexIds: compactIds(a.vertexId, b.vertexId),
      });
    }
  }

  // --- Layout: multi-I/O BOs in horizontal sequence (should be stacked) ---
  const boOnBand = bos.filter((b) =>
    alignmentBands.some((band) => Math.abs(midY(b) - band.mid) < 55),
  );
  const boSorted = boOnBand.toSorted((a, b) => (a.x ?? 0) - (b.x ?? 0));
  for (let i = 0; i < boSorted.length - 1; i++) {
    const a = boSorted[i]!;
    const b = boSorted[i + 1]!;
    const gap = (b.x ?? 0) - ((a.x ?? 0) + (a.width ?? 40));
    // Two BOs adjacent on spine with no process/activity between them in X
    const between = spineOrdered.filter(
      (s) =>
        (s.x ?? 0) > (a.x ?? 0) + 5 &&
        (s.x ?? 0) + (s.width ?? 0) < (b.x ?? 0) + 5 &&
        s.vertexId !== a.vertexId &&
        s.vertexId !== b.vertexId,
    );
    const betweenStep = between.some((s) => {
      const ot = normType(s.objectType);
      return ACTIVITY_TYPES.has(ot) || PROCESS_OBJECT_TYPES.has(ot);
    });
    if (!betweenStep && gap >= 0 && gap < gapX * 2.5) {
      findings.push({
        id: "multi-io-horizontal-sequence",
        severity: "warning",
        category: "layout",
        message: `Business objects "${a.title}" and "${b.title}" sit in a horizontal sequence on the spine.`,
        suggestion:
          "Keep one primary BO on the midline; stack the other directly below (same X) with FLOW to process/activity left (or from right).",
        titles: [a.title ?? "", b.title ?? ""],
        vertexIds: compactIds(a.vertexId, b.vertexId),
      });
    }
  }

  // --- Layout: FLOW attach sides on activity/process + crossings ---
  const flowEdges = edges.filter((e) => isFlowEdge(e.edgeType));
  let crossingPairs = 0;
  for (let i = 0; i < flowEdges.length; i++) {
    const e = flowEdges[i]!;
    const from = byId.get(e.fromVertex ?? "");
    const to = byId.get(e.toVertex ?? "");
    const pts = edgePoints(e, from, to);
    const fromStep = from?.uuid ? stepById.get(from.uuid) : undefined;
    const toStep = to?.uuid ? stepById.get(to.uuid) : undefined;
    const fromOt = normType(fromStep?.objectType);
    const toOt = normType(toStep?.objectType);

    if (pts.length >= 2) {
      if (ACTIVITY_TYPES.has(fromOt) || PROCESS_OBJECT_TYPES.has(fromOt)) {
        const side = attachSide(from ?? {}, pts[0]!);
        if (side === "top" || side === "bottom") {
          findings.push({
            id: "flow-attach-wrong-side-out",
            severity: "warning",
            category: "layout",
            message: `FLOW leaves "${fromStep?.title ?? "?"}" via ${side} — should leave on the RIGHT edge.`,
            suggestion: "Re-route FLOW: right-out from process/activity.",
            titles: [fromStep?.title ?? "", toStep?.title ?? ""],
            vertexIds: compactIds(from?.uuid, to?.uuid),
          });
        }
      }
      if (ACTIVITY_TYPES.has(toOt) || PROCESS_OBJECT_TYPES.has(toOt)) {
        const side = attachSide(to ?? {}, pts[pts.length - 1]!);
        if (side === "top" || side === "bottom") {
          findings.push({
            id: "flow-attach-wrong-side-in",
            severity: "warning",
            category: "layout",
            message: `FLOW enters "${toStep?.title ?? "?"}" via ${side} — should enter on the LEFT edge.`,
            suggestion: "Re-route FLOW: left-in to process/activity.",
            titles: [fromStep?.title ?? "", toStep?.title ?? ""],
            vertexIds: compactIds(from?.uuid, to?.uuid),
          });
        }
      }
    }

    for (let j = i + 1; j < flowEdges.length; j++) {
      const e2 = flowEdges[j]!;
      // Skip edges that share a vertex (common at joins of paths)
      if (
        e.fromVertex === e2.fromVertex ||
        e.fromVertex === e2.toVertex ||
        e.toVertex === e2.fromVertex ||
        e.toVertex === e2.toVertex
      ) {
        continue;
      }
      const from2 = byId.get(e2.fromVertex ?? "");
      const to2 = byId.get(e2.toVertex ?? "");
      const pts2 = edgePoints(e2, from2, to2);
      let crossed = false;
      for (let a = 0; a < pts.length - 1 && !crossed; a++) {
        for (let b = 0; b < pts2.length - 1; b++) {
          if (segmentsCross(pts[a]!, pts[a + 1]!, pts2[b]!, pts2[b + 1]!)) {
            crossed = true;
            break;
          }
        }
      }
      if (crossed) crossingPairs += 1;
    }
  }

  if (crossingPairs > 0) {
    findings.push({
      id: "flow-edge-crossings",
      severity: crossingPairs >= 3 ? "error" : "warning",
      category: "layout",
      message: `${crossingPairs} FLOW edge crossing(s) detected (spaghetti risk).`,
      suggestion:
        "Simplify routing: keep spine left→right, stack side I/O below, avoid diagonal chords across the model.",
    });
  }

  // --- Layout: satellite overlap (role + application same column under activity) ---
  if (!isMap) {
    for (const a of activities) {
      if (!a.vertexId) continue;
      const act = byId.get(a.vertexId);
      if (!act) continue;
      const actBottom = (act.y ?? 0) + (act.height ?? 50);
      const sats = vertices.filter((v) => {
        if (!v.uuid || v.uuid === a.vertexId) return false;
        const ot = normType(objectTypeOf(v, stepById));
        if (!RESPONSIBILITY_TYPES.has(ot) && !APPLICATION_OBJECT_TYPES.has(ot)) return false;
        const cy = midY(v);
        return cy > actBottom - 10 && cy < actBottom + 120;
      });
      for (let i = 0; i < sats.length; i++) {
        for (let j = i + 1; j < sats.length; j++) {
          const sa = sats[i]!;
          const sb = sats[j]!;
          const boxA = {
            x: sa.x ?? 0,
            y: sa.y ?? 0,
            width: sa.width ?? 30,
            height: sa.height ?? 18,
          };
          const boxB = {
            x: sb.x ?? 0,
            y: sb.y ?? 0,
            width: sb.width ?? 30,
            height: sb.height ?? 18,
          };
          const sameCol = Math.abs(midX(sa) - midX(sb)) < 20;
          if (boxesOverlap(boxA, boxB) || sameCol) {
            const ta = (sa.uuid ? stepById.get(sa.uuid) : undefined)?.title ?? vertexTitle(sa);
            const tb = (sb.uuid ? stepById.get(sb.uuid) : undefined)?.title ?? vertexTitle(sb);
            findings.push({
              id: "satellite-column-overlap",
              severity: "warning",
              category: "layout",
              message: `Satellites "${ta}" and "${tb}" overlap or share a column under "${a.title ?? "?"}".`,
              suggestion:
                "Place the primary role centered under the activity; put applications to the RIGHT of the role (not stacked on the label).",
              titles: [a.title ?? "", ta, tb],
              vertexIds: [a.vertexId, sa.uuid!, sb.uuid!],
            });
          }
        }
      }
    }

    // Vägval Nej/side branch left of or while Ja continues right
    for (const d of steps) {
      if (!DECISION_TYPES.has(normType(d.objectType))) continue;
      if (!d.vertexId) continue;
      const orX = d.x ?? 0;
      const outActs = (d.outputs ?? [])
        .filter((o) => ACTIVITY_TYPES.has(normType(o.objectType)))
        .map((o) => (o.vertexId ? stepById.get(o.vertexId) : undefined) ?? o)
        .filter((s): s is FlowStep => Boolean(s.vertexId));
      if (outActs.length < 2) continue;
      const rightward = outActs.filter((o) => (o.x ?? 0) >= orX - 5);
      const leftward = outActs.filter((o) => (o.x ?? 0) < orX - 5);
      if (rightward.length >= 1 && leftward.length >= 1) {
        for (const side of leftward) {
          findings.push({
            id: "vägval-side-branch-left-of-or",
            severity: "warning",
            category: "layout",
            message: `Vägval side branch "${side.title ?? "?"}" sits left of or "${d.title ?? "?"}" (x=${Math.round(side.x ?? 0)} < or x=${Math.round(orX)}) — FLOW often routes back through the diamond.`,
            suggestion:
              "Place Nej/side activities BELOW and to the RIGHT of the or (or at least not left of it); route FLOW or-bottom → down → activity left.",
            titles: [d.title ?? "", side.title ?? ""],
            vertexIds: compactIds(d.vertexId, side.vertexId),
          });
        }
      }
    }
  }

  // Non-orthogonal FLOW segments
  let nonOrtho = 0;
  for (const e of flowEdges) {
    const from = byId.get(e.fromVertex ?? "");
    const to = byId.get(e.toVertex ?? "");
    const pts = edgePoints(e, from, to);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx > 3 && dy > 3) nonOrtho += 1;
    }
  }
  if (nonOrtho > 0) {
    findings.push({
      id: "non-orthogonal-flow",
      severity: "info",
      category: "layout",
      message: `${nonOrtho} non-orthogonal FLOW segment(s).`,
      suggestion: "Prefer orthogonal polylines (horizontal/vertical only).",
    });
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const infoCount = findings.filter((f) => f.severity === "info").length;
  const ok = errorCount === 0;

  const lines = [
    `Granskning: ${errorCount} error(s), ${warningCount} warning(s), ${infoCount} info.`,
  ];
  for (const f of findings.slice(0, 40)) {
    lines.push(`- [${f.severity}/${f.category}] ${f.message}`);
  }
  if (findings.length > 40) {
    lines.push(`… och ${findings.length - 40} till.`);
  }
  if (ok && warningCount === 0) {
    lines.push("Inga allvarliga metodik- eller layoutfynd.");
  }

  return {
    findings,
    summary: { errorCount, warningCount, infoCount, ok },
    summaryText: lines.join("\n"),
  };
}
