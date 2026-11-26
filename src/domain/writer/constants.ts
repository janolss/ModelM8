/** Soft cap for parallel title/scope I/O during batch writes. */
export const WRITE_IO_CONCURRENCY = 4;

export type CachedCanvasVertex = {
  uuid?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zOrder?: number;
  objectType?: string;
  symbol?: string | { uuid?: string; objectType?: string };
  breakdowns?: unknown[];
};

export type CachedCanvas = {
  vertices?: CachedCanvasVertex[];
  edges?: Array<{
    uuid?: string;
    fromVertex?: string;
    toVertex?: string;
    edgeType?: string;
    points?: Array<{ x?: number; y?: number }>;
    breakdowns?: unknown[];
    labels?: Record<
      string,
      { x?: number; y?: number; width?: number; height?: number; title?: string }
    >;
  }>;
  swimlaneSettings?: unknown;
  workflowState?: unknown;
};

export const DEFAULT_WIDTH = 75;
export const DEFAULT_HEIGHT = 50;
export const LABEL_OUTSIDE_GAP = 3;
export const LABEL_LINE_HEIGHT = 14;
export const LABEL_CHAR_WIDTH = 5.5;
/** Compact outside labels (matches typical 2c8 double-click wrap width). */
export const LABEL_OUTSIDE_MAX_WIDTH = 60;
export const Y_BASE = 120;
export const Y_BO = 135;
export const Y_ACTIVITY = 119;
/** Gateway/decision diamond — centered on activity midline (30×30). */
export const Y_GATEWAY = 129;
/**
 * Vertical gap from main-path activity.y to side-branch activity.y.
 * Leaves room under the upper activity for RACI role + apps before the Nej path.
 */
export const BRANCH_BELOW_ACTIVITY_GAP = 200;
/** Shared vertical midline for FLOW spine (BO + process/activity). */
export const SPINE_MID_Y = 178;
/**
 * Vertical gap from spine midline to management/support band midlines (threeBand).
 * With default SPINE_MID_Y=178 and process height 50 this would yield y≈−7 —
 * 2c8 rejects Vertex y < 0, so threeBand raises the spine (see below).
 */
export const THREE_BAND_GAP = 160;
/** 2c8 canvas requires Vertex y >= 0; keep a small top margin for labels. */
export const MIN_VERTEX_Y = 8;
/** Never place spine/side-loop content left of this (avoids x≈14 spaghetti). */
export const MAP_LEFT_MARGIN = 80;
/** Start X for FLOW spine on new maps / detail models. */
export const SPINE_START_X = 80;
/** Horizontal gap between parallel track columns under a shared BO. */
export const PARALLEL_TRACK_GAP = 48;
/**
 * Inset on process LEFT (incoming) only — matches Lättkrängt (~15–20% of width).
 * Outgoing RIGHT uses the AABB edge (no inset).
 */
export const PROCESS_EDGE_INSET = 0.2;
/** Extra stub when routing around a process (side loops / reverse direction). */
export const PROCESS_ROUTE_STUB = 24;
