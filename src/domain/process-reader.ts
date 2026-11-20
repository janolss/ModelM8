import type { TwoC8Client } from "../api/twoc8-client.js";
import type {
  BreakdownView,
  CanvasDto,
  EdgeView,
  FlowStep,
  FlowStepRef,
  ModelView,
  Page,
  SymbolView,
  VertexView,
} from "../api/types.js";
import { pickTitle, titleMatches } from "../util/titles.js";

const PROCESS_TYPE_HINTS = ["process", "swimlane", "simbane"];

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

/** Executable steps in a process model (excludes PROCESS map objects). */
const ACTIVITY_TYPES = new Set(["activity", "aktivitet"]);

const APPLICATION_TYPES = new Set([
  "application",
  "applikation",
  "it",
  "system",
]);

const BUSINESS_OBJECT_TYPES = new Set([
  "businessobject",
  "business_object",
  "verksamhetsobjekt",
  "document",
  "message",
  "meddelande",
]);

const FLOW_EDGE_TYPES = new Set(["flow", "sequence"]);
const RESPONSIBLE_EDGE_TYPES = new Set([
  "raci_responsible",
  "responsible",
  "ansvarig",
  "performs",
  "utför",
]);
const APPLICATION_EDGE_TYPES = new Set([
  "is_used_by",
  "uses",
  "used_by",
  "application",
]);
const CONTROLS_EDGE_TYPES = new Set(["controls", "control", "styr"]);

function isProcessLike(modelType: string | undefined): boolean {
  const t = (modelType ?? "").toLowerCase();
  return PROCESS_TYPE_HINTS.some((h) => t.includes(h));
}

function normType(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[\s-]+/g, "");
}

function symbolIdOf(vertex: VertexView): string | undefined {
  if (typeof vertex.symbol === "string") {
    return vertex.symbol;
  }
  if (vertex.symbol && typeof vertex.symbol === "object") {
    return vertex.symbol.uuid;
  }
  return undefined;
}

function objectTypeOf(vertex: VertexView): string | undefined {
  if (vertex.objectType) {
    return vertex.objectType;
  }
  if (vertex.symbol && typeof vertex.symbol === "object") {
    return vertex.symbol.objectType;
  }
  return undefined;
}

function titleOf(vertex: VertexView): string | undefined {
  // Canvas returns titles on labels; vertices?projection=ALL expands symbol.titles
  return (
    pickTitle(vertex.labels) ??
    pickTitle(
      typeof vertex.symbol === "object" ? vertex.symbol?.titles : undefined,
    ) ??
    pickTitle((vertex as { titles?: VertexView["labels"] }).titles)
  );
}

function documentIdOf(doc: unknown): string | undefined {
  if (typeof doc === "string") {
    return doc;
  }
  if (doc && typeof doc === "object") {
    const o = doc as Record<string, unknown>;
    if (typeof o.uuid === "string") {
      return o.uuid;
    }
    if (typeof o.id === "string") {
      return o.id;
    }
  }
  return undefined;
}

function documentTitleOf(doc: unknown): string | undefined {
  if (!doc || typeof doc !== "object") {
    return undefined;
  }
  const o = doc as Record<string, unknown>;
  if (typeof o.title === "string") {
    return o.title;
  }
  return pickTitle(o.titles as SymbolView["titles"]);
}

function toWildcardFilter(query: string): string {
  const q = query.trim();
  if (!q) {
    return "*";
  }
  if (q.includes("*")) {
    return q;
  }
  return `*${q}*`;
}

export class ProcessReader {
  /** Per-instance request cache for symbol fetches within one reader usage. */
  private readonly symbolCache = new Map<string, SymbolView>();

  constructor(private readonly client: TwoC8Client) {}

  async findModels(args: {
    repositoryId: string;
    query?: string;
    modelType?: string;
    startAt?: string;
    maxResults?: string;
  }): Promise<{ models: Array<Record<string, unknown>>; total?: number }> {
    const pageSize = Number.parseInt(args.maxResults ?? "100", 10) || 100;
    const startAt = Number.parseInt(args.startAt ?? "0", 10) || 0;
    const collected: ModelView[] = [];
    let apiTotal: number | undefined;
    let cursor = startAt;

    // Prefer server-side filter so matches outside the first page are found
    while (collected.length < pageSize) {
      const page = await this.client.request<Page<ModelView>>({
        path: "/api/v1/repositories/{repositoryId}/models",
        pathParams: { repositoryId: args.repositoryId },
        query: {
          startAt: String(cursor),
          maxResults: String(Math.min(100, pageSize)),
          projection: "ALL",
          ...(args.query
            ? { filter: toWildcardFilter(args.query), filterFields: "titles" }
            : {}),
        },
      });
      apiTotal = page.total;
      const batch = page.data ?? [];
      if (batch.length === 0) {
        break;
      }

      let filtered = batch;
      if (args.modelType) {
        const mt = args.modelType.toLowerCase();
        filtered = filtered.filter((m) =>
          (m.modelType ?? "").toLowerCase().includes(mt),
        );
      } else {
        filtered = filtered.filter((m) => isProcessLike(m.modelType));
      }
      // Extra client safety if API filter is broad
      if (args.query) {
        filtered = filtered.filter((m) => titleMatches(m.titles, args.query!));
      }

      collected.push(...filtered);
      cursor += batch.length;
      if (cursor >= (page.total ?? cursor) || batch.length === 0) {
        break;
      }
      // Without query, one page is enough for process-like browse
      if (!args.query) {
        break;
      }
    }

    const models = collected.slice(0, pageSize).map((m) => ({
      uuid: m.uuid,
      modelType: m.modelType,
      version: m.version,
      title: pickTitle(m.titles),
      titles: m.titles,
    }));

    return {
      total: args.query ? models.length : (apiTotal ?? models.length),
      models,
    };
  }

  async getOverview(args: {
    repositoryId: string;
    modelId: string;
  }): Promise<Record<string, unknown>> {
    const [model, canvas, layers] = await Promise.all([
      this.client.request<ModelView>({
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}",
        pathParams: {
          repositoryId: args.repositoryId,
          modelId: args.modelId,
        },
        query: { projection: "ALL" },
      }),
      this.client.request<CanvasDto>({
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
        pathParams: {
          repositoryId: args.repositoryId,
          modelId: args.modelId,
        },
      }),
      this.client
        .request({
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/layers",
          pathParams: {
            repositoryId: args.repositoryId,
            modelId: args.modelId,
          },
        })
        .catch(() => null),
    ]);

    return {
      uuid: model.uuid,
      modelType: model.modelType,
      version: model.version,
      title: pickTitle(model.titles),
      titles: model.titles,
      vertexCount: canvas.vertices?.length ?? 0,
      edgeCount: canvas.edges?.length ?? 0,
      hasSwimlanes: Boolean(canvas.swimlaneSettings),
      layers,
      workflowState: canvas.workflowState,
    };
  }

  async getFlow(args: {
    repositoryId: string;
    modelId: string;
    includeDocuments?: boolean;
  }): Promise<{
    steps: FlowStep[];
    edges: Array<Record<string, unknown>>;
    swimlaneSettings: unknown;
    modelTitle?: string;
  }> {
    const [model, canvas] = await Promise.all([
      this.client
        .request<ModelView>({
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}",
          pathParams: {
            repositoryId: args.repositoryId,
            modelId: args.modelId,
          },
          query: { projection: "ALL" },
        })
        .catch(() => null),
      this.client.request<CanvasDto>({
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
        pathParams: {
          repositoryId: args.repositoryId,
          modelId: args.modelId,
        },
      }),
    ]);

    const vertices = canvas.vertices ?? [];
    const edges = canvas.edges ?? [];
    const byId = new Map(
      vertices.filter((v) => v.uuid).map((v) => [v.uuid!, v]),
    );

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
      if (RESPONSIBLE_EDGE_TYPES.has(et)) {
        return "responsible";
      }
      if (APPLICATION_EDGE_TYPES.has(et)) {
        return "application";
      }
      if (CONTROLS_EDGE_TYPES.has(et)) {
        return "controls";
      }
      if (FLOW_EDGE_TYPES.has(et) || !et) {
        return "flow";
      }
      // Heuristic fallback from endpoint types
      if (
        RESPONSIBILITY_TYPES.has(normType(fromOt)) ||
        RESPONSIBILITY_TYPES.has(normType(toOt))
      ) {
        return "responsible";
      }
      if (
        APPLICATION_TYPES.has(normType(fromOt)) ||
        APPLICATION_TYPES.has(normType(toOt))
      ) {
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
          // Document CONTROLS activity: from doc → activity means activity is controlledBy doc
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

      // Deduplicate relation arrays by vertexId
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

    // Order: left-to-right by x, with flow-chain walk as secondary preference
    const starts = vertices.filter(
      (v) => v.uuid && !(incoming.get(v.uuid)?.length),
    );
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
          .filter((e) =>
            FLOW_EDGE_TYPES.has(normType(e.edgeType)) || !e.edgeType,
          )
          .map((e) => e.toVertex)
          .filter(
            (id): id is string =>
              typeof id === "string" && id.length > 0 && !visited.has(id),
          )
          .sort((a, b) => (byId.get(a)?.x ?? 0) - (byId.get(b)?.x ?? 0));
        current = flowNext[0];
      }
    }
    for (const v of vertices) {
      if (v.uuid && !visited.has(v.uuid)) {
        orderedIds.push(v.uuid);
      }
    }

    let steps = orderedIds
      .map((id) => byId.get(id))
      .filter((v): v is VertexView => Boolean(v))
      .map(buildStep);

    if (args.includeDocuments !== false) {
      steps = await this.enrichDocuments(args.repositoryId, steps);
    }

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

  private async enrichDocuments(
    repositoryId: string,
    steps: FlowStep[],
  ): Promise<FlowStep[]> {
    const needDocs = steps.filter((s) => s.hasDocument && s.symbolId);
    if (needDocs.length === 0) {
      return steps;
    }

    const symbols = await this.resolveSymbols({
      repositoryId,
      symbolIds: [
        ...new Set(needDocs.map((s) => s.symbolId!).filter(Boolean)),
      ],
    });
    const byId = new Map(
      symbols.symbols.map((s) => [s.uuid as string, s] as const),
    );

    return steps.map((step) => {
      if (!step.hasDocument || !step.symbolId) {
        return step;
      }
      const sym = byId.get(step.symbolId);
      const docs = (sym?.documents as unknown[] | undefined) ?? [];
      const resolvedDocs: Array<{ id: string; title?: string }> = [];
      for (const d of docs) {
        const id = documentIdOf(d);
        if (id) {
          resolvedDocs.push({ id, title: documentTitleOf(d) });
        }
      }
      return { ...step, documents: resolvedDocs };
    });
  }

  async describeProcess(args: {
    repositoryId: string;
    modelId: string;
  }): Promise<Record<string, unknown>> {
    const [overview, flow] = await Promise.all([
      this.getOverview(args),
      this.getFlow({ ...args, includeDocuments: true }),
    ]);

    const steps = flow.steps;
    const activities = steps.filter((s) =>
      ACTIVITY_TYPES.has(normType(s.objectType)),
    );
    const businessObjects = steps.filter((s) =>
      BUSINESS_OBJECT_TYPES.has(normType(s.objectType)),
    );

    // Start inputs: business objects not produced by an in-model activity
    const processInputs = businessObjects.filter(
      (bo) =>
        !(bo.inputs ?? []).some((i) =>
          ACTIVITY_TYPES.has(normType(i.objectType)),
        ),
    );

    // End outputs: produced by an activity and not feeding another activity
    const processOutputs = businessObjects.filter((bo) => {
      const fromActivity = (bo.inputs ?? []).some((i) =>
        ACTIVITY_TYPES.has(normType(i.objectType)),
      );
      const noFurtherActivity = !(bo.outputs ?? []).some((o) =>
        ACTIVITY_TYPES.has(normType(o.objectType)),
      );
      return fromActivity && noFurtherActivity;
    });

    const narrativeSteps = activities
      .slice()
      .sort((a, b) => (a.x ?? 0) - (b.x ?? 0))
      .map((a) => {
        const responsible = (a.responsible ?? [])
          .map((r) => r.title)
          .filter(Boolean)
          .join(", ");
        const apps = (a.applications ?? [])
          .map((r) => r.title)
          .filter(Boolean)
          .join(", ");
        const inputs = (a.inputs ?? [])
          .filter((i) => BUSINESS_OBJECT_TYPES.has(normType(i.objectType)))
          .map((i) => i.title)
          .filter(Boolean);
        const outputs = (a.outputs ?? [])
          .filter((o) => BUSINESS_OBJECT_TYPES.has(normType(o.objectType)))
          .map((o) => o.title)
          .filter(Boolean);
        return {
          title: a.title,
          responsible: responsible || undefined,
          applications: apps || undefined,
          inputs,
          outputs,
          documents: a.documents,
        };
      });

    const summaryLines: string[] = [];
    const modelTitle = flow.modelTitle ?? (overview.title as string) ?? "Process";
    summaryLines.push(`${modelTitle}:`);
    if (processInputs.length) {
      summaryLines.push(
        `Indata: ${processInputs.map((i) => i.title).filter(Boolean).join("; ")}.`,
      );
    }
    for (const step of narrativeSteps) {
      const parts = [step.title ?? "(utan titel)"];
      if (step.responsible) {
        parts.push(`(${step.responsible}`);
        if (step.applications) {
          parts[parts.length - 1] += `, via ${step.applications}`;
        }
        parts[parts.length - 1] += ")";
      } else if (step.applications) {
        parts.push(`(via ${step.applications})`);
      }
      if (step.outputs?.length) {
        parts.push(`→ ${step.outputs.join(", ")}`);
      }
      summaryLines.push(`- ${parts.join(" ")}`);
    }
    if (processOutputs.length) {
      summaryLines.push(
        `Slutresultat: ${processOutputs.map((o) => o.title).filter(Boolean).join("; ")}.`,
      );
    }

    return {
      overview: {
        uuid: overview.uuid,
        title: modelTitle,
        modelType: overview.modelType,
        version: overview.version,
        vertexCount: overview.vertexCount,
        edgeCount: overview.edgeCount,
      },
      inputs: processInputs.map((s) => ({
        title: s.title,
        objectType: s.objectType,
        symbolId: s.symbolId,
        vertexId: s.vertexId,
      })),
      activities: narrativeSteps,
      outputs: processOutputs.map((s) => ({
        title: s.title,
        objectType: s.objectType,
        symbolId: s.symbolId,
        vertexId: s.vertexId,
      })),
      summaryText: summaryLines.join("\n"),
      steps,
      methodologyNotes: [
        "Prefer describe_process for human-readable process narratives.",
        "Edge types FLOW / RACI_RESPONSIBLE / IS_USED_BY are grouped into inputs, outputs, responsible, applications.",
      ],
      nextSuggestedTools: ["get_breakdowns", "get_object_documents"],
    };
  }

  async getRolesAndResponsibilities(args: {
    repositoryId: string;
    modelId: string;
  }): Promise<Record<string, unknown>> {
    const flow = await this.getFlow(args);
    const steps = flow.steps;
    const performers = steps.filter((s) =>
      RESPONSIBILITY_TYPES.has(normType(s.objectType)),
    );
    const activities = steps
      .filter((s) => ACTIVITY_TYPES.has(normType(s.objectType)))
      .map((a) => ({
        title: a.title,
        vertexId: a.vertexId,
        symbolId: a.symbolId,
        objectType: a.objectType,
        responsible: a.responsible,
        applications: a.applications,
      }));

    return {
      performers: performers.map((p) => ({
        title: p.title,
        objectType: p.objectType,
        vertexId: p.vertexId,
        symbolId: p.symbolId,
      })),
      activities,
      assignments: activities.map((a) => ({
        activity: a.title,
        responsible: (a.responsible ?? []).map((r) => r.title).filter(Boolean),
        applications: (a.applications ?? [])
          .map((r) => r.title)
          .filter(Boolean),
      })),
      swimlaneSettings: flow.swimlaneSettings,
      methodologyNotes: [
        "Performers are roles, positions, organisations or stakeholders linked via RACI_RESPONSIBLE (or similar).",
        "Applications are linked via IS_USED_BY (or similar).",
      ],
    };
  }

  async getBreakdowns(args: {
    repositoryId: string;
    modelId: string;
  }): Promise<Record<string, unknown>> {
    const page = await this.client.request<Page<BreakdownView>>({
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/broken-down-from",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    });
    return {
      breakdowns: page.data ?? page,
      methodologyNotes: [
        "Breakdowns navigate from high-level processes to detailed activity models.",
      ],
    };
  }

  async getObjectDocuments(args: {
    repositoryId: string;
    symbolId?: string;
    modelId?: string;
  }): Promise<Record<string, unknown>> {
    if (args.symbolId) {
      const symbols = await this.resolveSymbols({
        repositoryId: args.repositoryId,
        symbolIds: [args.symbolId],
      });
      const symbol = symbols.symbols[0];
      return {
        symbolId: symbol?.uuid,
        title: symbol?.title,
        objectType: symbol?.objectType,
        documents: symbol?.documents ?? [],
      };
    }

    if (args.modelId) {
      const model = await this.client.request<Record<string, unknown>>({
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}",
        pathParams: {
          repositoryId: args.repositoryId,
          modelId: args.modelId,
        },
        query: { projection: "ALL" },
      });
      return {
        modelId: model.uuid,
        documents: model.documents ?? [],
        model,
      };
    }

    throw new Error("Provide symbolId and/or modelId");
  }

  async resolveSymbols(args: {
    repositoryId: string;
    symbolIds: string[];
  }): Promise<{
    symbols: Array<Record<string, unknown>>;
    missing: string[];
  }> {
    const unique = [...new Set(args.symbolIds.filter(Boolean))];
    const missing: string[] = [];
    const symbols: Array<Record<string, unknown>> = [];

    const toFetch = unique.filter((id) => {
      const cacheKey = `${args.repositoryId}:${id}`;
      return !this.symbolCache.has(cacheKey);
    });

    // Parallel fetch with modest concurrency
    const concurrency = 8;
    for (let i = 0; i < toFetch.length; i += concurrency) {
      const chunk = toFetch.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (symbolId) => {
          try {
            const symbol = await this.client.request<SymbolView>({
              path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
              pathParams: {
                repositoryId: args.repositoryId,
                symbolId,
              },
              query: { projection: "ALL" },
            });
            this.symbolCache.set(`${args.repositoryId}:${symbolId}`, symbol);
          } catch {
            missing.push(symbolId);
          }
        }),
      );
    }

    for (const id of unique) {
      const cached = this.symbolCache.get(`${args.repositoryId}:${id}`);
      if (!cached) {
        if (!missing.includes(id)) {
          missing.push(id);
        }
        continue;
      }
      const docs = (cached.documents ?? []).map((d) => ({
        id: documentIdOf(d),
        title: documentTitleOf(d),
        raw: d,
      }));
      symbols.push({
        uuid: cached.uuid ?? id,
        title: pickTitle(cached.titles),
        objectType: cached.objectType,
        titles: cached.titles,
        documents: docs,
      });
    }

    return { symbols, missing };
  }

  async searchSymbols(args: {
    repositoryId: string;
    query?: string;
    objectType?: string;
    modelId?: string;
    startAt?: string;
    maxResults?: string;
  }): Promise<Record<string, unknown>> {
    // Scope to symbols placed on a model canvas when modelId is set
    if (args.modelId) {
      const canvas = await this.client.request<CanvasDto>({
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
        pathParams: {
          repositoryId: args.repositoryId,
          modelId: args.modelId,
        },
      });
      const ids = [
        ...new Set(
          (canvas.vertices ?? [])
            .map((v) => symbolIdOf(v))
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const resolved = await this.resolveSymbols({
        repositoryId: args.repositoryId,
        symbolIds: ids,
      });
      let symbols = resolved.symbols;
      if (args.objectType) {
        const ot = args.objectType.toLowerCase();
        symbols = symbols.filter((s) =>
          String(s.objectType ?? "")
            .toLowerCase()
            .includes(ot),
        );
      }
      if (args.query) {
        const q = args.query.toLowerCase();
        symbols = symbols.filter((s) =>
          String(s.title ?? "")
            .toLowerCase()
            .includes(q),
        );
      }
      return {
        total: symbols.length,
        symbols,
        scopedToModelId: args.modelId,
        methodologyNotes: [
          "Results limited to symbols placed on the given model canvas.",
        ],
        nextSuggestedTools: ["resolve_symbols", "reuse_symbol"],
      };
    }

    const page = await this.client.request<Page<SymbolView>>({
      path: "/api/v1/repositories/{repositoryId}/symbols",
      pathParams: { repositoryId: args.repositoryId },
      query: {
        startAt: args.startAt,
        maxResults: args.maxResults ?? "100",
        projection: "ALL",
        ...(args.query
          ? { filter: toWildcardFilter(args.query), filterFields: "titles" }
          : {}),
      },
    });

    let symbols = page.data ?? [];
    if (args.objectType) {
      const ot = args.objectType.toLowerCase();
      symbols = symbols.filter((s) =>
        (s.objectType ?? "").toLowerCase().includes(ot),
      );
    }
    if (args.query) {
      symbols = symbols.filter((s) => titleMatches(s.titles, args.query!));
    }

    return {
      total: symbols.length,
      symbols: symbols.map((s) => ({
        uuid: s.uuid,
        objectType: s.objectType,
        title: pickTitle(s.titles),
        titles: s.titles,
        documents: s.documents,
      })),
      methodologyNotes: [
        "Prefer reusing an existing symbol UUID over creating a duplicate with the same title.",
        "Pass modelId to search only symbols used on a specific model.",
      ],
      nextSuggestedTools: ["reuse_symbol", "add_process_step", "find_symbol_usage"],
    };
  }

  /**
   * Find where a symbol (role/object) is used across process models.
   * enrich=basic (default): RACI titles + apps/controlledBy titles.
   * enrich=full: also inputs/outputs/applications/controlledBy as structured refs (same model only).
   */
  async findSymbolUsage(args: {
    repositoryId: string;
    symbolId?: string;
    titleQuery?: string;
    enrich?: "basic" | "full";
  }): Promise<Record<string, unknown>> {
    const enrich = args.enrich ?? "basic";
    let symbolId = args.symbolId;
    let symbolMeta: Record<string, unknown> | undefined;

    if (!symbolId && args.titleQuery) {
      const found = await this.searchSymbols({
        repositoryId: args.repositoryId,
        query: args.titleQuery,
        maxResults: "20",
      });
      const exact = (found.symbols as Array<Record<string, unknown>>).find(
        (s) =>
          String(s.title ?? "").toLowerCase() ===
          args.titleQuery!.trim().toLowerCase(),
      );
      const pick = exact ?? (found.symbols as Array<Record<string, unknown>>)[0];
      if (!pick?.uuid) {
        return {
          symbol: null,
          usages: [],
          candidates: found.symbols,
          enrich,
          methodologyNotes: [
            "No symbol matched titleQuery. Refine search_symbols first.",
          ],
        };
      }
      symbolId = String(pick.uuid);
      symbolMeta = pick;
    }

    if (!symbolId) {
      throw new Error("Provide symbolId or titleQuery");
    }

    if (!symbolMeta) {
      const resolved = await this.resolveSymbols({
        repositoryId: args.repositoryId,
        symbolIds: [symbolId],
      });
      symbolMeta = resolved.symbols[0];
    }

    const models = await this.findModels({
      repositoryId: args.repositoryId,
      maxResults: "200",
    });

    const usages: Array<Record<string, unknown>> = [];
    const modelList = models.models;
    const concurrency = 6;
    for (let i = 0; i < modelList.length; i += concurrency) {
      const chunk = modelList.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (model) => {
          const canvas = await this.client.request<CanvasDto>({
            path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
            pathParams: {
              repositoryId: args.repositoryId,
              modelId: String(model.uuid),
            },
          });
          const vertices = canvas.vertices ?? [];
          const match = vertices.find((v) => symbolIdOf(v) === symbolId);
          if (!match) {
            return;
          }

          const flow = await this.getFlow({
            repositoryId: args.repositoryId,
            modelId: String(model.uuid),
            includeDocuments: enrich === "full",
          });
          const roleStep = flow.steps.find((s) => s.symbolId === symbolId);
          const responsibleFor = flow.steps
            .filter((s) =>
              (s.responsible ?? []).some((r) => r.symbolId === symbolId),
            )
            .map((s) => {
              const base: Record<string, unknown> = {
                title: s.title,
                objectType: s.objectType,
                vertexId: s.vertexId,
                symbolId: s.symbolId,
                applications: (s.applications ?? []).map((a) => a.title),
                controlledBy: (s.controlledBy ?? []).map((c) => c.title),
              };
              if (enrich === "full") {
                base.inputs = (s.inputs ?? []).map((r) => ({
                  title: r.title,
                  objectType: r.objectType,
                  symbolId: r.symbolId,
                }));
                base.outputs = (s.outputs ?? []).map((r) => ({
                  title: r.title,
                  objectType: r.objectType,
                  symbolId: r.symbolId,
                }));
                base.applicationRefs = s.applications ?? [];
                base.controlledByRefs = s.controlledBy ?? [];
                base.documents = s.documents;
              }
              return base;
            });

          usages.push({
            modelId: model.uuid,
            modelTitle: model.title,
            modelType: model.modelType,
            placedAs: {
              title: roleStep?.title ?? titleOf(match),
              objectType: roleStep?.objectType ?? objectTypeOf(match),
              vertexId: match.uuid,
            },
            responsibleForActivities: responsibleFor,
          });
        }),
      );
    }

    return {
      symbol: symbolMeta,
      usageCount: usages.length,
      enrich,
      usages,
      methodologyNotes: [
        "Usages are process/swimlane models where the symbol is placed on the canvas.",
        "responsibleForActivities lists activities linked via RACI_RESPONSIBLE to this symbol.",
        enrich === "full"
          ? "enrich=full adds inputs/outputs/controlledBy refs from the same model only (no cross-model chain inference)."
          : "Pass enrich=full for per-activity inputs/outputs in the same model.",
      ],
      nextSuggestedTools: [
        "describe_role_introduction",
        "describe_role",
        "describe_process",
      ],
    };
  }

  async describeRole(args: {
    repositoryId: string;
    symbolId?: string;
    titleQuery?: string;
  }): Promise<Record<string, unknown>> {
    const usage = await this.findSymbolUsage(args);
    const symbol = usage.symbol as Record<string, unknown> | null;
    const usages = (usage.usages as Array<Record<string, unknown>>) ?? [];

    if (!symbol) {
      return usage;
    }

    const activities: Array<Record<string, unknown>> = [];
    const applications = new Set<string>();
    const controllingDocs = new Set<string>();
    const processLines: string[] = [];

    for (const u of usages) {
      const acts =
        (u.responsibleForActivities as Array<Record<string, unknown>>) ?? [];
      processLines.push(
        `${u.modelTitle}: ${
          acts.map((a) => a.title).filter(Boolean).join("; ") || "(placerad, ej RACI-ägare)"
        }`,
      );
      for (const a of acts) {
        activities.push({
          process: u.modelTitle,
          modelId: u.modelId,
          activity: a.title,
          applications: a.applications,
          controlledBy: a.controlledBy,
        });
        for (const app of (a.applications as string[]) ?? []) {
          if (app) {
            applications.add(app);
          }
        }
        for (const doc of (a.controlledBy as string[]) ?? []) {
          if (doc) {
            controllingDocs.add(doc);
          }
        }
      }
    }

    const roleTitle = String(symbol.title ?? args.titleQuery ?? "Roll");
    const summaryText = [
      `${roleTitle} (${symbol.objectType ?? "ROLE"}):`,
      usages.length
        ? `Förekommer i ${usages.length} processmodell(er).`
        : "Förekommer inte på någon processmodell-canvas.",
      ...processLines.map((l) => `- ${l}`),
      applications.size
        ? `IT-stöd: ${[...applications].join(", ")}.`
        : undefined,
      controllingDocs.size
        ? `Styrdokument kopplade till aktiviteter: ${[...controllingDocs].join(", ")}.`
        : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      symbol,
      processes: usages.map((u) => ({
        modelId: u.modelId,
        modelTitle: u.modelTitle,
        activities: u.responsibleForActivities,
      })),
      activities,
      applications: [...applications],
      controllingDocuments: [...controllingDocs],
      summaryText,
      methodologyNotes: [
        "Role ownership is based on RACI_RESPONSIBLE links, not just canvas placement.",
        "For onboarding: combine describe_role with get_controlling_documents on HR activities like 'Genomföra introduktion'.",
      ],
      nextSuggestedTools: [
        "get_controlling_documents",
        "describe_process",
        "search_documents",
      ],
    };
  }

  async getControllingDocuments(args: {
    repositoryId: string;
    modelId: string;
    activityTitle?: string;
    activityVertexId?: string;
    activitySymbolId?: string;
  }): Promise<Record<string, unknown>> {
    const flow = await this.getFlow({
      repositoryId: args.repositoryId,
      modelId: args.modelId,
      includeDocuments: true,
    });

    let activities = flow.steps.filter((s) =>
      ACTIVITY_TYPES.has(normType(s.objectType)),
    );
    if (args.activityVertexId) {
      activities = activities.filter((s) => s.vertexId === args.activityVertexId);
    } else if (args.activitySymbolId) {
      activities = activities.filter((s) => s.symbolId === args.activitySymbolId);
    } else if (args.activityTitle) {
      const q = args.activityTitle.toLowerCase();
      activities = activities.filter((s) =>
        String(s.title ?? "").toLowerCase().includes(q),
      );
    }

    const results = activities.map((a) => ({
      activity: {
        title: a.title,
        vertexId: a.vertexId,
        symbolId: a.symbolId,
        objectType: a.objectType,
      },
      controllingDocuments: a.controlledBy ?? [],
      responsible: a.responsible ?? [],
      applications: a.applications ?? [],
    }));

    return {
      modelTitle: flow.modelTitle,
      modelId: args.modelId,
      results,
      methodologyNotes: [
        "CONTROLS edges link steering documents (e.g. CORE_DOCUMENT checklists) to activities.",
        "Use resolve_documents / get_document_content with document ids from the document symbol or search_documents by title.",
      ],
      nextSuggestedTools: [
        "search_documents",
        "resolve_documents",
        "get_document_content",
      ],
    };
  }

  /**
   * Methodology-layered introduction path for a role:
   * - operationalCompetence: RACI ownership (role performs)
   * - formalIntroduction: HR intro process + CONTROLS docs (role is subject, often not RACI owner)
   * - supportContext: adjacent processes (e.g. time reporting as Medarbetare) — hints only
   */
  async describeRoleIntroduction(args: {
    repositoryId: string;
    symbolId?: string;
    titleQuery?: string;
    enrichOperational?: boolean;
  }): Promise<Record<string, unknown>> {
    const usage = await this.findSymbolUsage({
      repositoryId: args.repositoryId,
      symbolId: args.symbolId,
      titleQuery: args.titleQuery,
      enrich: args.enrichOperational === false ? "basic" : "full",
    });
    const symbol = usage.symbol as Record<string, unknown> | null;
    if (!symbol) {
      return {
        ...usage,
        methodologyNotes: [
          ...(Array.isArray(usage.methodologyNotes)
            ? usage.methodologyNotes
            : []),
          "describe_role_introduction requires a resolvable role symbol.",
        ],
      };
    }

    const roleTitle = String(symbol.title ?? args.titleQuery ?? "Roll");
    const operational = await this.describeRole({
      repositoryId: args.repositoryId,
      symbolId: String(symbol.uuid),
    });
    // Re-attach enriched usages from the usage call
    operational.processes = (usage.usages as Array<Record<string, unknown>>).map(
      (u) => ({
        modelId: u.modelId,
        modelTitle: u.modelTitle,
        source: "fromRaci",
        activities: u.responsibleForActivities,
      }),
    );

    const hrQueries = [
      "rekrytera",
      "anställa",
      "introduktion",
      "onboarding",
      "personal",
    ];
    const hrModelsMap = new Map<string, Record<string, unknown>>();
    for (const q of hrQueries) {
      const found = await this.findModels({
        repositoryId: args.repositoryId,
        query: q,
        maxResults: "20",
      });
      for (const m of found.models) {
        if (m.uuid) {
          hrModelsMap.set(String(m.uuid), m);
        }
      }
    }

    const formalProcesses: Array<Record<string, unknown>> = [];
    const formalDocs: Array<Record<string, unknown>> = [];
    const seenDoc = new Set<string>();

    for (const model of hrModelsMap.values()) {
      const modelId = String(model.uuid);
      const roleIsRaciOwnerHere = (
        usage.usages as Array<Record<string, unknown>>
      ).some(
        (u) =>
          u.modelId === modelId &&
          ((u.responsibleForActivities as unknown[]) ?? []).length > 0,
      );

      const ctrl = await this.getControllingDocuments({
        repositoryId: args.repositoryId,
        modelId,
      });
      const isStrongHrTitle = /rekrytera|anställ|introduktion|onboarding/i.test(
        String(model.title ?? ""),
      );
      const introNamed = (
        (ctrl.results as Array<Record<string, unknown>>) ?? []
      ).filter((r) => {
        const title = String(
          (r.activity as { title?: string } | undefined)?.title ?? "",
        ).toLowerCase();
        return title.includes("introduktion") || title.includes("onboarding");
      });
      // For rekrytera/anställ models: also keep activities that already have CONTROLS docs
      const introResults =
        introNamed.length > 0
          ? introNamed
          : isStrongHrTitle
            ? (
                (ctrl.results as Array<Record<string, unknown>>) ?? []
              ).filter(
                (r) =>
                  ((r.controllingDocuments as unknown[]) ?? []).length > 0,
              )
            : [];

      if (introResults.length === 0 && !isStrongHrTitle) {
        continue;
      }

      const flow = await this.getFlow({
        repositoryId: args.repositoryId,
        modelId,
        includeDocuments: false,
      });
      const roleOnCanvas = flow.steps.some(
        (s) => s.symbolId === String(symbol.uuid),
      );

      const introductionActivities =
        introResults.length > 0
          ? introResults
          : flow.steps
              .filter(
                (s) =>
                  ACTIVITY_TYPES.has(normType(s.objectType)) &&
                  /introduktion|onboarding/i.test(s.title ?? ""),
              )
              .map((s) => ({
                activity: {
                  title: s.title,
                  vertexId: s.vertexId,
                  symbolId: s.symbolId,
                },
                controllingDocuments: s.controlledBy ?? [],
                responsible: s.responsible ?? [],
              }));

      if (introductionActivities.length === 0 && !isStrongHrTitle) {
        continue;
      }

      formalProcesses.push({
        modelId,
        modelTitle: model.title,
        source: "fromHrProcess",
        roleIsRaciOwnerHere,
        rolePlacedOnCanvas: roleOnCanvas,
        methodologyNote: roleOnCanvas
          ? "Role appears on this HR canvas; check RACI before treating as operational ownership."
          : "Role is typically the subject of introduction here, not the RACI performer of intro activities.",
        introductionActivities,
      });

      for (const r of introductionActivities as Array<Record<string, unknown>>) {
        for (const d of (r.controllingDocuments as FlowStepRef[]) ?? []) {
          const key = d.symbolId ?? d.title ?? "";
          if (key && !seenDoc.has(key)) {
            seenDoc.add(key);
            formalDocs.push({
              ...d,
              source: "fromHrProcess",
              viaActivity: (r.activity as { title?: string })?.title,
              viaModel: model.title,
            });
          }
        }
      }
    }

    // Support: time reporting / employee generic — title hints only, not claimed as role RACI
    const supportHints: Array<Record<string, unknown>> = [];
    const seenSupport = new Set<string>();
    for (const q of ["tid", "rapportera"]) {
      const found = await this.findModels({
        repositoryId: args.repositoryId,
        query: q,
        maxResults: "10",
      });
      for (const m of found.models) {
        const mid = String(m.uuid ?? "");
        if (!mid || seenSupport.has(mid)) {
          continue;
        }
        if (
          !(usage.usages as Array<Record<string, unknown>>).some(
            (u) => u.modelId === mid,
          ) &&
          !hrModelsMap.has(mid)
        ) {
          seenSupport.add(mid);
          supportHints.push({
            modelId: mid,
            modelTitle: m.title,
            source: "inferredSupport",
            note: "Possible support process for a new employee (e.g. Medarbetare). Verify with find_symbol_usage / get_roles_and_responsibilities — not attributed to the target role via RACI.",
          });
        }
      }
    }

    const summaryText = [
      `Introduktionsväg för ${roleTitle} (2c8-lager):`,
      "",
      "1) Operativ kompetens (RACI — rollen utför):",
      ...(operational.summaryText as string).split("\n").map((l) => `   ${l}`),
      "",
      "2) Formell introduktion (HR — rollen är ofta subjekt, inte utförare):",
      formalProcesses.length
        ? formalProcesses
            .map((p) => {
              const acts = (
                (p.introductionActivities as Array<Record<string, unknown>>) ??
                []
              )
                .map(
                  (r) =>
                    (r.activity as { title?: string } | undefined)?.title ??
                    (r as { title?: string }).title,
                )
                .filter(Boolean)
                .join("; ");
              return `   - ${p.modelTitle}: ${acts || "(se processflöde)"}${
                p.rolePlacedOnCanvas ? "" : " [rollen ej på canvas]"
              }`;
            })
            .join("\n")
        : "   - Ingen tydlig HR-/introduktionsmodell hittades via titel (rekrytera/introduktion/…).",
      formalDocs.length
        ? `   Styrdokument: ${formalDocs.map((d) => d.title).join(", ")}.`
        : undefined,
      "",
      "3) Stödkontext (ej RACI för målrollen om inte bevisat):",
      supportHints.length
        ? supportHints.map((h) => `   - ${h.modelTitle}`).join("\n")
        : "   - Inga extra titelträffar.",
    ]
      .filter((l) => l !== undefined)
      .join("\n");

    return {
      symbol,
      layers: {
        operationalCompetence: {
          source: "fromRaci",
          ...operational,
          enrichedUsages: usage.usages,
        },
        formalIntroduction: {
          source: "fromHrProcess",
          processes: formalProcesses,
          controllingDocuments: formalDocs,
          methodologyNote:
            "CONTROLS documents govern introduction activities. The role being introduced is usually not the RACI owner of those HR activities.",
        },
        supportContext: {
          source: "inferredSupport",
          hints: supportHints,
          methodologyNote:
            "Support hints are title-based suggestions only. Do not treat as role ownership without RACI proof.",
        },
      },
      summaryText,
      methodologyNotes: [
        "2c8 separates operational RACI competence from formal HR introduction — this tool keeps those layers explicit.",
        "Do not invent a direct role→checklist CONTROLS link unless it exists on the canvas.",
        "Use get_document_content on formalIntroduction.controllingDocuments after resolving document ids via search_documents if needed.",
      ],
      nextSuggestedTools: [
        "get_document_content",
        "search_documents",
        "describe_process",
        "find_symbol_usage",
      ],
    };
  }
}
