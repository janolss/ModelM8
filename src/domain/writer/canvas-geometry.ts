import {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  PROCESS_EDGE_INSET,
  PROCESS_ROUTE_STUB,
} from "./constants.js";

export type LayoutBox = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  objectType?: string;
};

export function boxCenter(b: { x?: number; y?: number; width?: number; height?: number }): {
  x: number;
  y: number;
} {
  const w = b.width ?? DEFAULT_WIDTH;
  const h = b.height ?? DEFAULT_HEIGHT;
  return {
    x: (b.x ?? 0) + Math.floor(w / 2),
    y: (b.y ?? 0) + Math.floor(h / 2),
  };
}

export function isProcessObjectType(objectType?: string): boolean {
  const t = (objectType ?? "").toLowerCase().replace(/[\s_-]/g, "");
  return t === "process" || t === "processmodel";
}

export function isActivityObjectType(objectType?: string): boolean {
  const t = (objectType ?? "").toLowerCase().replace(/[\s_-]/g, "");
  return t === "activity";
}

/** FLOW spine types that must use left-in / right-out (never top/bottom). */
function isFlowLeftRightType(objectType?: string): boolean {
  return isProcessObjectType(objectType) || isActivityObjectType(objectType);
}

export function isFlowEdgeType(edgeType?: string): boolean {
  if (!edgeType) return false;
  const key = edgeType
    .trim()
    .toLowerCase()
    .replace(/[_\s-]/g, "");
  return key === "flow" || key === "sequence";
}

/**
 * Attachment point on the box border facing a target point (2c8 style).
 */
export function borderAttachment(
  box: { x?: number; y?: number; width?: number; height?: number },
  toward: { x: number; y: number },
): { x: number; y: number; side: "top" | "bottom" | "left" | "right" } {
  const x = box.x ?? 0;
  const y = box.y ?? 0;
  const w = box.width ?? DEFAULT_WIDTH;
  const h = box.height ?? DEFAULT_HEIGHT;
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2);
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { x: x + w, y: cy, side: "right" };
    }
    return { x, y: cy, side: "left" };
  }
  if (dy >= 0) {
    return { x: cx, y: y + h, side: "bottom" };
  }
  return { x: cx, y, side: "top" };
}

/**
 * FLOW incoming attach on left. Process chevrons inset into body;
 * activities use the left AABB edge (no inset).
 */
export function flowLeftAttach(box: LayoutBox): { x: number; y: number; side: "left" } {
  const x = box.x ?? 0;
  const y = box.y ?? 0;
  const w = box.width ?? DEFAULT_WIDTH;
  const h = box.height ?? DEFAULT_HEIGHT;
  const inset = isProcessObjectType(box.objectType) ? Math.floor(w * PROCESS_EDGE_INSET) : 0;
  return {
    x: x + inset,
    y: y + Math.floor(h / 2),
    side: "left",
  };
}

/** FLOW outgoing attach on right edge (no inset — matches MT). */
export function flowRightAttach(box: { x?: number; y?: number; width?: number; height?: number }): {
  x: number;
  y: number;
  side: "right";
} {
  const x = box.x ?? 0;
  const y = box.y ?? 0;
  const w = box.width ?? DEFAULT_WIDTH;
  const h = box.height ?? DEFAULT_HEIGHT;
  return {
    x: x + w,
    y: y + Math.floor(h / 2),
    side: "right",
  };
}

/**
 * Orthogonal route that respects process left-in / right-out, with detours
 * when the peer is above/below (side loops) instead of attaching to top/bottom.
 */
export function routeOrthogonal(
  p0: { x: number; y: number; side: "top" | "bottom" | "left" | "right" },
  pN: { x: number; y: number; side: "top" | "bottom" | "left" | "right" },
  opts?: { approachFromLeftOf?: number; departRightOf?: number },
): Array<{ x: number; y: number }> {
  // Process left-in / right-out detours first — do not collapse to a straight
  // chord that would cross the chevron body when peer is left/above/below.
  if (pN.side === "left" && opts?.approachFromLeftOf !== undefined) {
    const clearX = opts.approachFromLeftOf - PROCESS_ROUTE_STUB;
    const pts: Array<{ x: number; y: number }> = [{ x: p0.x, y: p0.y }];
    if (p0.x !== clearX) {
      pts.push({ x: clearX, y: p0.y });
    }
    if (p0.y !== pN.y) {
      pts.push({ x: clearX, y: pN.y });
    }
    pts.push({ x: pN.x, y: pN.y });
    return pts;
  }

  // Leaving a process right when target is not further right on the same row
  if (p0.side === "right" && opts?.departRightOf !== undefined) {
    const stubX = opts.departRightOf + PROCESS_ROUTE_STUB;
    return [
      { x: p0.x, y: p0.y },
      { x: stubX, y: p0.y },
      { x: stubX, y: pN.y },
      { x: pN.x, y: pN.y },
    ];
  }

  if (p0.x === pN.x || p0.y === pN.y) {
    return [
      { x: p0.x, y: p0.y },
      { x: pN.x, y: pN.y },
    ];
  }

  if (p0.side === "left" || p0.side === "right") {
    const midX = Math.floor((p0.x + pN.x) / 2);
    return [
      { x: p0.x, y: p0.y },
      { x: midX, y: p0.y },
      { x: midX, y: pN.y },
      { x: pN.x, y: pN.y },
    ];
  }
  const midY = Math.floor((p0.y + pN.y) / 2);
  return [
    { x: p0.x, y: p0.y },
    { x: p0.x, y: midY },
    { x: pN.x, y: midY },
    { x: pN.x, y: pN.y },
  ];
}

/**
 * FLOW involving process/activity: leave on the RIGHT and enter on the LEFT
 * (never top/bottom on those types). Other symbols keep normal border
 * attachment. Edge `points` are an orthogonal polyline.
 */
export function orthogonalPointsFlowLeftRight(
  from: LayoutBox,
  to: LayoutBox,
): Array<{
  x: number;
  y: number;
}> {
  const fromForced = isFlowLeftRightType(from.objectType);
  const toForced = isFlowLeftRightType(to.objectType);
  // When either end is process/activity, both use left-in / right-out so
  // BO↔activity and side branches stay off top/bottom of the activity.
  const forceBoth = fromForced || toForced;
  const fromCenter = boxCenter(from);
  const toCenter = boxCenter(to);

  const p0 = forceBoth ? flowRightAttach(from) : borderAttachment(from, toCenter);
  const pN = forceBoth ? flowLeftAttach(to) : borderAttachment(to, fromCenter);

  const opts: { approachFromLeftOf?: number; departRightOf?: number } = {};
  const sameRow = Math.abs(p0.y - pN.y) <= 8;
  if (forceBoth) {
    const targetLeft = to.x ?? 0;
    if (!sameRow || p0.x >= targetLeft - 2) {
      opts.approachFromLeftOf = targetLeft;
    }
    const sourceRight = (from.x ?? 0) + (from.width ?? DEFAULT_WIDTH);
    if (!sameRow || pN.x <= sourceRight + 2) {
      opts.departRightOf = sourceRight;
    }
  }

  return routeOrthogonal(p0, pN, opts);
}

/**
 * Orthogonal polyline with endpoints on symbol borders (not centers).
 * FLOW on process/activity: left-in / right-out (never top/bottom).
 * Non-FLOW (RACI/CONTROLS/IS_USED_BY): stacked symbols use top↔bottom.
 */
export function orthogonalPoints(
  from: LayoutBox,
  to: LayoutBox,
  edgeType?: string,
): Array<{ x: number; y: number }> {
  const isFlow = !edgeType || isFlowEdgeType(edgeType);
  if (isFlow && (isFlowLeftRightType(from.objectType) || isFlowLeftRightType(to.objectType))) {
    return orthogonalPointsFlowLeftRight(from, to);
  }

  const fy = from.y ?? 0;
  const fh = from.height ?? DEFAULT_HEIGHT;
  const ty = to.y ?? 0;
  const th = to.height ?? DEFAULT_HEIGHT;
  const fromCenter = boxCenter(from);
  const toCenter = boxCenter(to);

  const fromBelow = fy >= ty + th - 2;
  const fromAbove = fy + fh <= ty + 2;

  let p0: { x: number; y: number; side: "top" | "bottom" | "left" | "right" };
  let pN: { x: number; y: number; side: "top" | "bottom" | "left" | "right" };

  if (fromBelow) {
    p0 = { x: fromCenter.x, y: fy, side: "top" };
    pN = { x: toCenter.x, y: ty + th, side: "bottom" };
  } else if (fromAbove) {
    p0 = { x: fromCenter.x, y: fy + fh, side: "bottom" };
    pN = { x: toCenter.x, y: ty, side: "top" };
  } else {
    p0 = borderAttachment(from, toCenter);
    pN = borderAttachment(to, fromCenter);
  }

  return routeOrthogonal(p0, pN);
}

export function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  pad = 6,
): boolean {
  return !(
    a.x + a.width + pad <= b.x ||
    b.x + b.width + pad <= a.x ||
    a.y + a.height + pad <= b.y ||
    b.y + b.height + pad <= a.y
  );
}

/**
 * Nudge down first, then right — avoids turning multi-I/O stacks into a
 * horizontal sequence. Never leave two symbols on the same coordinates.
 */
export function findFreePlacement(
  occupied: Array<{ x: number; y: number; width: number; height: number }>,
  x: number,
  y: number,
  width: number,
  height: number,
  stepX = 24,
  stepY = 24,
): { x: number; y: number; shifted: boolean } {
  const collides = (cx: number, cy: number) =>
    occupied.some((o) => boxesOverlap({ x: cx, y: cy, width, height }, o));
  const cx0 = Math.round(x);
  const cy0 = Math.round(y);
  if (!collides(cx0, cy0)) {
    return { x: cx0, y: cy0, shifted: false };
  }
  for (let i = 1; i <= 100; i++) {
    const downY = cy0 + i * stepY;
    if (!collides(cx0, downY)) {
      return { x: cx0, y: downY, shifted: true };
    }
    const rightX = cx0 + i * stepX;
    if (!collides(rightX, cy0)) {
      return { x: rightX, y: cy0, shifted: true };
    }
    if (!collides(rightX, downY)) {
      return { x: rightX, y: downY, shifted: true };
    }
  }
  return {
    x: cx0,
    y: cy0 + 100 * stepY,
    shifted: true,
  };
}

/**
 * Group consecutive FLOW business objects so only the first stays on the
 * spine; extras are stacked below (multi input/output layout).
 */
export function groupSpineNodes<T extends { kind: string }>(
  nodes: T[],
): Array<{ type: "bo-group"; items: T[] } | { type: "step"; item: T }> {
  const groups: Array<{ type: "bo-group"; items: T[] } | { type: "step"; item: T }> = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i]!;
    if (node.kind === "businessObject") {
      const items: T[] = [];
      while (i < nodes.length && nodes[i]!.kind === "businessObject") {
        items.push(nodes[i]!);
        i += 1;
      }
      groups.push({ type: "bo-group", items });
    } else {
      groups.push({ type: "step", item: node });
      i += 1;
    }
  }
  return groups;
}

/**
 * FLOW spine placement: only nudge horizontally so BO and process stay on
 * the same vertical midline (never shift Y independently).
 */
export function findFreePlacementOnSpine(
  occupied: Array<{ x: number; y: number; width: number; height: number }>,
  x: number,
  y: number,
  width: number,
  height: number,
  stepX = 24,
): { x: number; y: number; shifted: boolean } {
  const collides = (cx: number) =>
    occupied.some((o) => boxesOverlap({ x: cx, y: Math.round(y), width, height }, o));
  const cy = Math.round(y);
  const cx = Math.round(x);
  if (!collides(cx)) {
    return { x: cx, y: cy, shifted: false };
  }
  for (let i = 1; i <= 200; i++) {
    const rightX = Math.round(x) + i * stepX;
    if (!collides(rightX)) {
      return { x: rightX, y: cy, shifted: true };
    }
  }
  return { x: Math.round(x) + 200 * stepX, y: cy, shifted: true };
}
