import type { TwoC8Client } from "../api/twoc8-client.js";
import type { WriteMode } from "../config.js";
import type { MethodologyPack } from "../methodology/loader.js";
import {
  loadRepoConfiguration,
  validateProposedSymbol,
} from "../methodology/rules-engine.js";
import type { ModelProposal } from "./proposals.js";
import { ProcessReader } from "./process-reader.js";

const DEFAULT_WIDTH = 140;
const DEFAULT_HEIGHT = 90;
const X_GAP = 200;
const Y_BASE = 120;

export class ProcessWriter {
  private readonly reader: ProcessReader;

  constructor(
    private readonly client: TwoC8Client,
    private readonly pack: MethodologyPack,
    private readonly writeMode: WriteMode,
  ) {
    this.reader = new ProcessReader(client);
  }

  async createProcessModel(args: {
    repositoryId: string;
    title: string;
    languageId: string;
    modelType?: string;
    permissionGroup?: string;
    owner?: string;
    group?: string;
    body?: Record<string, unknown>;
  }) {
    const modelType = args.modelType ?? "process";
    const body = {
      modelType,
      titles: {
        [args.languageId]: { title: args.title },
      },
      ...(args.owner ? { owner: args.owner } : {}),
      ...(args.group ? { group: args.group } : {}),
      ...args.body,
    };

    const headers = args.permissionGroup
      ? { "2c8-Permission-Group": args.permissionGroup }
      : undefined;

    if (this.writeMode === "draft") {
      const created = await this.client.request({
        method: "POST",
        path: "/api/v1/repositories/draft/models",
        headers,
        body,
      });
      return {
        data: created,
        writeMode: "draft",
        methodologyNotes: [
          "Created as draft model. Use accept_draft_model when ready.",
        ],
        nextSuggestedTools: ["add_process_step", "accept_draft_model"],
      };
    }

    const created = await this.client.request({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/models",
      pathParams: { repositoryId: args.repositoryId },
      headers,
      body,
    });
    return {
      data: created,
      writeMode: "direct",
      nextSuggestedTools: ["add_process_step", "set_step_io"],
    };
  }

  async addProcessStep(args: {
    repositoryId: string;
    modelId: string;
    title: string;
    languageId: string;
    objectType?: string;
    symbolId?: string;
    connectFromVertexId?: string;
    edgeType?: string;
    x?: number;
    y?: number;
    owner?: string;
    group?: string;
    forceCreate?: boolean;
  }) {
    const objectType = args.objectType ?? "activity";
    const repoConfig = await loadRepoConfiguration(
      this.client,
      args.repositoryId,
    );
    const validation = validateProposedSymbol(this.pack, {
      objectType,
      title: args.title,
      repoConfig,
    });

    let reuseCandidates: unknown[] = [];
    let symbolId = args.symbolId;

    if (!symbolId && !args.forceCreate) {
      const search = await this.reader.searchSymbols({
        repositoryId: args.repositoryId,
        query: args.title,
        objectType,
        maxResults: "20",
      });
      reuseCandidates = (search.symbols as unknown[]) ?? [];
      const exact = (
        search.symbols as Array<{ uuid?: string; title?: string }>
      ).find(
        (s) =>
          (s.title ?? "").trim().toLowerCase() === args.title.trim().toLowerCase(),
      );
      if (exact?.uuid) {
        symbolId = exact.uuid;
      }
    }

    if (!symbolId) {
      const symbol = (await this.client.request({
        method: "POST",
        path: "/api/v1/repositories/{repositoryId}/symbols",
        pathParams: { repositoryId: args.repositoryId },
        body: {
          objectType,
          titles: { [args.languageId]: { title: args.title } },
          ...(args.owner ? { owner: args.owner } : {}),
          ...(args.group ? { group: args.group } : {}),
        },
      })) as { uuid?: string };
      symbolId = symbol.uuid;
    }

    if (!symbolId) {
      throw new Error("Failed to resolve symbolId for process step");
    }

    const canvas = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    })) as { vertices?: Array<{ x?: number; y?: number }> };

    const count = canvas.vertices?.length ?? 0;
    const x = args.x ?? 80 + count * X_GAP;
    const y = args.y ?? Y_BASE;

    const vertex = await this.client.request({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas/vertices",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
      body: {
        x,
        y,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        symbol: symbolId,
      },
    });

    let edge: unknown = null;
    const vertexId = (vertex as { uuid?: string }).uuid;
    if (args.connectFromVertexId && vertexId) {
      edge = await this.client.request({
        method: "POST",
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas/edges",
        pathParams: {
          repositoryId: args.repositoryId,
          modelId: args.modelId,
        },
        body: {
          fromVertex: args.connectFromVertexId,
          toVertex: vertexId,
          edgeType: args.edgeType ?? "flow",
        },
      });
    }

    return {
      data: { symbolId, vertex, edge },
      methodologyNotes: validation.methodologyNotes,
      namingCheck: validation.namingCheck,
      reuseCandidates,
      configViolations: validation.configViolations,
      nextSuggestedTools:
        objectType === "activity"
          ? ["set_activity_performer", "set_step_io", "link_document"]
          : ["set_step_io", "link_document"],
    };
  }

  async reuseSymbol(args: {
    repositoryId: string;
    modelId: string;
    symbolId: string;
    x?: number;
    y?: number;
  }) {
    const canvas = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    })) as { vertices?: unknown[] };

    const count = canvas.vertices?.length ?? 0;
    const vertex = await this.client.request({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas/vertices",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
      body: {
        x: args.x ?? 80 + count * X_GAP,
        y: args.y ?? Y_BASE,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        symbol: args.symbolId,
      },
    });

    return {
      data: vertex,
      methodologyNotes: [
        "Reused existing symbol UUID — changes to the symbol propagate across models.",
      ],
      nextSuggestedTools: ["set_activity_performer", "create_edge via add_process_step connectFromVertexId"],
    };
  }

  async createBreakdown(args: {
    repositoryId: string;
    modelId: string;
    body: Record<string, unknown>;
  }) {
    const created = await this.client.request({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/broken-down-from",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
      body: args.body,
    });
    return {
      data: created,
      methodologyNotes: [
        "Breakdown links this model as a detailing of a symbol or edge in another model.",
      ],
      nextSuggestedTools: ["get_breakdowns", "get_process_flow"],
    };
  }

  async applyProposal(args: {
    repositoryId: string;
    languageId: string;
    proposal: ModelProposal;
    permissionGroup?: string;
    owner?: string;
    group?: string;
    modelId?: string;
  }) {
    let modelId = args.modelId;
    const results: unknown[] = [];

    if (!modelId) {
      const created = await this.createProcessModel({
        repositoryId: args.repositoryId,
        title: args.proposal.title,
        languageId: args.languageId,
        modelType: args.proposal.modelType,
        permissionGroup: args.permissionGroup,
        owner: args.owner,
        group: args.group,
      });
      results.push({ createModel: created });
      modelId =
        (created.data as { uuid?: string })?.uuid ??
        (created.data as { model?: { uuid?: string } })?.model?.uuid;
    }

    if (!modelId) {
      throw new Error(
        "Could not resolve modelId from create_process_model response; pass modelId explicitly.",
      );
    }

    let previousVertexId: string | undefined;
    for (const step of args.proposal.steps) {
      const added = await this.addProcessStep({
        repositoryId: args.repositoryId,
        modelId,
        title: step.title,
        languageId: args.languageId,
        objectType: step.objectType,
        connectFromVertexId: previousVertexId,
        owner: args.owner,
        group: args.group,
      });
      results.push(added);
      previousVertexId =
        (added.data as { vertex?: { uuid?: string } })?.vertex?.uuid ??
        previousVertexId;
    }

    return {
      data: { modelId, steps: results },
      methodologyNotes: args.proposal.methodologyNotes,
      namingChecks: args.proposal.namingChecks,
      nextSuggestedTools: [
        "set_activity_performer",
        "link_document",
        "get_process_flow",
      ],
    };
  }

  async setActivityPerformer(args: {
    repositoryId: string;
    modelId: string;
    activityVertexId: string;
    performerSymbolId: string;
    edgeType?: string;
    x?: number;
    y?: number;
  }) {
    // Place performer near activity if not already on canvas, then connect
    const canvas = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    })) as {
      vertices?: Array<{ uuid?: string; symbol?: string | { uuid?: string }; x?: number; y?: number }>;
    };

    let performerVertex = (canvas.vertices ?? []).find((v) => {
      const sid =
        typeof v.symbol === "string" ? v.symbol : v.symbol?.uuid;
      return sid === args.performerSymbolId;
    });

    if (!performerVertex) {
      const activity = (canvas.vertices ?? []).find(
        (v) => v.uuid === args.activityVertexId,
      );
      performerVertex = (await this.client.request({
        method: "POST",
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas/vertices",
        pathParams: {
          repositoryId: args.repositoryId,
          modelId: args.modelId,
        },
        body: {
          x: args.x ?? (activity?.x ?? 80),
          y: args.y ?? (activity?.y ?? Y_BASE) + 160,
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
          symbol: args.performerSymbolId,
        },
      })) as { uuid?: string };
    }

    const edge = await this.client.request({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas/edges",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
      body: {
        fromVertex: performerVertex.uuid,
        toVertex: args.activityVertexId,
        edgeType: args.edgeType ?? "responsible",
      },
    });

    return {
      data: { performerVertex, edge },
      methodologyNotes: [
        "Linked performer (role/position/organisation) to activity.",
      ],
      nextSuggestedTools: ["get_roles_and_responsibilities"],
    };
  }

  async setStepIo(args: {
    repositoryId: string;
    modelId: string;
    fromVertexId: string;
    toVertexId: string;
    edgeType?: string;
  }) {
    const edge = await this.client.request({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas/edges",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
      body: {
        fromVertex: args.fromVertexId,
        toVertex: args.toVertexId,
        edgeType: args.edgeType ?? "flow",
      },
    });
    return {
      data: edge,
      methodologyNotes: [
        "Connected steps to express input/output flow between activities/business objects.",
      ],
    };
  }

  async placeInSwimlane(args: {
    repositoryId: string;
    modelId: string;
    symbolId: string;
    x: number;
    y: number;
  }) {
    // Swimlane assignment is primarily positional relative to lane geometry
    const vertex = await this.client.request({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas/vertices",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
      body: {
        x: args.x,
        y: args.y,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        symbol: args.symbolId,
      },
    });
    return {
      data: vertex,
      methodologyNotes: [
        "Placed symbol at swimlane coordinates; lane owner becomes performer for objects in the lane.",
      ],
      nextSuggestedTools: ["get_roles_and_responsibilities", "get_process_flow"],
    };
  }
}
