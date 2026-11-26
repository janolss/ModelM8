import type { SymbolView, VertexView } from "../../api/types.js";
import { pickTitle } from "../../util/titles.js";

const PROCESS_TYPE_HINTS = ["process", "swimlane", "simbane"];

export function isProcessLike(modelType: string | undefined): boolean {
  const t = (modelType ?? "").toLowerCase();
  return PROCESS_TYPE_HINTS.some((h) => t.includes(h));
}

export function normType(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[\s-]+/g, "");
}

export function symbolIdOf(vertex: VertexView): string | undefined {
  if (typeof vertex.symbol === "string") {
    return vertex.symbol;
  }
  if (vertex.symbol && typeof vertex.symbol === "object") {
    return vertex.symbol.uuid;
  }
  return undefined;
}

export function objectTypeOf(vertex: VertexView): string | undefined {
  if (vertex.objectType) {
    return vertex.objectType;
  }
  if (vertex.symbol && typeof vertex.symbol === "object") {
    return vertex.symbol.objectType;
  }
  return undefined;
}

export function titleOf(vertex: VertexView): string | undefined {
  return (
    pickTitle(vertex.labels) ??
    pickTitle(typeof vertex.symbol === "object" ? vertex.symbol?.titles : undefined) ??
    pickTitle((vertex as { titles?: VertexView["labels"] }).titles)
  );
}

export function documentIdOf(doc: unknown): string | undefined {
  if (typeof doc === "string") {
    return doc;
  }
  if (doc && typeof doc === "object") {
    const o = doc as Record<string, unknown>;
    if (typeof o.id === "string") return o.id;
    if (typeof o.uuid === "string") return o.uuid;
    if (typeof o.key === "string") return o.key;
  }
  return undefined;
}

export function documentTitleOf(doc: unknown): string | undefined {
  if (!doc || typeof doc !== "object") {
    return undefined;
  }
  const o = doc as Record<string, unknown>;
  if (typeof o.title === "string") {
    return o.title;
  }
  return pickTitle(o.titles as SymbolView["titles"]);
}

export function toWildcardFilter(query: string): string {
  const q = query.trim();
  if (!q) {
    return "*";
  }
  if (q.includes("*")) {
    return q;
  }
  return `*${q}*`;
}
