import type { CanvasDto, EdgeView, FlowStep, VertexView } from "../api/types.js";
import type { QuickdrawDistance } from "../methodology/rules-engine.js";
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

const ACTIVITY_TYPES = new Set(["activity", "aktivitet"]);
const PROCESS_OBJECT_TYPES = new Set(["process"]);
const BUSINESS_OBJECT_TYPES = new Set([
  "businessobject",
  "business_object",
  "verksamhetsobjekt",
  "document",
  "message",
  "meddelande",
]);
const DECISION_TYPES = new Set([
  "decision",
  "or",
  "eller",
  "and",
  "och",
  "gateway",
  "regel",
  "vägval",
  "vagval",
]);
const RESPONSIBILITY_TYPES = new Set([
  "role",
  "position",
  "organisation",
  "organization",
  "befattning",
  "roll",
  "stakeholder",
  "intressent",
]);
const FLOW_EDGE_TYPES = new Set(["flow", "sequence"]);
const RESPONSIBLE_EDGE_TYPES = new Set([
  "raci_responsible",
  "responsible",
  "ansvarig",
  "performs",
  "utför",
]);
const DOC_LINK_EDGE_TYPES = new Set([
  "controls",
  "control",
  "styr",
  "isusedby",
  "usedby",
  "anvandsav",
]);
const DOCUMENT_OBJECT_TYPES = new Set([
  "coredocument",
  "document",
  "dokument",
  "styrdokument",
]);
const APPLICATION_OBJECT_TYPES = new Set(["application", "applikation"]);
const MAP_LEFT_MARGIN = 80;

function normType(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[\s_-]+/g, "");
}

function isFlowEdge(et: string | undefined): boolean {
  const n = normType(et);
  return !n || FLOW_EDGE_TYPES.has(n);
}

function isRaciEdge(et: string | undefined): boolean {
  return RESPONSIBLE_EDGE_TYPES.has(normType(et));
}

function isDocLinkEdge(et: string | undefined): boolean {
  return DOC_LINK_EDGE_TYPES.has(normType(et));
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

function objectTypeOf(v: VertexView, steps: FlowStep[]): string {
  const step = steps.find((s) => s.vertexId === v.uuid);
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
  pad = 4,
): boolean {
  return !(
    a.x + a.width + pad <= b.x ||
    b.x + b.width + pad <= a.x ||
    a.y + a.height + pad <= b.y ||
    b.y + b.height + pad <= a.y
  );
}

function midY(v: { y?: number; height?: number }): number {
  return (v.y ?? 0) + (v.height ?? 50) / 2;
}

function midX(v: { x?: number; width?: number }): number {
  return (v.x ?? 0) + (v.width ?? 75) / 2;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
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

export function reviewProcessCanvas(args: {
  steps: FlowStep[];
  canvas: CanvasDto;
  distance?: QuickdrawDistance | null;
  modelKind?: "process" | "process-map" | "unknown";
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
  const byId = new Map(
    vertices.filter((v) => v.uuid).map((v) => [v.uuid!, v]),
  );
  const gapX = Math.max(args.distance?.left ?? 40, args.distance?.right ?? 40, 30);

  const activities = steps.filter((s) =>
    ACTIVITY_TYPES.has(normType(s.objectType)),
  );
  const processes = steps.filter((s) =>
    PROCESS_OBJECT_TYPES.has(normType(s.objectType)),
  );
  const bos = steps.filter((s) =>
    BUSINESS_OBJECT_TYPES.has(normType(s.objectType)),
  );
  const isMap =
    args.modelKind === "process-map" ||
    (processes.length > 0 && activities.length === 0);

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
          vertexIds: [d.vertexId, out.vertexId].filter(Boolean) as string[],
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
          vertexIds: [bo.vertexId, out.vertexId].filter(Boolean) as string[],
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
          vertexIds: [a.vertexId, out.vertexId].filter(Boolean) as string[],
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
            processes
              .filter((p) => !((p.x ?? 0) < 80 && (p.y ?? 0) < 80))
              .map((p) => midY(p)),
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
      const isSideLoop = Math.abs(midY(p) - mapSpineMid) > 55;
      if (flowIn.length === 0) {
        findings.push({
          id: "process-missing-input-bo",
          severity: "error",
          category: "methodology",
          message: `Process "${p.title ?? "?"}" on the map has no FLOW business-object input.`,
          suggestion: isSideLoop
            ? "Side loop must FLOW from a state business object on the map (fromBoTitle)."
            : "Overview I/O must match detail scope — use get_detail_process_scope / create_process_map(detailModelIds).",
          titles: [p.title ?? ""],
          vertexIds: p.vertexId ? [p.vertexId] : [],
        });
      }
      if (flowOut.length === 0 && !isSideLoop) {
        findings.push({
          id: "process-missing-output-bo",
          severity: "error",
          category: "methodology",
          message: `Process "${p.title ?? "?"}" on the map has no FLOW business-object output.`,
          suggestion:
            "Overview I/O must match detail scope — use get_detail_process_scope / create_process_map(detailModelIds).",
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
    const fromStep = steps.find((s) => s.vertexId === from.uuid);
    const toStep = steps.find((s) => s.vertexId === to.uuid);
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
      const role = steps.find((s) => s.vertexId === vid);
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
      const fromOt = normType(objectTypeOf(from, steps));
      const toOt = normType(objectTypeOf(to, steps));
      if (!ACTIVITY_TYPES.has(toOt)) continue;
      const isDoc = DOCUMENT_OBJECT_TYPES.has(fromOt);
      const isApp = APPLICATION_OBJECT_TYPES.has(fromOt);
      if (!isDoc && !isApp) continue;
      const sid = symbolIdOf(from) || from.uuid || "";
      if (!sid) continue;
      const edgeNorm = normType(e.edgeType);
      const key = `${sid}|${edgeNorm}|${isDoc ? "doc" : "app"}`;
      const toTitle =
        steps.find((s) => s.vertexId === to.uuid)?.title ?? vertexTitle(to);
      const cur = bySymbol.get(key) ?? {
        title: vertexTitle(from),
        objectType: isDoc ? "document" : "application",
        edgeType: edgeNorm.includes("control") || edgeNorm === "styr"
          ? "CONTROLS"
          : "IS_USED_BY",
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
        const ta = steps.find((s) => s.vertexId === a.uuid)?.title ?? a.uuid;
        const tb = steps.find((s) => s.vertexId === b.uuid)?.title ?? b.uuid;
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
  // Reference midline = median of ACTIVITY midY (not mixed with BO tops).
  // Gold layout: activity y=119 h=50 and BO y=135 h=18 share midY≈144.
  const spineCandidates = steps.filter((s) => {
    const ot = normType(s.objectType);
    return (
      ACTIVITY_TYPES.has(ot) ||
      PROCESS_OBJECT_TYPES.has(ot) ||
      BUSINESS_OBJECT_TYPES.has(ot)
    );
  });
  const activityMids = activities
    .filter((a) => !((a.x ?? 0) < 80 && (a.y ?? 0) < 80))
    .map((a) => midY(a));
  const processMidsOnMap = processes
    .filter((p) => !((p.x ?? 0) < 80 && (p.y ?? 0) < 80))
    .map((p) => midY(p));
  const spineMidRef =
    activityMids.length > 0
      ? median(activityMids)
      : processMidsOnMap.length > 0
        ? median(processMidsOnMap)
        : median(spineCandidates.map((s) => midY(s)));
  const onSpine = spineCandidates.filter(
    (s) => Math.abs(midY(s) - spineMidRef) < 55,
  );

  for (const s of spineCandidates) {
    const ot = normType(s.objectType);
    // Corner process icon
    if (PROCESS_OBJECT_TYPES.has(ot) && (s.x ?? 0) < 80 && (s.y ?? 0) < 80) {
      continue;
    }
    const dy = Math.abs(midY(s) - spineMidRef);
    // Side-loop / parallel-track / stacked secondary I/O sit below the spine
    if (dy > 55) {
      continue;
    }
    // Activities/processes: coarser tolerance; BOs must sit on the same midline
    // (top-aligning a small BO with an activity creates zigzag FLOW).
    if (BUSINESS_OBJECT_TYPES.has(ot)) {
      if (dy > 8) {
        findings.push({
          id: "bo-off-spine-midline",
          severity: "error",
          category: "layout",
          message: `Business object "${s.title ?? "?"}" midY is ${Math.round(dy)}px off the activity FLOW midline (expected midY≈${Math.round(spineMidRef)}).`,
          suggestion:
            "Center primary BOs on the same horizontal midline as activities (e.g. activity y=119 h=50 → BO y=135 h=18). Do not top-align BO with activity.",
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
        message: `"${s.title ?? "?"}" is ${Math.round(dy)}px off the main FLOW midline.`,
        suggestion:
          "Align activities/processes (and primary BOs) on one horizontal baseline.",
        titles: [s.title ?? ""],
        vertexIds: s.vertexId ? [s.vertexId] : [],
      });
    }
  }

  // Zigzag FLOW on the spine: vertical jogs between L→R neighbours that should share midY
  for (const e of edges) {
    if (!isFlowEdge(e.edgeType)) continue;
    const fromStep = steps.find((s) => s.vertexId === e.fromVertex);
    const toStep = steps.find((s) => s.vertexId === e.toVertex);
    if (!fromStep || !toStep) continue;
    const fromOt = normType(fromStep.objectType);
    const toOt = normType(toStep.objectType);
    const spineTypes = (ot: string) =>
      ACTIVITY_TYPES.has(ot) ||
      BUSINESS_OBJECT_TYPES.has(ot) ||
      PROCESS_OBJECT_TYPES.has(ot);
    if (!spineTypes(fromOt) || !spineTypes(toOt)) continue;
    // Only consecutive forward spine edges
    if ((toStep.x ?? 0) <= (fromStep.x ?? 0)) continue;
    const dyMid = Math.abs(midY(fromStep) - midY(toStep));
    if (dyMid <= 8) continue;
    findings.push({
      id: "flow-spine-zigzag",
      severity: "warning",
      category: "layout",
      message: `FLOW "${fromStep.title}" → "${toStep.title}" zigzags (midY delta ${Math.round(dyMid)}px) — spine symbols should share one midline.`,
      suggestion:
        "Align BO and activity midY, then update_canvas_edges with reorthogonalize:true.",
      titles: [fromStep.title ?? "", toStep.title ?? ""],
      vertexIds: [fromStep.vertexId, toStep.vertexId].filter(
        Boolean,
      ) as string[],
    });
  }

  // --- Layout: horizontal spacing between consecutive spine L→R objects ---
  const spineOrdered = onSpine
    .slice()
    .sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  for (let i = 0; i < spineOrdered.length - 1; i++) {
    const a = spineOrdered[i]!;
    const b = spineOrdered[i + 1]!;
    // Only measure between different columns (not stacked same-x)
    if (Math.abs((a.x ?? 0) - (b.x ?? 0)) < 10) continue;
    const gap = (b.x ?? 0) - ((a.x ?? 0) + (a.width ?? 75));
    // ~9px gaps are common when BO is jammed against the next activity — flag early
    const minGap = Math.max(16, Math.floor(gapX * 0.35));
    if (gap < minGap) {
      findings.push({
        id: "spacing-too-tight",
        severity: gap < 10 ? "error" : "warning",
        category: "layout",
        message: `Tight horizontal gap (${Math.round(gap)}px) between "${a.title}" and "${b.title}".`,
        suggestion: `Use ~${gapX}px quickdraw spacing between spine symbols.`,
        titles: [a.title ?? "", b.title ?? ""],
        vertexIds: [a.vertexId, b.vertexId].filter(Boolean) as string[],
      });
    } else if (gap > gapX * 4) {
      findings.push({
        id: "spacing-too-wide",
        severity: "info",
        category: "layout",
        message: `Large horizontal gap (${Math.round(gap)}px) between "${a.title}" and "${b.title}".`,
        suggestion: `Tighten toward ~${gapX}px for a readable chain.`,
        titles: [a.title ?? "", b.title ?? ""],
        vertexIds: [a.vertexId, b.vertexId].filter(Boolean) as string[],
      });
    }
  }

  // --- Layout: multi-I/O BOs in horizontal sequence (should be stacked) ---
  const boOnBand = bos.filter((b) => Math.abs(midY(b) - spineMidRef) < 55);
  const boSorted = boOnBand.slice().sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
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
        vertexIds: [a.vertexId, b.vertexId].filter(Boolean) as string[],
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
    const fromStep = steps.find((s) => s.vertexId === from?.uuid);
    const toStep = steps.find((s) => s.vertexId === to?.uuid);
    const fromOt = normType(fromStep?.objectType);
    const toOt = normType(toStep?.objectType);

    if (pts.length >= 2) {
      if (
        ACTIVITY_TYPES.has(fromOt) ||
        PROCESS_OBJECT_TYPES.has(fromOt)
      ) {
        const side = attachSide(from ?? {}, pts[0]!);
        if (side === "top" || side === "bottom") {
          findings.push({
            id: "flow-attach-wrong-side-out",
            severity: "warning",
            category: "layout",
            message: `FLOW leaves "${fromStep?.title ?? "?"}" via ${side} — should leave on the RIGHT edge.`,
            suggestion: "Re-route FLOW: right-out from process/activity.",
            titles: [fromStep?.title ?? "", toStep?.title ?? ""],
            vertexIds: [from?.uuid, to?.uuid].filter(Boolean) as string[],
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
            vertexIds: [from?.uuid, to?.uuid].filter(Boolean) as string[],
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
