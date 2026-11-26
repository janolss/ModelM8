import type {
  CanvasDto,
  EdgeView,
  FlowStep,
  FlowStepRef,
  ModelView,
  VertexView,
} from "../../api/types.js";
import {
  APPLICATION_TYPES,
  FLOW_EDGE_TYPES,
  isControlsEdgeType,
  isFlowEdgeType,
  isRaciEdgeType,
  RESPONSIBILITY_TYPES,
} from "../../util/model-type-sets.js";
import { pickTitle } from "../../util/titles.js";
import { normType, objectTypeOf, symbolIdOf, titleOf } from "./vertex-utils.js";

const APPLICATION_EDGE_TYPES = new Set([
  "is_used_by",
  "uses",
  "used_by",
  "application",
  "isusedby",
]);

/**
 * Build ordered FLOW steps + edge summaries from an already-loaded model+canvas.
 * Document enrichment is left to the caller.
 */
export function buildFlowFromCanvas(args: { model: ModelView | null; canvas: CanvasDto }): {
  steps: FlowStep[];
  edges: Array<Record<string, unknown>>;
  swimlaneSettings: unknown;
  modelTitle?: string;
} {
  const { model, canvas } = args;
  const vertices = canvas.vertices ?? [];
  const edges = canvas.edges ?? [];
  const byId = new Map(vertices.filter((v) => v.uuid).map((v) => [v.uuid!, v]));

  const outgoing = new Map<string, EdgeView[]>();
  const incoming = new Map<string, EdgeView[]>();
  for (const e of edges) {
    if (e.fromVertex) {
      const list = outgoing.get(e.fromVertex) ?? [];
      list.push(e);
      outgoing.set(e.fromVertex, list);
    }
    if (e.toVertex) {
      const list = incoming.get(e.toVertex) ?? [];
      list.push(e);
      incoming.set(e.toVertex, list);
    }
  }

  const refOf = (vertexId: string | undefined): FlowStepRef | undefined => {
    if (!vertexId) {
      return undefined;
    }
    const v = byId.get(vertexId);
    if (!v) {
      return { vertexId };
    }
    return {
      vertexId: v.uuid,
      symbolId: symbolIdOf(v),
      objectType: objectTypeOf(v),
      title: titleOf(v),
    };
  };

  const classifyEdge = (
    edgeType: string | undefined,
    fromOt: string | undefined,
    toOt: string | undefined,
  ): "flow" | "responsible" | "application" | "controls" | "other" => {
    const et = normType(edgeType);
    if (isRaciEdgeType(edgeType)) {
      return "responsible";
    }
    if (APPLICATION_EDGE_TYPES.has(et)) {
      return "application";
    }
    if (isControlsEdgeType(edgeType)) {
      return "controls";
    }
    if (isFlowEdgeType(edgeType)) {
      return "flow";
    }
    if (RESPONSIBILITY_TYPES.has(normType(fromOt)) || RESPONSIBILITY_TYPES.has(normType(toOt))) {
      return "responsible";
    }
    if (APPLICATION_TYPES.has(normType(fromOt)) || APPLICATION_TYPES.has(normType(toOt))) {
      return "application";
    }
    return "other";
  };

  const buildStep = (v: VertexView): FlowStep => {
    const vid = v.uuid!;
    const ot = objectTypeOf(v);
    const step: FlowStep = {
      vertexId: vid,
      symbolId: symbolIdOf(v),
      objectType: ot,
      title: titleOf(v),
      x: v.x,
      y: v.y,
      width: v.width,
      height: v.height,
      hasDocument: v.hasDocument,
      inputs: [],
      outputs: [],
      responsible: [],
      applications: [],
      controls: [],
      controlledBy: [],
      otherRelations: [],
      outgoing: [],
    };

    for (const e of outgoing.get(vid) ?? []) {
      const to = refOf(e.toVertex);
      step.outgoing!.push({
        edgeId: e.uuid,
        edgeType: e.edgeType,
        toVertexId: e.toVertex,
        toTitle: to?.title,
        toObjectType: to?.objectType,
      });
      const kind = classifyEdge(e.edgeType, ot, to?.objectType);
      if (kind === "flow" && to) {
        step.outputs!.push(to);
      } else if (kind === "responsible" && to) {
        step.responsible!.push(to);
      } else if (kind === "application" && to) {
        step.applications!.push(to);
      } else if (kind === "controls" && to) {
        step.controls!.push(to);
      } else if (to) {
        step.otherRelations!.push({
          ...to,
          edgeType: e.edgeType,
          direction: "out",
        });
      }
    }

    for (const e of incoming.get(vid) ?? []) {
      const from = refOf(e.fromVertex);
      const kind = classifyEdge(e.edgeType, from?.objectType, ot);
      if (kind === "flow" && from) {
        step.inputs!.push(from);
      } else if (kind === "responsible" && from) {
        step.responsible!.push(from);
      } else if (kind === "application" && from) {
        step.applications!.push(from);
      } else if (kind === "controls" && from) {
        step.controlledBy!.push(from);
      } else if (from) {
        step.otherRelations!.push({
          ...from,
          edgeType: e.edgeType,
          direction: "in",
        });
      }
    }

    const dedupe = (list: FlowStepRef[] | undefined) => {
      const seen = new Set<string>();
      return (list ?? []).filter((r) => {
        const key = r.vertexId ?? r.symbolId ?? r.title ?? "";
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    };
    step.inputs = dedupe(step.inputs);
    step.outputs = dedupe(step.outputs);
    step.responsible = dedupe(step.responsible);
    step.applications = dedupe(step.applications);
    step.controls = dedupe(step.controls);
    step.controlledBy = dedupe(step.controlledBy);

    return step;
  };

  const starts = vertices.filter((v) => v.uuid && !incoming.get(v.uuid)?.length);
  const orderedIds: string[] = [];
  const visited = new Set<string>();
  const queue = [
    ...starts
      .slice()
      .sort((a, b) => (a.x ?? 0) - (b.x ?? 0))
      .map((v) => v.uuid!),
    ...vertices
      .slice()
      .sort((a, b) => (a.x ?? 0) - (b.x ?? 0))
      .map((v) => v.uuid!)
      .filter((id) => id && !starts.some((s) => s.uuid === id)),
  ];

  for (const startId of queue) {
    let current: string | undefined = startId;
    while (current && !visited.has(current)) {
      visited.add(current);
      orderedIds.push(current);
      const flowNext = (outgoing.get(current) ?? [])
        .filter((e) => FLOW_EDGE_TYPES.has(normType(e.edgeType)) || !e.edgeType)
        .map((e) => e.toVertex)
        .filter((id): id is string => typeof id === "string" && id.length > 0 && !visited.has(id))
        .sort((a, b) => (byId.get(a)?.x ?? 0) - (byId.get(b)?.x ?? 0));
      current = flowNext[0];
    }
  }
  for (const v of vertices) {
    if (v.uuid && !visited.has(v.uuid)) {
      orderedIds.push(v.uuid);
    }
  }

  const steps = orderedIds
    .map((id) => byId.get(id))
    .filter((v): v is VertexView => Boolean(v))
    .map(buildStep);

  return {
    modelTitle: pickTitle(model?.titles),
    steps,
    edges: edges.map((e) => ({
      uuid: e.uuid,
      edgeType: e.edgeType,
      fromVertex: e.fromVertex,
      toVertex: e.toVertex,
      fromTitle: refOf(e.fromVertex)?.title,
      toTitle: refOf(e.toVertex)?.title,
    })),
    swimlaneSettings: canvas.swimlaneSettings ?? null,
  };
}
