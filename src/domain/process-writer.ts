import type { TwoC8Client } from "../api/twoc8-client.js";
import type { WriteMode } from "../config.js";
import type { MethodologyPack } from "../methodology/loader.js";
import {
  extractQuickdrawDistance,
  labelPlacementForObjectType,
  loadRepoConfiguration,
  type OutsideLabelSide,
  outsideLabelAwayFromEdge,
  type QuickdrawDistance,
  resolveSymbolSize,
  type SymbolSizeSpec,
  validateProposedSymbol,
} from "../methodology/rules-engine.js";
import { withControlPointBoundsHint } from "../util/canvas-layout-hints.js";
import { applySoftBreaks, stripSoftBreaks } from "../util/soft-breaks.js";
import { pickTitle } from "../util/titles.js";
import { ProcessReader } from "./process-reader.js";
import { type ModelProposal, normalizeProposal } from "./proposals.js";
import { layoutBottomSatellites } from "./satellite-layout.js";

const DEFAULT_WIDTH = 75;
const DEFAULT_HEIGHT = 50;
const LABEL_OUTSIDE_GAP = 3;
const LABEL_LINE_HEIGHT = 14;
const LABEL_CHAR_WIDTH = 5.5;
/** Compact outside labels (matches typical 2c8 double-click wrap width). */
const LABEL_OUTSIDE_MAX_WIDTH = 60;
const Y_BASE = 120;
const Y_BO = 135;
const Y_ACTIVITY = 119;
/** Gateway/decision diamond — centered on activity midline (30×30). */
const Y_GATEWAY = 129;
/**
 * Vertical gap from main-path activity.y to side-branch activity.y.
 * Leaves room under the upper activity for RACI role + apps before the Nej path.
 */
const BRANCH_BELOW_ACTIVITY_GAP = 200;
/** Shared vertical midline for FLOW spine (BO + process/activity). */
const SPINE_MID_Y = 178;
/**
 * Vertical gap from spine midline to management/support band midlines (threeBand).
 * With default SPINE_MID_Y=178 and process height 50 this would yield y≈−7 —
 * 2c8 rejects Vertex y < 0, so threeBand raises the spine (see below).
 */
const THREE_BAND_GAP = 160;
/** 2c8 canvas requires Vertex y >= 0; keep a small top margin for labels. */
const MIN_VERTEX_Y = 8;
/** Never place spine/side-loop content left of this (avoids x≈14 spaghetti). */
const MAP_LEFT_MARGIN = 80;
/** Start X for FLOW spine on new maps / detail models. */
const SPINE_START_X = 80;
/** Horizontal gap between parallel track columns under a shared BO. */
const PARALLEL_TRACK_GAP = 48;
/**
 * Inset on process LEFT (incoming) only — matches Lättkrängt (~15–20% of width).
 * Outgoing RIGHT uses the AABB edge (no inset).
 */
const PROCESS_EDGE_INSET = 0.2;
/** Extra stub when routing around a process (side loops / reverse direction). */
const PROCESS_ROUTE_STUB = 24;

/**
 * Map methodology / proposal types to API create payloads.
 * Models use UPPER_SNAKE (PROCESS_MODEL); most symbols accept lower/upper,
 * but businessobject must be BUSINESS_OBJECT.
 */
/**
 * Map methodology/agent object types to 2c8 create API types.
 * Vägval (Regel Eller/Och) are both API objectType "decision";
 * exclusive vs parallel is selected via alternativeSymbol OR|AND.
 */
function toApiObjectType(objectType: string): string {
  const key = objectType.trim().toLowerCase().replace(/[_\s]/g, "");
  const map: Record<string, string> = {
    businessobject: "BUSINESS_OBJECT",
    activity: "activity",
    role: "role",
    process: "process",
    application: "application",
    coredocument: "core_document",
    document: "core_document",
    position: "position",
    organization: "organization",
    organisation: "organization",
    // Exclusive vägval → DECISION (alternativeSymbol OR, API default)
    gateway: "decision",
    decision: "decision",
    vägval: "decision",
    vagval: "decision",
    regel: "decision",
    eller: "decision",
    or: "decision",
    xor: "decision",
    beslut: "decision",
    // Parallel Regel (Och) → same DECISION type, alternativeSymbol AND
    and: "decision",
    och: "decision",
    parallel: "decision",
  };
  // Join / Förbinda is forbidden in this MCP
  if (key === "join" || key.includes("forbind") || key.includes("förbind")) {
    throw new Error(
      'objectType join/förbinda is forbidden. For vägval use objectType "or"/"decision" (Regel Eller). Call resolve_branching_object_type.',
    );
  }
  if (map[key]) return map[key];
  if (objectType.includes("_")) return objectType.toLowerCase();
  return objectType.toLowerCase();
}

/** Parallel Regel (Och) needs alternativeSymbol AND on DECISION create. */
function alternativeSymbolFor(objectType: string): "AND" | undefined {
  const key = objectType.trim().toLowerCase().replace(/[_\s]/g, "");
  if (key === "and" || key === "och" || key === "parallel" || key === "parallell") {
    return "AND";
  }
  return undefined;
}

/** Map methodology modelType hints to API model type ids (UPPER_SNAKE). */
function toApiModelType(modelType: string | undefined): string {
  const key = (modelType ?? "process")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]/g, "");
  const map: Record<string, string> = {
    process: "PROCESS_MODEL",
    processmodel: "PROCESS_MODEL",
    swimlane: "SWIMLANE_MODEL",
    swimlanemodel: "SWIMLANE_MODEL",
    general: "GENERAL_MODEL",
    generalmodel: "GENERAL_MODEL",
  };
  return map[key] ?? (modelType?.includes("_") ? modelType.toUpperCase() : "PROCESS_MODEL");
}

export class ProcessWriter {
  private readonly reader: ProcessReader;
  private readonly configCache = new Map<string, unknown | null>();
  /** repositoryId → default language UUID (null = unresolved). */
  private readonly defaultLanguageCache = new Map<string, string | null>();

  constructor(
    private readonly client: TwoC8Client,
    private readonly pack: MethodologyPack,
    private readonly writeMode: WriteMode,
  ) {
    this.reader = new ProcessReader(client);
  }

  private async getRepoConfig(repositoryId: string): Promise<unknown | null> {
    if (this.configCache.has(repositoryId)) {
      return this.configCache.get(repositoryId) ?? null;
    }
    const config = await loadRepoConfiguration(this.client, repositoryId);
    this.configCache.set(repositoryId, config);
    return config;
  }

  /**
   * Repo default language UUID. 2c8 requires label bounds (and prefers titles)
   * for the default language even when writing another languageId.
   */
  private async defaultLanguageId(repositoryId: string): Promise<string | undefined> {
    if (this.defaultLanguageCache.has(repositoryId)) {
      return this.defaultLanguageCache.get(repositoryId) ?? undefined;
    }
    const page = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/languages",
      pathParams: { repositoryId },
    })) as {
      data?: Array<{ uuid?: string; defaultLanguage?: boolean }>;
    };
    const data = page.data ?? [];
    const id = data.find((l) => l.defaultLanguage)?.uuid ?? data[0]?.uuid ?? null;
    this.defaultLanguageCache.set(repositoryId, id);
    return id ?? undefined;
  }

  /** All language UUIDs in the repository (for edge-label mirrors). */
  private async languageIds(repositoryId: string): Promise<string[]> {
    const page = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/languages",
      pathParams: { repositoryId },
    })) as {
      data?: Array<{ uuid?: string }>;
    };
    return (page.data ?? []).map((l) => l.uuid).filter((id): id is string => Boolean(id));
  }

  /**
   * Both title and rawTitle must be set for GUI language switching.
   * GUI renders rawTitle; API/MCP often surface title — mismatch = SV on canvas, EN in API.
   *
   * Translation status (non-default language):
   * - `translated: true`  = confirmed translation → GUI globe / "needs translation" OFF
   * - `translated: false` = not translated / pending → GUI globe ON
   * Default language omits the field. Do not send `translated` on create (400).
   * After an explicit translation write, use titleEntryConfirmed (sets true).
   */
  private titleEntry(title: string): { title: string; rawTitle: string } {
    const plain = stripSoftBreaks(title).trim();
    return { title: plain, rawTitle: applySoftBreaks(title) };
  }

  /** Explicit symbol translation/edit: title + rawTitle + mark as translated. */
  private titleEntryConfirmed(title: string): {
    title: string;
    rawTitle: string;
    translated: true;
  } {
    return { ...this.titleEntry(title), translated: true };
  }

  /**
   * Model titles: API rejects rawTitle on MtbModelDto — title (+ optional translated) only.
   */
  private modelTitleEntryConfirmed(title: string): {
    title: string;
    translated: true;
  } {
    return {
      title: stripSoftBreaks(title).trim(),
      translated: true,
    };
  }

  /**
   * Titles for symbol create (includes rawTitle). Always mirrors to default language.
   * Do not use for models — they reject rawTitle.
   */
  private async titlesForLanguages(
    repositoryId: string,
    languageId: string,
    title: string,
    rawTitle?: string,
  ): Promise<Record<string, { title: string; rawTitle: string }>> {
    const entry =
      rawTitle !== undefined
        ? {
            title: stripSoftBreaks(title).trim(),
            rawTitle: applySoftBreaks(rawTitle),
          }
        : this.titleEntry(title);
    const titles: Record<string, { title: string; rawTitle: string }> = {
      [languageId]: entry,
    };
    const def = await this.defaultLanguageId(repositoryId);
    if (def && def !== languageId) {
      titles[def] = { ...entry };
    }
    return titles;
  }

  /** Model create/update titles: title only, mirrored to default language. */
  private async modelTitlesForLanguages(
    repositoryId: string,
    languageId: string,
    title: string,
  ): Promise<Record<string, { title: string }>> {
    const entry = { title: stripSoftBreaks(title).trim() };
    const titles: Record<string, { title: string }> = {
      [languageId]: entry,
    };
    const def = await this.defaultLanguageId(repositoryId);
    if (def && def !== languageId) {
      titles[def] = { ...entry };
    }
    return titles;
  }

  /** Label bounds always include default language when languageId differs. */
  private async labelsForLanguages<T>(
    repositoryId: string,
    languageId: string,
    label: T,
  ): Promise<Record<string, T>> {
    const labels: Record<string, T> = { [languageId]: label };
    const def = await this.defaultLanguageId(repositoryId);
    if (def && def !== languageId) {
      labels[def] = label;
    }
    return labels;
  }

  private sizeFor(repositoryConfig: unknown | null, objectType: string): SymbolSizeSpec {
    return resolveSymbolSize(objectType, repositoryConfig);
  }

  private layoutGaps(repositoryConfig: unknown | null): {
    distance: QuickdrawDistance;
  } {
    const distance = extractQuickdrawDistance(repositoryConfig) ?? {
      top: 30,
      left: 40,
      bottom: 30,
      right: 40,
    };
    return { distance };
  }

  /**
   * Size label box so long titles wrap to ~2+ lines (like UI double-click).
   * Soft breaks ("¬" / U+00AD) are preferred wrap points, same as in 2c8.
   */
  private measureOutsideLabel(title: string): { width: number; height: number } {
    const raw = applySoftBreaks(title);
    // Soft hyphen and whitespace are break opportunities; ¬ already normalized
    const words = raw
      .split(/[\s\u00AD]+/)
      .map((w) => stripSoftBreaks(w))
      .filter(Boolean);
    if (words.length === 0) {
      return { width: 40, height: LABEL_LINE_HEIGHT };
    }
    const maxWidth = LABEL_OUTSIDE_MAX_WIDTH;
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length * LABEL_CHAR_WIDTH <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
        }
        current = word;
      }
    }
    if (current) {
      lines.push(current);
    }
    const longest = Math.max(...lines.map((l) => l.length), 4);
    const width = Math.max(40, Math.min(maxWidth, Math.ceil(longest * LABEL_CHAR_WIDTH)));
    const height = Math.max(LABEL_LINE_HEIGHT, lines.length * LABEL_LINE_HEIGHT);
    return { width, height };
  }

  private labelBounds(args: {
    objectType: string;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Override outside side (e.g. away from vertical edge). */
    outsideLabelSide?: OutsideLabelSide;
  }): {
    centerLabel: boolean;
    label: { x: number; y: number; width: number; height: number };
  } {
    const size = { width: args.width, height: args.height };
    const base = labelPlacementForObjectType(args.objectType, size);
    if (base === "inside") {
      const pad = 2;
      return {
        centerLabel: false,
        label: {
          x: args.x + pad,
          y: args.y + pad,
          width: Math.max(20, args.width - pad * 2),
          height: Math.max(16, args.height - pad * 2),
        },
      };
    }

    const side: OutsideLabelSide = args.outsideLabelSide ?? base;
    const { width: labelWidth, height: labelHeight } = this.measureOutsideLabel(args.title);
    const gap = LABEL_OUTSIDE_GAP;

    if (side === "above") {
      return {
        centerLabel: false,
        label: {
          x: args.x + Math.floor((args.width - labelWidth) / 2),
          y: args.y - gap - labelHeight,
          width: labelWidth,
          height: labelHeight,
        },
      };
    }
    if (side === "left") {
      return {
        centerLabel: false,
        label: {
          x: args.x - gap - labelWidth,
          y: args.y + Math.floor((args.height - labelHeight) / 2),
          width: labelWidth,
          height: labelHeight,
        },
      };
    }
    if (side === "right") {
      return {
        centerLabel: false,
        label: {
          x: args.x + args.width + gap,
          y: args.y + Math.floor((args.height - labelHeight) / 2),
          width: labelWidth,
          height: labelHeight,
        },
      };
    }
    // below (default for small icons)
    return {
      centerLabel: false,
      label: {
        x: args.x + Math.floor((args.width - labelWidth) / 2),
        y: args.y + args.height + gap,
        width: labelWidth,
        height: labelHeight,
      },
    };
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
    const modelType = toApiModelType(args.modelType);
    const titles = await this.modelTitlesForLanguages(
      args.repositoryId,
      args.languageId,
      args.title,
    );
    const body = {
      modelType,
      titles,
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
        methodologyNotes: ["Created as draft model. Use accept_draft_model when ready."],
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

  /**
   * Permanently delete a model. Gated by TWO_C8_ALLOW_DELETES (tool registration).
   * Also used internally to roll back empty shells after failed canvas populate.
   */
  async deleteModel(args: { repositoryId: string; modelId: string }) {
    await this.client.request({
      method: "DELETE",
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    });
    return {
      data: {
        deleted: true,
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
      methodologyNotes: [
        "Model deleted via DELETE /repositories/{repositoryId}/models/{modelId}. This is irreversible.",
      ],
      nextSuggestedTools: ["find_models", "list_repositories"],
    };
  }

  /**
   * Permanently delete symbol(s). Gated by TWO_C8_ALLOW_DELETES (tool registration).
   * Differs from delete_canvas_vertex (canvas only — symbol remains).
   */
  async deleteSymbols(args: { repositoryId: string; symbolIds: string[] }) {
    const ids = [...new Set(args.symbolIds.filter(Boolean))];
    if (ids.length === 0) {
      throw new Error("symbolIds must contain at least one UUID");
    }
    const deleted: string[] = [];
    const errors: Array<{ symbolId: string; error: string }> = [];
    for (const symbolId of ids) {
      try {
        await this.client.request({
          method: "DELETE",
          path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
          pathParams: {
            repositoryId: args.repositoryId,
            symbolId,
          },
        });
        deleted.push(symbolId);
      } catch (error) {
        errors.push({
          symbolId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return {
      data: {
        deleted,
        errors,
        okCount: deleted.length,
        total: ids.length,
      },
      methodologyNotes: [
        "Symbol(s) deleted via DELETE …/symbols/{symbolId} (irreversible).",
        "Not the same as delete_canvas_vertex — that only removes a canvas placement.",
        "Requires TWO_C8_ALLOW_DELETES=true.",
      ],
      nextSuggestedTools: ["search_symbols", "list_orphan_symbols", "find_models"],
    };
  }

  /**
   * Update model and/or symbol titles for one or more languages (PATCH titles map).
   * Prefer `items` to batch many symbols in one tool call.
   */
  async updateTitles(args: {
    repositoryId: string;
    languageId?: string;
    title?: string;
    modelId?: string;
    symbolId?: string;
    /** Canvas edge UUID — requires modelId; updates FLOW label text + translated:true. */
    edgeId?: string;
    /** Optional extra language slots in the same call. */
    titles?: Record<string, string>;
    /**
     * Batch: update many models/symbols/edges in one call.
     * Each item may override languageId/titles; falls back to top-level.
     */
    items?: Array<{
      modelId?: string;
      symbolId?: string;
      edgeId?: string;
      title: string;
      languageId?: string;
      titles?: Record<string, string>;
    }>;
  }) {
    const batch =
      args.items && args.items.length > 0
        ? args.items
        : [
            {
              modelId: args.modelId,
              symbolId: args.symbolId,
              edgeId: args.edgeId,
              title: args.title ?? "",
              languageId: args.languageId,
              titles: args.titles,
            },
          ];

    const updated: Array<{
      modelId?: string;
      symbolId?: string;
      edgeId?: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const item of batch) {
      if (!item.modelId && !item.symbolId && !item.edgeId) {
        updated.push({
          ok: false,
          error: "item requires modelId, symbolId, and/or edgeId",
        });
        continue;
      }
      if (item.edgeId && !item.modelId) {
        updated.push({
          edgeId: item.edgeId,
          ok: false,
          error: "edgeId requires modelId (canvas edge lives on a model)",
        });
        continue;
      }
      const languageId = item.languageId ?? args.languageId;
      if (!languageId) {
        updated.push({
          modelId: item.modelId,
          symbolId: item.symbolId,
          edgeId: item.edgeId,
          ok: false,
          error: "languageId required (top-level or per item)",
        });
        continue;
      }
      if (!item.title?.trim()) {
        updated.push({
          modelId: item.modelId,
          symbolId: item.symbolId,
          edgeId: item.edgeId,
          ok: false,
          error: "title required",
        });
        continue;
      }
      try {
        if (item.edgeId && item.modelId) {
          await this.patchCanvasEdgeLabel({
            repositoryId: args.repositoryId,
            modelId: item.modelId,
            edgeId: item.edgeId,
            languageId,
            title: item.title,
            titles: item.titles,
          });
        } else if (item.modelId) {
          // Models reject rawTitle — title + translated:true only.
          const modelTitles: Record<string, { title: string; translated: true }> = {
            [languageId]: this.modelTitleEntryConfirmed(item.title),
          };
          for (const [lang, t] of Object.entries(item.titles ?? {})) {
            if (t?.trim()) modelTitles[lang] = this.modelTitleEntryConfirmed(t);
          }
          await this.client.request({
            method: "PATCH",
            path: "/api/v1/repositories/{repositoryId}/models/{modelId}",
            pathParams: {
              repositoryId: args.repositoryId,
              modelId: item.modelId,
            },
            body: { titles: modelTitles },
          });
        }
        if (item.symbolId) {
          // Symbols need title + rawTitle; translated:true clears GUI globe.
          const symbolTitles: Record<
            string,
            { title: string; rawTitle: string; translated: true }
          > = {
            [languageId]: this.titleEntryConfirmed(item.title),
          };
          for (const [lang, t] of Object.entries(item.titles ?? {})) {
            if (t?.trim()) symbolTitles[lang] = this.titleEntryConfirmed(t);
          }
          await this.client.request({
            method: "PATCH",
            path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
            pathParams: {
              repositoryId: args.repositoryId,
              symbolId: item.symbolId,
            },
            body: { titles: symbolTitles },
          });
        }
        updated.push({
          modelId: item.modelId,
          symbolId: item.symbolId,
          edgeId: item.edgeId,
          ok: true,
        });
      } catch (err) {
        updated.push({
          modelId: item.modelId,
          symbolId: item.symbolId,
          edgeId: item.edgeId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const okCount = updated.filter((u) => u.ok).length;
    return {
      data: { updated, okCount, total: updated.length },
      methodologyNotes: [
        "Writes title + rawTitle and sets translated:true (marks language as translated — clears GUI globe).",
        "Batch via items[{ modelId|symbolId|edgeId+modelId, title, languageId? }] — one call for all translations.",
        "Canvas edge labels (Ja/Nej): items[{ modelId, edgeId, title }] — edgeId from describe_process outgoing[].edgeId.",
        "Pass Swedish languageId to add Swedish without changing English.",
        "Symbol title is shared across models; model title is per-model.",
        "To only flip the flag on existing titles without rewriting text: confirm_translations (includes edges).",
      ],
      nextSuggestedTools: ["confirm_translations", "list_untranslated_symbols", "search_symbols"],
    };
  }

  /** PATCH one canvas edge label (title/rawTitle + translated:true) via /canvas. */
  private async patchCanvasEdgeLabel(args: {
    repositoryId: string;
    modelId: string;
    edgeId: string;
    languageId: string;
    title: string;
    titles?: Record<string, string>;
  }) {
    const canvas = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    })) as {
      edges?: Array<{
        uuid?: string;
        points?: Array<{ x?: number; y?: number }>;
        breakdowns?: unknown[];
        labels?: Record<string, Record<string, unknown>>;
      }>;
    };
    const edge = (canvas.edges ?? []).find((e) => e.uuid === args.edgeId);
    if (!edge?.uuid) {
      throw new Error(`edgeId ${args.edgeId} not found on model canvas`);
    }
    const defLang = await this.defaultLanguageId(args.repositoryId);
    const existing = edge.labels ?? {};
    const sample = Object.values(existing)[0] as
      | { x?: number; y?: number; width?: number; height?: number }
      | undefined;
    const nextLabels: Record<string, Record<string, unknown>> = { ...existing };

    const writeLang = (langId: string, text: string) => {
      const plain = text.trim();
      const prev = (nextLabels[langId] ?? sample ?? {}) as Record<string, unknown>;
      const width = Math.max(40, Math.min(120, Math.ceil(plain.length * 6) + 12));
      nextLabels[langId] = {
        ...prev,
        title: plain,
        rawTitle: plain,
        width: typeof prev.width === "number" ? prev.width : width,
        height: typeof prev.height === "number" ? prev.height : 20,
        x: typeof prev.x === "number" ? prev.x : (sample?.x ?? 0),
        y: typeof prev.y === "number" ? prev.y : (sample?.y ?? 0),
        ...(defLang && langId === defLang ? {} : { translated: true }),
      };
    };

    writeLang(args.languageId, args.title);
    for (const [lang, t] of Object.entries(args.titles ?? {})) {
      if (t?.trim()) writeLang(lang, t);
    }

    await this.client.request({
      method: "PATCH",
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
      body: {
        edges: [
          {
            uuid: edge.uuid,
            points: edge.points ?? [],
            labels: nextLabels,
            breakdowns: edge.breakdowns ?? [],
          },
        ],
      },
    });
  }

  /**
   * Mark existing titles as translated (translated:true) without changing text.
   * Fixes GUI globes after earlier writes that incorrectly set translated:false.
   */
  async confirmTranslations(args: {
    repositoryId: string;
    languageId: string;
    /** When true, also PATCH model titles. Default true. */
    includeModels?: boolean;
    maxSymbols?: number;
  }) {
    const max = args.maxSymbols ?? 2000;
    const updated: Array<{
      kind: "symbol" | "model";
      id: string;
      ok: boolean;
      error?: string;
      skipped?: string;
    }> = [];
    let confirmedSymbols = 0;

    let startAt = 0;
    const pageSize = 100;
    for (;;) {
      if (confirmedSymbols >= max) break;
      const page = await this.client.request<{
        data?: Array<{
          uuid?: string;
          titles?: Record<string, { title?: string; rawTitle?: string; translated?: boolean }>;
        }>;
        total?: number;
      }>({
        path: "/api/v1/repositories/{repositoryId}/symbols",
        pathParams: { repositoryId: args.repositoryId },
        query: {
          startAt: String(startAt),
          maxResults: String(pageSize),
          projection: "ALL",
        },
      });
      const batch = page.data ?? [];
      if (batch.length === 0) break;

      for (const s of batch) {
        if (!s.uuid) continue;
        if (confirmedSymbols >= max) break;
        const entry = s.titles?.[args.languageId];
        if (!entry?.title?.trim()) {
          updated.push({
            kind: "symbol",
            id: s.uuid,
            ok: false,
            skipped: "missing-title",
          });
          continue;
        }
        if (entry.translated === true) {
          updated.push({
            kind: "symbol",
            id: s.uuid,
            ok: true,
            skipped: "already-true",
          });
          continue;
        }
        try {
          const title = entry.title.trim();
          const rawTitle = (entry.rawTitle ?? title).trim();
          await this.client.request({
            method: "PATCH",
            path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
            pathParams: {
              repositoryId: args.repositoryId,
              symbolId: s.uuid,
            },
            body: {
              titles: {
                [args.languageId]: {
                  title,
                  rawTitle,
                  translated: true,
                },
              },
            },
          });
          confirmedSymbols += 1;
          updated.push({ kind: "symbol", id: s.uuid, ok: true });
        } catch (err) {
          updated.push({
            kind: "symbol",
            id: s.uuid,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      startAt += batch.length;
      if (startAt >= (page.total ?? startAt)) break;
    }

    if (args.includeModels !== false) {
      let mStart = 0;
      for (;;) {
        const page = await this.client.request<{
          data?: Array<{
            uuid?: string;
            titles?: Record<string, { title?: string; translated?: boolean }>;
          }>;
          total?: number;
        }>({
          path: "/api/v1/repositories/{repositoryId}/models",
          pathParams: { repositoryId: args.repositoryId },
          query: {
            startAt: String(mStart),
            maxResults: String(pageSize),
            projection: "ALL",
          },
        });
        const batch = page.data ?? [];
        if (batch.length === 0) break;
        for (const m of batch) {
          if (!m.uuid) continue;
          const entry = m.titles?.[args.languageId];
          if (!entry?.title?.trim()) continue;
          if (entry.translated === true) continue;
          try {
            await this.client.request({
              method: "PATCH",
              path: "/api/v1/repositories/{repositoryId}/models/{modelId}",
              pathParams: {
                repositoryId: args.repositoryId,
                modelId: m.uuid,
              },
              body: {
                titles: {
                  [args.languageId]: {
                    title: entry.title.trim(),
                    translated: true,
                  },
                },
              },
            });
            updated.push({ kind: "model", id: m.uuid, ok: true });
          } catch (err) {
            updated.push({
              kind: "model",
              id: m.uuid,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        mStart += batch.length;
        if (mStart >= (page.total ?? mStart)) break;
      }
    }

    // Canvas edge labels (Ja/Nej etc.) — not on symbols; walk every model canvas.
    let edgeConfirmed = 0;
    let edgeAlready = 0;
    let edgeFailed = 0;
    let edgeModels = 0;
    {
      let mStart = 0;
      for (;;) {
        const page = await this.client.request<{
          data?: Array<{ uuid?: string }>;
          total?: number;
        }>({
          path: "/api/v1/repositories/{repositoryId}/models",
          pathParams: { repositoryId: args.repositoryId },
          query: {
            startAt: String(mStart),
            maxResults: String(pageSize),
            projection: "ALL",
          },
        });
        const batch = page.data ?? [];
        if (batch.length === 0) break;

        for (const m of batch) {
          if (!m.uuid) continue;
          try {
            const canvas = (await this.client.request({
              path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
              pathParams: {
                repositoryId: args.repositoryId,
                modelId: m.uuid,
              },
            })) as {
              edges?: Array<{
                uuid?: string;
                points?: Array<{ x?: number; y?: number }>;
                breakdowns?: unknown[];
                labels?: Record<
                  string,
                  {
                    title?: string;
                    rawTitle?: string;
                    translated?: boolean;
                    x?: number;
                    y?: number;
                    width?: number;
                    height?: number;
                  }
                >;
              }>;
            };
            const patchEdges: Array<Record<string, unknown>> = [];
            for (const e of canvas.edges ?? []) {
              if (!e.uuid || !e.labels) continue;
              const entry = e.labels[args.languageId];
              if (!entry?.title?.trim()) continue;
              if (entry.translated === true) {
                edgeAlready += 1;
                continue;
              }
              const nextLabels: Record<string, unknown> = {};
              for (const [lang, lab] of Object.entries(e.labels)) {
                if (lang === args.languageId) {
                  nextLabels[lang] = { ...lab, translated: true };
                } else {
                  nextLabels[lang] = lab;
                }
              }
              patchEdges.push({
                uuid: e.uuid,
                points: e.points ?? [],
                labels: nextLabels,
                breakdowns: e.breakdowns ?? [],
              });
            }
            if (patchEdges.length === 0) continue;
            await this.client.request({
              method: "PATCH",
              path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
              pathParams: {
                repositoryId: args.repositoryId,
                modelId: m.uuid,
              },
              body: { edges: patchEdges },
            });
            edgeConfirmed += patchEdges.length;
            edgeModels += 1;
            updated.push({
              kind: "model",
              id: m.uuid,
              ok: true,
              skipped: `edges:${patchEdges.length}`,
            });
          } catch (err) {
            edgeFailed += 1;
            updated.push({
              kind: "model",
              id: m.uuid,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        mStart += batch.length;
        if (mStart >= (page.total ?? mStart)) break;
      }
    }

    const confirmed = updated.filter((u) => u.ok && !u.skipped).length;
    const already = updated.filter((u) => u.skipped === "already-true").length;
    const failed = updated.filter((u) => !u.ok && !u.skipped).length;
    return {
      data: {
        languageId: args.languageId,
        confirmed,
        alreadyTrue: already,
        failed,
        edges: {
          confirmed: edgeConfirmed,
          alreadyTrue: edgeAlready,
          failedModels: edgeFailed,
          modelsPatched: edgeModels,
        },
        totalTouched: updated.length,
        // Cap detail list for MCP payload size
        sample: updated
          .filter(
            (u) => !u.skipped || u.skipped === "missing-title" || u.skipped?.startsWith("edges:"),
          )
          .slice(0, 30),
      },
      methodologyNotes: [
        "Sets translated:true on symbol/model titles and canvas edge labels (same text) so GUI globes clear.",
        "Edge labels (e.g. Ja/Nej / Yes/No) live on the canvas — not on symbols; included here.",
        "translated:false = not translated (globe ON); translated:true = confirmed (globe OFF).",
      ],
      nextSuggestedTools: ["list_untranslated_symbols", "update_titles"],
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
    const logicalType = args.objectType ?? "activity";
    const objectType = toApiObjectType(logicalType);
    const repoConfig = await this.getRepoConfig(args.repositoryId);
    const validation = validateProposedSymbol(this.pack, {
      objectType: logicalType,
      title: args.title,
      repoConfig,
    });
    const size = this.sizeFor(repoConfig, logicalType);
    const { distance } = this.layoutGaps(repoConfig);

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
      const exact = (search.symbols as Array<{ uuid?: string; title?: string }>).find(
        (s) => (s.title ?? "").trim().toLowerCase() === args.title.trim().toLowerCase(),
      );
      if (exact?.uuid) {
        symbolId = exact.uuid;
      }
    }

    if (!symbolId) {
      const alt = alternativeSymbolFor(logicalType);
      const titles = await this.titlesForLanguages(args.repositoryId, args.languageId, args.title);
      const symbol = (await this.client.request({
        method: "POST",
        path: "/api/v1/repositories/{repositoryId}/symbols",
        pathParams: { repositoryId: args.repositoryId },
        body: {
          objectType,
          ...(alt ? { alternativeSymbol: alt } : {}),
          titles,
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
    })) as {
      vertices?: Array<{
        uuid?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      }>;
    };

    const gapX = Math.max(distance.right, distance.left, 40);
    let x = args.x;
    let y = args.y;
    if (x === undefined || y === undefined) {
      const prev = args.connectFromVertexId
        ? (canvas.vertices ?? []).find((v) => v.uuid === args.connectFromVertexId)
        : undefined;
      if (prev && prev.x !== undefined && prev.width !== undefined) {
        x = x ?? Math.round(prev.x + prev.width + gapX);
        const prevMid = (prev.y ?? SPINE_MID_Y) + Math.floor((prev.height ?? size.height) / 2);
        y = y ?? Math.round(prevMid - size.height / 2);
      } else {
        x = x ?? SPINE_START_X;
        y = y ?? Math.round(SPINE_MID_Y - size.height / 2);
      }
    }

    const vertex = await this.placeVertex({
      repositoryId: args.repositoryId,
      modelId: args.modelId,
      symbolId,
      languageId: args.languageId,
      title: args.title,
      objectType: logicalType,
      x,
      y,
      width: size.width,
      height: size.height,
    });

    let edge: unknown = null;
    const vertexId = vertex.uuid;
    if (args.connectFromVertexId && vertexId) {
      edge = (
        await this.createCanvasEdge({
          repositoryId: args.repositoryId,
          modelId: args.modelId,
          fromVertexId: args.connectFromVertexId,
          toVertexId: vertexId,
          edgeType: args.edgeType ?? "flow",
          languageId: args.languageId,
        })
      ).data;
    }

    return {
      data: { symbolId, vertex, edge },
      methodologyNotes: [
        ...validation.methodologyNotes,
        "Placement avoids overlapping existing canvas vertices (auto-nudge if needed).",
      ],
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
    languageId: string;
    title?: string;
    objectType?: string;
    x?: number;
    y?: number;
  }) {
    const repoConfig = await this.getRepoConfig(args.repositoryId);
    const logicalType = args.objectType ?? "activity";
    const size = this.sizeFor(repoConfig, logicalType);
    const { distance } = this.layoutGaps(repoConfig);
    const canvas = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    })) as { vertices?: unknown[] };

    const count = canvas.vertices?.length ?? 0;
    const vertex = await this.placeVertex({
      repositoryId: args.repositoryId,
      modelId: args.modelId,
      symbolId: args.symbolId,
      languageId: args.languageId,
      title: args.title ?? "Symbol",
      objectType: logicalType,
      x: args.x ?? 80 + count * (size.width + distance.left),
      y: args.y ?? Y_BASE,
      width: size.width,
      height: size.height,
    });

    return {
      data: vertex,
      methodologyNotes: [
        "Reused existing symbol UUID — changes to the symbol propagate across models. Size from repository symbolsizes.",
        "Placement avoids overlapping existing canvas vertices (auto-nudge if needed).",
      ],
      nextSuggestedTools: ["set_activity_performer", "create_canvas_edge"],
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
        'Preferred write body: { symbol: "<overviewSymbolUuid>" }. Prefer link_breakdown.',
      ],
      nextSuggestedTools: ["get_breakdowns", "get_process_flow"],
    };
  }

  /**
   * Remove a breakdown link from a DETAIL model. Does not delete the model or symbol.
   * Requires TWO_C8_ALLOW_WRITES (not ALLOW_DELETES).
   */
  async deleteBreakdown(args: { repositoryId: string; modelId: string; breakdownId: string }) {
    await this.client.request({
      method: "DELETE",
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/broken-down-from/{breakdownId}",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
        breakdownId: args.breakdownId,
      },
    });
    return {
      data: {
        ok: true as const,
        modelId: args.modelId,
        breakdownId: args.breakdownId,
      },
      methodologyNotes: [
        "Removed broken-down-from link only — detail model and overview symbol remain.",
        "Use get_breakdowns on the detail (or get_navigation_tree) to find breakdownId before delete.",
      ],
      nextSuggestedTools: ["get_breakdowns", "get_navigation_tree", "link_breakdown"],
    };
  }

  /**
   * Link a detail model as breakdown of an overview symbol (process chevron).
   * POST body is { symbol: overviewSymbolId } on the detail model.
   */
  async linkBreakdown(args: {
    repositoryId: string;
    detailModelId: string;
    overviewSymbolId: string;
  }) {
    try {
      const created = await this.client.request({
        method: "POST",
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}/broken-down-from",
        pathParams: {
          repositoryId: args.repositoryId,
          modelId: args.detailModelId,
        },
        body: { symbol: args.overviewSymbolId },
      });
      return {
        data: created,
        methodologyNotes: [
          "Breakdown: detail model elaborates the overview process symbol (reuse same UUID on the map).",
        ],
        nextSuggestedTools: ["get_breakdowns", "describe_process_map"],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Idempotent: same symbol→detail link already present
      if (/\b409\b/.test(msg) || /already exists/i.test(msg)) {
        return {
          data: {
            alreadyLinked: true,
            detailModelId: args.detailModelId,
            overviewSymbolId: args.overviewSymbolId,
          },
          methodologyNotes: ["Breakdown already existed for this symbol/detail pair — left as-is."],
          nextSuggestedTools: ["get_breakdowns", "describe_process_map"],
        };
      }
      throw err;
    }
  }

  /**
   * Create a process map / overview: BO ↔ process chevrons on FLOW,
   * optional side loops, optional breakdowns to detail models.
   */
  async createProcessMap(args: {
    repositoryId: string;
    languageId: string;
    title: string;
    /**
     * Preferred: ordered detail model UUIDs. Server builds the overview chain
     * (BO↔process) from each detail's inputs/outputs — agents must not invent BOs.
     */
    detailModelIds?: string[];
    chain?: Array<{
      kind: "businessObject" | "process";
      title: string;
      symbolId?: string;
      detailModelId?: string;
    }>;
    /**
     * When chain has detailModelId on processes, rewrite BO nodes from detail scopes
     * (default true). Prevents overview-only invented inputs/outputs.
     */
    lockBosToDetailScope?: boolean;
    sideLoops?: Array<{
      fromBoTitle: string;
      processTitle: string;
      symbolId?: string;
      detailModelId?: string;
      placement?: "below";
    }>;
    /**
     * Parallel variant tracks sharing a state BO (e.g. sales/delivery types).
     * Laid out as columns to the RIGHT of fromBo — not fan-out side loops.
     */
    parallelTracks?: Array<{
      fromBoTitle: string;
      label?: string;
      processes: Array<{
        processTitle: string;
        symbolId?: string;
        detailModelId?: string;
        outputBoTitle?: string;
        outputSymbolId?: string;
      }>;
    }>;
    /**
     * Layout mode. threeBand = L0-style: management (top, no FLOW) /
     * core spine (middle) / support (bottom, no FLOW).
     * coreProcessIds = peer L1 chevrons on the core band without FLOW (no shared BO).
     */
    layout?: {
      mode?: "linear" | "parallelTracks" | "threeBand" | "peerRows";
      managementProcessIds?: string[];
      coreDetailModelIds?: string[];
      coreProcessIds?: string[];
      supportProcessIds?: string[];
    };
    permissionGroup?: string;
    owner?: string;
    group?: string;
    modelId?: string;
  }) {
    let chain = args.chain ?? [];
    const lockNotes: string[] = [];

    const layoutMode = args.layout?.mode ?? "linear";
    let detailModelIds = args.detailModelIds;
    if (
      layoutMode === "threeBand" &&
      !detailModelIds?.length &&
      args.layout?.coreDetailModelIds?.length
    ) {
      detailModelIds = args.layout.coreDetailModelIds;
      lockNotes.push("threeBand: coreDetailModelIds used as detailModelIds for FLOW spine.");
    }

    const managementProcessIds = args.layout?.managementProcessIds ?? [];
    const supportProcessIds = args.layout?.supportProcessIds ?? [];
    const coreProcessIds = args.layout?.coreProcessIds ?? [];
    const bandOnlyIds = [...managementProcessIds, ...supportProcessIds, ...coreProcessIds];
    /**
     * L0 band append: place management/support/core-peer chevrons without FLOW and without
     * requiring a linear handoff chain between peers (Inera G-014 / loop3 friction).
     * Trigger: threeBand + existing modelId + band ids + no new core detailModelIds.
     * Accidental process-only `chain` is ignored (agents often pass support as chain).
     */
    if (
      layoutMode === "threeBand" &&
      args.modelId &&
      bandOnlyIds.length > 0 &&
      !detailModelIds?.length
    ) {
      const processOnlyChain =
        chain.length > 0 && chain.every((n) => n.kind === "process" || n.kind === "businessObject")
          ? chain.every((n) => n.kind === "process")
          : chain.length === 0;
      if (chain.length > 0 && !processOnlyChain) {
        throw new Error(
          "create_process_map threeBand band-append: omit chain (or pass only process stubs). " +
            "Place ledning/stöd via layout.managementProcessIds / supportProcessIds; peer L1 on core via coreProcessIds — no FLOW, no shared BO required. " +
            "Linear FLOW spine uses coreDetailModelIds / detailModelIds on create (not on band-only append).",
        );
      }
      if (chain.length > 0 && processOnlyChain) {
        lockNotes.push(
          "threeBand band-append: ignored process-only chain; using management/support/coreProcessIds only (no FLOW).",
        );
      }
      return this.appendThreeBandBands({
        repositoryId: args.repositoryId,
        modelId: args.modelId,
        languageId: args.languageId,
        owner: args.owner,
        group: args.group,
        managementProcessIds,
        supportProcessIds,
        coreProcessIds,
        lockNotes,
      });
    }

    /**
     * threeBand create with only peer coreProcessIds (no linear handoff spine):
     * place core-band chevrons without FLOW + optional management/support bands.
     */
    if (
      layoutMode === "threeBand" &&
      !args.modelId &&
      coreProcessIds.length > 0 &&
      !detailModelIds?.length &&
      chain.length === 0
    ) {
      const created = await this.createProcessModel({
        repositoryId: args.repositoryId,
        title: args.title,
        languageId: args.languageId,
        modelType: "process",
        permissionGroup: args.permissionGroup,
        owner: args.owner,
        group: args.group,
      });
      const modelId =
        (created.data as { uuid?: string })?.uuid ??
        (created.data as { model?: { uuid?: string } })?.model?.uuid;
      if (!modelId) {
        throw new Error(
          "create_process_map: could not resolve modelId for threeBand coreProcessIds.",
        );
      }
      try {
        return await this.appendThreeBandBands({
          repositoryId: args.repositoryId,
          modelId,
          languageId: args.languageId,
          owner: args.owner,
          group: args.group,
          managementProcessIds,
          supportProcessIds,
          coreProcessIds,
          lockNotes: [
            ...lockNotes,
            "threeBand: created with coreProcessIds only (peer chevrons without FLOW; no linear handoff spine).",
          ],
        });
      } catch (err) {
        const note = await this.rollbackCreatedModel({
          repositoryId: args.repositoryId,
          modelId,
        });
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${msg}${note ? ` (${note})` : ""}`);
      }
    }

    // peerRows: independent rows from each detail scope — no shared BO between peers
    if (layoutMode === "peerRows") {
      if (!detailModelIds?.length) {
        throw new Error(
          "create_process_map layout.mode=peerRows requires detailModelIds (one detail per row).",
        );
      }
      let modelId = args.modelId;
      const appending = Boolean(args.modelId);
      let createdThisCall = false;
      if (!modelId) {
        const created = await this.createProcessModel({
          repositoryId: args.repositoryId,
          title: args.title,
          languageId: args.languageId,
          modelType: "process",
          permissionGroup: args.permissionGroup,
          owner: args.owner,
          group: args.group,
        });
        modelId =
          (created.data as { uuid?: string })?.uuid ??
          (created.data as { model?: { uuid?: string } })?.model?.uuid;
        if (!modelId) {
          throw new Error(
            "create_process_map: could not resolve modelId; pass modelId explicitly.",
          );
        }
        createdThisCall = true;
      }
      try {
        return await this.populatePeerRowsProcessMap({
          repositoryId: args.repositoryId,
          languageId: args.languageId,
          modelId,
          title: args.title,
          detailModelIds,
          appending,
          owner: args.owner,
          group: args.group,
        });
      } catch (err) {
        if (createdThisCall) {
          const note = await this.rollbackCreatedModel({
            repositoryId: args.repositoryId,
            modelId,
          });
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`${msg}${note ? ` (${note})` : ""}`);
        }
        throw err;
      }
    }

    if (detailModelIds?.length) {
      const built = await this.reader.buildProcessMapChainFromDetails({
        repositoryId: args.repositoryId,
        modelIds: detailModelIds,
        preserveOrder: true,
      });
      if (!built.readyForCreate) {
        throw new Error(
          `create_process_map blocked — cannot derive overview from detail scopes:\n` +
            built.uncertainLinks.join("\n") +
            `\nIf peers have distinct inputs (no shared BO), use layout: { mode: "peerRows" } with the same detailModelIds.` +
            (layoutMode === "threeBand"
              ? `\nL0 tip: put only a linear core on coreDetailModelIds (shared BO handoffs); place peer L1/areas on layout.coreProcessIds (core-band chevrons without FLOW); ledning/stöd via managementProcessIds/supportProcessIds.`
              : ""),
        );
      }
      chain = built.chain.map((n) => ({
        kind: n.kind,
        title: n.title,
        symbolId: n.symbolId,
        detailModelId: n.detailModelId,
      }));
      lockNotes.push(
        "Chain derived from detailModelIds (BO titles/symbolIds locked to detail scopes).",
      );
    } else if (
      chain.some((n) => n.kind === "process" && n.detailModelId) &&
      args.lockBosToDetailScope !== false
    ) {
      const locked = await this.reader.lockProcessMapChainToDetailScopes({
        repositoryId: args.repositoryId,
        chain,
      });
      if (!locked.readyForCreate) {
        throw new Error(
          `create_process_map blocked — detail scopes do not form a valid handoff chain:\n` +
            locked.uncertainLinks.join("\n"),
        );
      }
      if (locked.rewrote) {
        chain = locked.chain.map((n) => ({
          kind: n.kind,
          title: n.title,
          symbolId: n.symbolId,
          detailModelId: n.detailModelId,
        }));
        lockNotes.push(
          "Business objects on the chain were replaced with detail-scope inputs/outputs (lockBosToDetailScope).",
        );
      }
    }

    if (chain.length === 0) {
      throw new Error("create_process_map requires detailModelIds or a non-empty chain.");
    }

    const hasDetailLinks = chain.some((n) => n.kind === "process" && n.detailModelId);
    const bridgeValidation = hasDetailLinks
      ? await this.reader.validateProcessMapBoBridges({
          repositoryId: args.repositoryId,
          chain,
        })
      : { ok: true, checks: [], errors: [] as string[] };
    if (!bridgeValidation.ok) {
      throw new Error(
        `create_process_map blocked — overview process scope must match detail I/O:\n` +
          bridgeValidation.errors.join("\n"),
      );
    }

    let modelId = args.modelId;
    const appending = Boolean(args.modelId);
    let createdThisCall = false;
    if (!modelId) {
      const created = await this.createProcessModel({
        repositoryId: args.repositoryId,
        title: args.title,
        languageId: args.languageId,
        modelType: "process",
        permissionGroup: args.permissionGroup,
        owner: args.owner,
        group: args.group,
      });
      modelId =
        (created.data as { uuid?: string })?.uuid ??
        (created.data as { model?: { uuid?: string } })?.model?.uuid;
      if (!modelId) {
        throw new Error("create_process_map: could not resolve modelId; pass modelId explicitly.");
      }
      createdThisCall = true;
    }

    try {
      return await this.populateProcessMapCanvas({
        ...args,
        modelId,
        appending,
        chain,
        bridgeValidation,
        lockNotes,
        layout: args.layout,
      });
    } catch (err) {
      if (createdThisCall) {
        const note = await this.rollbackCreatedModel({
          repositoryId: args.repositoryId,
          modelId,
        });
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${msg}${note ? ` (${note})` : ""}`);
      }
      throw err;
    }
  }

  /**
   * Peer multi-row overview: one independent FLOW row per detail (own I/O).
   * No shared BO required between rows — solves MISSING_SHARED_BO for SAL/FIN/PEO/IT peers.
   * Gold spacing: BO x≈50 / process x≈100 / out ≈220 when gapX≈32 (TechSeed Sales template).
   */
  private async populatePeerRowsProcessMap(args: {
    repositoryId: string;
    languageId: string;
    modelId: string;
    title: string;
    detailModelIds: string[];
    appending: boolean;
    owner?: string;
    group?: string;
  }) {
    const repoConfig = await this.getRepoConfig(args.repositoryId);
    const { distance } = this.layoutGaps(repoConfig);
    const gapX = Math.max(distance.right, distance.left, 32);
    const rowGap = 140;
    const symbolCache = new Map<string, string>();
    const reserved: Array<{ x: number; y: number; width: number; height: number }> = [];
    const placed: Array<Record<string, unknown>> = [];
    const breakdowns: unknown[] = [];

    let spineMidY = SPINE_MID_Y;
    if (args.appending) {
      const canvas = (await this.client.request({
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
        pathParams: { repositoryId: args.repositoryId, modelId: args.modelId },
      })) as { vertices?: Array<{ y?: number; height?: number }> };
      let maxBottom = 0;
      for (const v of canvas.vertices ?? []) {
        maxBottom = Math.max(maxBottom, (v.y ?? 0) + (v.height ?? 0));
      }
      if ((canvas.vertices?.length ?? 0) > 0) {
        spineMidY = Math.round(maxBottom + rowGap);
      }
    }

    const boSize = this.sizeFor(repoConfig, "businessObject");
    const procSize = this.sizeFor(repoConfig, "process");

    for (let ri = 0; ri < args.detailModelIds.length; ri++) {
      const detailModelId = args.detailModelIds[ri]!;
      const scope = await this.reader.getDetailProcessScope({
        repositoryId: args.repositoryId,
        modelId: detailModelId,
      });
      const rowMidY = spineMidY + ri * rowGap;
      let cursorX = SPINE_START_X;
      let prevVertexId: string | null = null;

      const placeBo = async (title: string, symbolId?: string) => {
        const sid =
          symbolId ??
          (await this.resolveOrCreateSymbol({
            repositoryId: args.repositoryId,
            languageId: args.languageId,
            title,
            objectType: "businessObject",
            owner: args.owner,
            group: args.group,
            cache: symbolCache,
          }));
        const y = Math.round(rowMidY - boSize.height / 2);
        const vertex = await this.placeVertex({
          repositoryId: args.repositoryId,
          modelId: args.modelId,
          symbolId: sid,
          languageId: args.languageId,
          title,
          objectType: "businessObject",
          x: cursorX,
          y,
          width: boSize.width,
          height: boSize.height,
          reserved,
          spineAlign: true,
        });
        const vid = String(vertex.uuid);
        if (prevVertexId) {
          await this.createCanvasEdge({
            repositoryId: args.repositoryId,
            modelId: args.modelId,
            fromVertexId: prevVertexId,
            toVertexId: vid,
            edgeType: "flow",
            languageId: args.languageId,
          });
        }
        placed.push({
          title,
          kind: "businessObject",
          symbolId: sid,
          vertexId: vid,
          x: vertex.x ?? cursorX,
          y: vertex.y ?? y,
          detailModelId,
          row: ri,
        });
        cursorX = Math.round((vertex.x ?? cursorX) + boSize.width + gapX);
        prevVertexId = vid;
        return vid;
      };

      if (!scope.inputs.length || !scope.outputs.length) {
        throw new Error(
          `peerRows: detail ${detailModelId} ("${scope.processTitle}") missing primary input or output — fix the detail model first.`,
        );
      }
      const inputs = scope.inputs;
      // Primary input on spine; extras stacked below same X after primary placed
      const primaryIn = inputs[0]!;
      await placeBo(primaryIn.title, primaryIn.symbolId);
      const primaryInX = cursorX - gapX - boSize.width;
      for (let ii = 1; ii < inputs.length; ii++) {
        const extra = inputs[ii]!;
        const sid =
          extra.symbolId ??
          (await this.resolveOrCreateSymbol({
            repositoryId: args.repositoryId,
            languageId: args.languageId,
            title: extra.title,
            objectType: "businessObject",
            owner: args.owner,
            group: args.group,
            cache: symbolCache,
          }));
        const y = Math.round(
          rowMidY + boSize.height / 2 + distance.bottom + (ii - 1) * (boSize.height + 12),
        );
        const vertex = await this.placeVertex({
          repositoryId: args.repositoryId,
          modelId: args.modelId,
          symbolId: sid,
          languageId: args.languageId,
          title: extra.title,
          objectType: "businessObject",
          x: primaryInX,
          y,
          width: boSize.width,
          height: boSize.height,
          reserved,
        });
        const vid = String(vertex.uuid);
        // Extra inputs FLOW into process left — edge added after process placed
        placed.push({
          title: extra.title,
          kind: "businessObject",
          symbolId: sid,
          vertexId: vid,
          stackedInput: true,
          row: ri,
        });
        (placed as Array<{ _pendingInputEdge?: string }>).at(-1)!._pendingInputEdge = vid;
      }

      const procSymbol =
        scope.processSymbolId ??
        (await this.resolveOrCreateSymbol({
          repositoryId: args.repositoryId,
          languageId: args.languageId,
          title: scope.processTitle,
          objectType: "process",
          owner: args.owner,
          group: args.group,
          cache: symbolCache,
        }));
      const procY = Math.round(rowMidY - procSize.height / 2);
      const procVertex = await this.placeVertex({
        repositoryId: args.repositoryId,
        modelId: args.modelId,
        symbolId: procSymbol,
        languageId: args.languageId,
        title: scope.processTitle,
        objectType: "process",
        x: cursorX,
        y: procY,
        width: procSize.width,
        height: procSize.height,
        reserved,
        spineAlign: true,
      });
      const procVid = String(procVertex.uuid);
      if (prevVertexId) {
        await this.createCanvasEdge({
          repositoryId: args.repositoryId,
          modelId: args.modelId,
          fromVertexId: prevVertexId,
          toVertexId: procVid,
          edgeType: "flow",
          languageId: args.languageId,
        });
      }
      for (const p of placed) {
        const pending = (p as { _pendingInputEdge?: string })._pendingInputEdge;
        if (pending && (p as { row?: number }).row === ri) {
          await this.createCanvasEdge({
            repositoryId: args.repositoryId,
            modelId: args.modelId,
            fromVertexId: pending,
            toVertexId: procVid,
            edgeType: "flow",
            languageId: args.languageId,
          });
          delete (p as { _pendingInputEdge?: string })._pendingInputEdge;
        }
      }
      placed.push({
        title: scope.processTitle,
        kind: "process",
        symbolId: procSymbol,
        vertexId: procVid,
        detailModelId,
        row: ri,
      });
      const bd = await this.linkBreakdown({
        repositoryId: args.repositoryId,
        detailModelId,
        overviewSymbolId: procSymbol,
      });
      breakdowns.push({ detailModelId, overviewSymbolId: procSymbol, result: bd.data });
      cursorX = Math.round((procVertex.x ?? cursorX) + procSize.width + gapX);
      prevVertexId = procVid;

      const outputs = scope.outputs;
      const primaryOut = outputs[0]!;
      await placeBo(primaryOut.title, primaryOut.symbolId);
      for (let oi = 1; oi < outputs.length; oi++) {
        const extra = outputs[oi]!;
        const sid =
          extra.symbolId ??
          (await this.resolveOrCreateSymbol({
            repositoryId: args.repositoryId,
            languageId: args.languageId,
            title: extra.title,
            objectType: "businessObject",
            owner: args.owner,
            group: args.group,
            cache: symbolCache,
          }));
        const outX = cursorX - gapX - boSize.width;
        const y = Math.round(
          rowMidY + boSize.height / 2 + distance.bottom + (oi - 1) * (boSize.height + 12),
        );
        const vertex = await this.placeVertex({
          repositoryId: args.repositoryId,
          modelId: args.modelId,
          symbolId: sid,
          languageId: args.languageId,
          title: extra.title,
          objectType: "businessObject",
          x: outX,
          y,
          width: boSize.width,
          height: boSize.height,
          reserved,
        });
        const vid = String(vertex.uuid);
        await this.createCanvasEdge({
          repositoryId: args.repositoryId,
          modelId: args.modelId,
          fromVertexId: procVid,
          toVertexId: vid,
          edgeType: "flow",
          languageId: args.languageId,
        });
        placed.push({
          title: extra.title,
          kind: "businessObject",
          symbolId: sid,
          vertexId: vid,
          stackedOutput: true,
          row: ri,
        });
      }
    }

    return {
      data: {
        modelId: args.modelId,
        title: args.title,
        layoutMode: "peerRows",
        rowCount: args.detailModelIds.length,
        placedCount: placed.length,
        breakdownCount: breakdowns.length,
        placed,
        breakdowns,
      },
      methodologyNotes: [
        "peerRows: each detail gets its own FLOW row (input BO → process → output BO) without requiring a shared handoff BO between peers.",
        "Prefer this over inventing overview-only bridge BOs when peers have distinct inputs (Sales MSP/CV, Finance streams, …).",
        "Call review_process_model with layoutMode=peerRows and detailModelIds.",
      ],
      nextSuggestedTools: [
        "describe_process_map",
        "review_process_model",
        "get_navigation_tree",
        "verify_handoffs",
      ],
    };
  }

  private async populateProcessMapCanvas(args: {
    repositoryId: string;
    title: string;
    languageId: string;
    modelId: string;
    appending: boolean;
    permissionGroup?: string;
    owner?: string;
    group?: string;
    chain: Array<{
      kind: "businessObject" | "process";
      title: string;
      symbolId?: string;
      detailModelId?: string;
      objectType?: string;
    }>;
    bridgeValidation: {
      ok: boolean;
      checks: Array<Record<string, unknown>>;
      errors: string[];
    };
    lockNotes: string[];
    sideLoops?: Array<{
      fromBoTitle: string;
      processTitle: string;
      symbolId?: string;
      detailModelId?: string;
    }>;
    parallelTracks?: Array<{
      fromBoTitle: string;
      label?: string;
      processes: Array<{
        processTitle: string;
        symbolId?: string;
        detailModelId?: string;
        outputBoTitle?: string;
        outputSymbolId?: string;
      }>;
    }>;
    layout?: {
      mode?: "linear" | "parallelTracks" | "threeBand" | "peerRows";
      managementProcessIds?: string[];
      coreDetailModelIds?: string[];
      coreProcessIds?: string[];
      supportProcessIds?: string[];
    };
  }) {
    const modelId = args.modelId;
    const chain = args.chain;
    const bridgeValidation = args.bridgeValidation;
    const repoConfig = await this.getRepoConfig(args.repositoryId);
    const { distance } = this.layoutGaps(repoConfig);
    const gapX = Math.max(distance.right, distance.left, 40);
    const gapY = Math.max(distance.bottom, 30);
    const rowGap = 140;
    const symbolCache = new Map<string, string>();
    const reserved: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];

    // Keep BO + process on one midline; when appending, start a new row below
    // existing content instead of colliding with the first spine.
    let spineMidY = SPINE_MID_Y;
    if (args.appending) {
      const canvas = (await this.client.request({
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
        pathParams: {
          repositoryId: args.repositoryId,
          modelId,
        },
      })) as {
        vertices?: Array<{
          x?: number;
          y?: number;
          width?: number;
          height?: number;
        }>;
      };
      let maxBottom = 0;
      for (const v of canvas.vertices ?? []) {
        const bottom = (v.y ?? 0) + (v.height ?? 0);
        if (bottom > maxBottom) maxBottom = bottom;
      }
      if ((canvas.vertices?.length ?? 0) > 0) {
        spineMidY = Math.round(maxBottom + rowGap);
      }
    }
    // threeBand places management above the spine; raise midline so y >= MIN_VERTEX_Y.
    if (args.layout?.mode === "threeBand") {
      const procH = this.sizeFor(repoConfig, "process").height;
      const minSpineMidY = MIN_VERTEX_Y + THREE_BAND_GAP + Math.ceil(procH / 2);
      if (spineMidY < minSpineMidY) {
        spineMidY = minSpineMidY;
      }
    }

    const placed: Array<{
      title: string;
      kind: string;
      objectType: string;
      symbolId: string;
      vertexId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      detailModelId?: string;
    }> = [];
    const breakdowns: unknown[] = [];

    type SpineNode = {
      vertexId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      kind: string;
      title: string;
      symbolId?: string;
      detailModelId?: string;
    };

    let prevSpine: SpineNode | null = null;
    /** primary BO vertexId → stacked extra BO vertexIds */
    const stackedUnder = new Map<string, string[]>();
    const spineGroups = this.groupSpineNodes(chain);

    const placeOneBo = async (
      node: (typeof chain)[number],
      x: number,
      y: number,
      onSpine: boolean,
    ): Promise<SpineNode> => {
      const size = this.sizeFor(repoConfig, "businessObject");
      const symbolId =
        node.symbolId ??
        (await this.resolveOrCreateSymbol({
          repositoryId: args.repositoryId,
          languageId: args.languageId,
          title: node.title,
          objectType: "businessObject",
          owner: args.owner,
          group: args.group,
          cache: symbolCache,
        }));
      const vertex = await this.placeVertex({
        repositoryId: args.repositoryId,
        modelId,
        symbolId,
        languageId: args.languageId,
        title: node.title,
        objectType: "businessObject",
        x,
        y,
        width: size.width,
        height: size.height,
        reserved,
        spineAlign: onSpine,
      });
      const usedX = vertex.x ?? x;
      const usedY = vertex.y ?? y;
      const entry: SpineNode = {
        title: node.title,
        kind: "businessObject",
        symbolId,
        vertexId: String(vertex.uuid),
        x: usedX,
        y: usedY,
        width: size.width,
        height: size.height,
      };
      placed.push({
        title: entry.title,
        kind: entry.kind,
        objectType: "businessObject",
        symbolId,
        vertexId: entry.vertexId,
        x: usedX,
        y: usedY,
        width: size.width,
        height: size.height,
        detailModelId: node.detailModelId,
      });
      return entry;
    };

    for (let gi = 0; gi < spineGroups.length; gi++) {
      const group = spineGroups[gi]!;
      const prevIsProcess = prevSpine?.kind === "process";

      if (group.type === "bo-group") {
        const primaryNode = group.items[0]!;
        const boSize = this.sizeFor(repoConfig, "businessObject");
        const placeX = prevSpine ? Math.round(prevSpine.x + prevSpine.width + gapX) : SPINE_START_X;
        const placeY = Math.round(spineMidY - boSize.height / 2);
        const primary = await placeOneBo(primaryNode, placeX, placeY, true);

        if (prevIsProcess && prevSpine) {
          await this.createCanvasEdge({
            repositoryId: args.repositoryId,
            modelId,
            fromVertexId: prevSpine.vertexId,
            toVertexId: primary.vertexId,
            edgeType: "flow",
            languageId: args.languageId,
          });
        }

        const stackedIds: string[] = [];
        for (let si = 1; si < group.items.length; si++) {
          const extra = group.items[si]!;
          const sx = primary.x;
          const sy = Math.round(
            primary.y + primary.height + gapY + (si - 1) * (boSize.height + gapY),
          );
          const stackedBo = await placeOneBo(extra, sx, sy, false);
          stackedIds.push(stackedBo.vertexId);
          if (prevIsProcess && prevSpine) {
            // Extra outputs: leave process RIGHT → stacked BO
            await this.createCanvasEdge({
              repositoryId: args.repositoryId,
              modelId,
              fromVertexId: prevSpine.vertexId,
              toVertexId: stackedBo.vertexId,
              edgeType: "flow",
              languageId: args.languageId,
            });
          }
        }
        stackedUnder.set(primary.vertexId, stackedIds);
        prevSpine = primary;
        continue;
      }

      const node = group.item;
      const objectType = node.kind === "process" ? "process" : "businessObject";
      const size = this.sizeFor(repoConfig, objectType);
      const symbolId =
        node.symbolId ??
        (await this.resolveOrCreateSymbol({
          repositoryId: args.repositoryId,
          languageId: args.languageId,
          title: node.title,
          objectType,
          owner: args.owner,
          group: args.group,
          cache: symbolCache,
        }));
      const placeX: number = prevSpine
        ? Math.round(prevSpine.x + prevSpine.width + gapX)
        : SPINE_START_X;
      const placeY: number = Math.round(spineMidY - size.height / 2);
      const vertex = await this.placeVertex({
        repositoryId: args.repositoryId,
        modelId,
        symbolId,
        languageId: args.languageId,
        title: node.title,
        objectType,
        x: placeX,
        y: placeY,
        width: size.width,
        height: size.height,
        reserved,
        spineAlign: true,
      });
      const vertexId = String(vertex.uuid);
      const usedX: number = vertex.x ?? placeX;
      const usedY: number = vertex.y ?? placeY;

      if (prevSpine) {
        if (prevSpine.kind === "businessObject") {
          // Primary + stacked extras → process LEFT (multi-input)
          const incomingIds = [prevSpine.vertexId, ...(stackedUnder.get(prevSpine.vertexId) ?? [])];
          for (const fromId of incomingIds) {
            await this.createCanvasEdge({
              repositoryId: args.repositoryId,
              modelId,
              fromVertexId: fromId,
              toVertexId: vertexId,
              edgeType: "flow",
              languageId: args.languageId,
            });
          }
        } else {
          await this.createCanvasEdge({
            repositoryId: args.repositoryId,
            modelId,
            fromVertexId: prevSpine.vertexId,
            toVertexId: vertexId,
            edgeType: "flow",
            languageId: args.languageId,
          });
        }
      }

      if (node.kind === "process" && node.detailModelId) {
        const bd = await this.linkBreakdown({
          repositoryId: args.repositoryId,
          detailModelId: node.detailModelId,
          overviewSymbolId: symbolId,
        });
        breakdowns.push({
          detailModelId: node.detailModelId,
          overviewSymbolId: symbolId,
          result: bd.data,
        });
      }

      placed.push({
        title: node.title,
        kind: node.kind,
        objectType,
        symbolId,
        vertexId,
        x: usedX,
        y: usedY,
        width: size.width,
        height: size.height,
        detailModelId: node.detailModelId,
      });
      prevSpine = {
        title: node.title,
        kind: node.kind,
        symbolId,
        vertexId,
        x: usedX,
        y: usedY,
        width: size.width,
        height: size.height,
        detailModelId: node.detailModelId,
      };
    }

    await this.placeExtraScopeIoStacked({
      repositoryId: args.repositoryId,
      modelId,
      languageId: args.languageId,
      owner: args.owner,
      group: args.group,
      symbolCache,
      reserved,
      gapY,
      placed,
    });

    // Side loops: stack under each state BO in a column that never goes left of the BO / margin
    const sideLoopIndexByBo = new Map<string, number>();
    for (const loop of args.sideLoops ?? []) {
      const bo = placed.find(
        (p) =>
          p.kind === "businessObject" &&
          p.title.toLowerCase() === loop.fromBoTitle.trim().toLowerCase(),
      );
      if (!bo) {
        throw new Error(
          `create_process_map: sideLoop fromBoTitle '${loop.fromBoTitle}' not found on chain`,
        );
      }
      const size = this.sizeFor(repoConfig, "process");
      const symbolId =
        loop.symbolId ??
        (await this.resolveOrCreateSymbol({
          repositoryId: args.repositoryId,
          languageId: args.languageId,
          title: loop.processTitle,
          objectType: "process",
          owner: args.owner,
          group: args.group,
          cache: symbolCache,
        }));
      const boKey = bo.vertexId;
      const idx = sideLoopIndexByBo.get(boKey) ?? 0;
      sideLoopIndexByBo.set(boKey, idx + 1);
      // Prefer under-BO column starting at max(margin, bo.x) — never x < bo.x
      const rawX = Math.round(bo.x + Math.floor(bo.width / 2) - size.width / 2);
      const x = Math.max(MAP_LEFT_MARGIN, bo.x, rawX);
      const y = Math.round(bo.y + bo.height + gapY * 2 + idx * (size.height + gapY));

      const vertex = await this.placeVertex({
        repositoryId: args.repositoryId,
        modelId,
        symbolId,
        languageId: args.languageId,
        title: loop.processTitle,
        objectType: "process",
        x,
        y,
        width: size.width,
        height: size.height,
        reserved,
      });
      const vertexId = String(vertex.uuid);
      const usedX = vertex.x ?? x;
      const usedY = vertex.y ?? y;

      // Side attachment under a state BO: one FLOW BO → process (no return edge).
      await this.createCanvasEdge({
        repositoryId: args.repositoryId,
        modelId,
        fromVertexId: bo.vertexId,
        toVertexId: vertexId,
        edgeType: "flow",
        languageId: args.languageId,
      });

      if (loop.detailModelId) {
        const bd = await this.linkBreakdown({
          repositoryId: args.repositoryId,
          detailModelId: loop.detailModelId,
          overviewSymbolId: symbolId,
        });
        breakdowns.push({
          detailModelId: loop.detailModelId,
          overviewSymbolId: symbolId,
          result: bd.data,
        });
      }

      placed.push({
        title: loop.processTitle,
        kind: "sideLoop",
        objectType: "process",
        symbolId,
        vertexId,
        x: usedX,
        y: usedY,
        width: size.width,
        height: size.height,
        detailModelId: loop.detailModelId,
      });
    }

    // Parallel variant tracks: columns to the RIGHT of a shared state BO
    let parallelTrackCount = 0;
    for (const track of args.parallelTracks ?? []) {
      const bo = placed.find(
        (p) =>
          p.kind === "businessObject" &&
          p.title.toLowerCase() === track.fromBoTitle.trim().toLowerCase(),
      );
      if (!bo) {
        throw new Error(
          `create_process_map: parallelTracks fromBoTitle '${track.fromBoTitle}' not found on chain`,
        );
      }
      const procSize = this.sizeFor(repoConfig, "process");
      const boSize = this.sizeFor(repoConfig, "businessObject");
      let trackIndex = 0;
      for (const proc of track.processes) {
        const symbolId =
          proc.symbolId ??
          (await this.resolveOrCreateSymbol({
            repositoryId: args.repositoryId,
            languageId: args.languageId,
            title: proc.processTitle,
            objectType: "process",
            owner: args.owner,
            group: args.group,
            cache: symbolCache,
          }));
        const x = Math.max(
          MAP_LEFT_MARGIN,
          Math.round(bo.x + bo.width + gapX + trackIndex * (procSize.width + PARALLEL_TRACK_GAP)),
        );
        const y = Math.round(bo.y + bo.height + gapY * 2);
        const vertex = await this.placeVertex({
          repositoryId: args.repositoryId,
          modelId,
          symbolId,
          languageId: args.languageId,
          title: proc.processTitle,
          objectType: "process",
          x,
          y,
          width: procSize.width,
          height: procSize.height,
          reserved,
        });
        const vertexId = String(vertex.uuid);
        const usedX = vertex.x ?? x;
        const usedY = vertex.y ?? y;
        await this.createCanvasEdge({
          repositoryId: args.repositoryId,
          modelId,
          fromVertexId: bo.vertexId,
          toVertexId: vertexId,
          edgeType: "flow",
          languageId: args.languageId,
        });
        if (proc.detailModelId) {
          const bd = await this.linkBreakdown({
            repositoryId: args.repositoryId,
            detailModelId: proc.detailModelId,
            overviewSymbolId: symbolId,
          });
          breakdowns.push({
            detailModelId: proc.detailModelId,
            overviewSymbolId: symbolId,
            result: bd.data,
            track: track.label,
          });
        }
        placed.push({
          title: proc.processTitle,
          kind: "parallelTrack",
          objectType: "process",
          symbolId,
          vertexId,
          x: usedX,
          y: usedY,
          width: procSize.width,
          height: procSize.height,
          detailModelId: proc.detailModelId,
        });
        if (proc.outputBoTitle) {
          const outSymbolId =
            proc.outputSymbolId ??
            (await this.resolveOrCreateSymbol({
              repositoryId: args.repositoryId,
              languageId: args.languageId,
              title: proc.outputBoTitle,
              objectType: "businessObject",
              owner: args.owner,
              group: args.group,
              cache: symbolCache,
            }));
          const ox = Math.round(usedX + procSize.width + gapX);
          const oy = Math.round(usedY + Math.floor((procSize.height - boSize.height) / 2));
          const outVertex = await this.placeVertex({
            repositoryId: args.repositoryId,
            modelId,
            symbolId: outSymbolId,
            languageId: args.languageId,
            title: proc.outputBoTitle,
            objectType: "businessObject",
            x: ox,
            y: oy,
            width: boSize.width,
            height: boSize.height,
            reserved,
          });
          const outId = String(outVertex.uuid);
          await this.createCanvasEdge({
            repositoryId: args.repositoryId,
            modelId,
            fromVertexId: vertexId,
            toVertexId: outId,
            edgeType: "flow",
            languageId: args.languageId,
          });
          placed.push({
            title: proc.outputBoTitle,
            kind: "businessObject",
            objectType: "businessObject",
            symbolId: outSymbolId,
            vertexId: outId,
            x: outVertex.x ?? ox,
            y: outVertex.y ?? oy,
            width: boSize.width,
            height: boSize.height,
          });
        }
        trackIndex += 1;
        parallelTrackCount += 1;
      }
    }

    let threeBandCount = 0;
    if (args.layout?.mode === "threeBand") {
      const band = await this.placeThreeBandProcesses({
        repositoryId: args.repositoryId,
        modelId,
        languageId: args.languageId,
        owner: args.owner,
        group: args.group,
        spineMidY,
        managementProcessIds: args.layout.managementProcessIds ?? [],
        supportProcessIds: args.layout.supportProcessIds ?? [],
        coreProcessIds: args.layout.coreProcessIds ?? [],
        symbolCache,
        reserved,
        gapX,
      });
      placed.push(...band.placed);
      breakdowns.push(...band.breakdowns);
      threeBandCount = band.placed.length;
      if (band.notes.length) {
        args.lockNotes.push(...band.notes);
      }
    }

    return {
      data: {
        modelId,
        placed,
        breakdowns,
        bridgeChecks: bridgeValidation.checks,
        chainUsed: chain,
        chainLength: chain.length,
        sideLoopCount: args.sideLoops?.length ?? 0,
        parallelTrackCount,
        threeBandCount,
        layoutMode: args.layout?.mode ?? "linear",
      },
      methodologyNotes: [
        "Process map: process chevrons + business objects on FLOW (not activities).",
        "SCOPE: each process on the map uses the same input/output BOs as its detail model.",
        "Multi I/O: one primary BO on the FLOW spine; extras stacked directly below with FLOW to process left (inputs) or from process right (outputs).",
        "Prefer detailModelIds so the server derives the BO chain — do not invent overview BOs.",
        "Reuse process symbol UUIDs; breakdowns link detail models to those symbols.",
        "Side loops stack under a state BO (never left of the BO / map margin).",
        "parallelTracks: variant processes in columns to the right of a shared BO — use instead of sideLoops for peer variants.",
        "threeBand: management (top) and support (bottom) are chevrons without FLOW to the core spine — approved L0 exception for review_process_model.",
        ...args.lockNotes,
      ],
      nextSuggestedTools: [
        "review_process_model",
        "describe_process_map",
        "get_detail_process_scope",
        "get_breakdowns",
        "get_navigation_tree",
      ],
    };
  }

  /**
   * Append management/support chevrons to an existing L0 without touching the FLOW spine.
   * No shared BO / linear handoff required between band peers.
   */
  private async appendThreeBandBands(args: {
    repositoryId: string;
    modelId: string;
    languageId: string;
    owner?: string;
    group?: string;
    managementProcessIds: string[];
    supportProcessIds: string[];
    coreProcessIds?: string[];
    lockNotes: string[];
  }) {
    const canvas = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    })) as {
      vertices?: Array<{
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        objectType?: string;
      }>;
    };
    const reserved: Array<{ x: number; y: number; width: number; height: number }> = [];
    const boCenters: number[] = [];
    for (const v of canvas.vertices ?? []) {
      reserved.push({
        x: v.x ?? 0,
        y: v.y ?? 0,
        width: v.width ?? 0,
        height: v.height ?? 0,
      });
      const ot = (v.objectType ?? "").toLowerCase();
      if (ot === "businessobject" || ot === "business_object") {
        boCenters.push((v.y ?? 0) + (v.height ?? 0) / 2);
      }
    }
    let spineMidY = SPINE_MID_Y;
    if (boCenters.length) {
      const sorted = [...boCenters].sort((a, b) => a - b);
      spineMidY = Math.round(sorted[Math.floor(sorted.length / 2)]!);
    } else if (reserved.length) {
      const centers = reserved.map((r) => r.y + r.height / 2).sort((a, b) => a - b);
      spineMidY = Math.round(centers[Math.floor(centers.length / 2)]!);
    }
    const repoConfig = await this.getRepoConfig(args.repositoryId);
    const { distance } = this.layoutGaps(repoConfig);
    const gapX = Math.max(distance.right, distance.left, 40);
    const symbolCache = new Map<string, string>();
    const band = await this.placeThreeBandProcesses({
      repositoryId: args.repositoryId,
      modelId: args.modelId,
      languageId: args.languageId,
      owner: args.owner,
      group: args.group,
      spineMidY,
      managementProcessIds: args.managementProcessIds,
      supportProcessIds: args.supportProcessIds,
      coreProcessIds: args.coreProcessIds ?? [],
      symbolCache,
      reserved,
      gapX,
    });
    const notes = [...args.lockNotes, ...band.notes];
    return {
      data: {
        modelId: args.modelId,
        placed: band.placed,
        breakdowns: band.breakdowns,
        bridgeChecks: [],
        chainUsed: [],
        chainLength: 0,
        sideLoopCount: 0,
        parallelTrackCount: 0,
        threeBandCount: band.placed.length,
        layoutMode: "threeBand",
        bandAppend: true,
      },
      methodologyNotes: [
        "threeBand band-append: management/support/coreProcessIds chevrons placed without FLOW and without inventing bridge BOs.",
        "coreProcessIds = peer L1/areas on the core band without shared handoff BO (prefer over putting kärna in support band).",
        "Linear FLOW spine still uses coreDetailModelIds when peers share BOs; otherwise coreProcessIds + optional linear core.",
        "L1 without L0-upward is an approved exception when documented in STATE.",
        ...notes,
      ],
      nextSuggestedTools: ["review_process_model", "get_navigation_tree", "describe_process_map"],
    };
  }

  /**
   * L0 side bands: place process chevrons above/below the core spine without FLOW.
   * managementProcessIds / supportProcessIds are detail model UUIDs (scope → title/symbol).
   */
  private async placeThreeBandProcesses(args: {
    repositoryId: string;
    modelId: string;
    languageId: string;
    owner?: string;
    group?: string;
    spineMidY: number;
    managementProcessIds: string[];
    supportProcessIds: string[];
    /** Peer L1 on core midline without FLOW (no shared BO required). */
    coreProcessIds?: string[];
    symbolCache: Map<string, string>;
    reserved: Array<{ x: number; y: number; width: number; height: number }>;
    gapX: number;
  }): Promise<{
    placed: Array<{
      title: string;
      kind: string;
      objectType: string;
      symbolId: string;
      vertexId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      detailModelId?: string;
    }>;
    breakdowns: unknown[];
    notes: string[];
  }> {
    const repoConfig = await this.getRepoConfig(args.repositoryId);
    const procSize = this.sizeFor(repoConfig, "process");
    const bandGap = THREE_BAND_GAP;
    const placed: Array<{
      title: string;
      kind: string;
      objectType: string;
      symbolId: string;
      vertexId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      detailModelId?: string;
    }> = [];
    const breakdowns: unknown[] = [];
    const notes: string[] = [];

    const placeBand = async (modelIds: string[], band: "management" | "support" | "core") => {
      if (!modelIds.length) return;
      // Clamp: 2c8 API rejects Vertex y < 0 (FB-001).
      const y = Math.max(
        MIN_VERTEX_Y,
        band === "management"
          ? Math.round(args.spineMidY - bandGap - procSize.height / 2)
          : band === "support"
            ? Math.round(args.spineMidY + bandGap - procSize.height / 2)
            : Math.round(args.spineMidY - procSize.height / 2),
      );
      // Core-band peers: start to the right of existing reserved content when appending to a FLOW spine
      let x = SPINE_START_X;
      if (band === "core" && args.reserved.length) {
        let maxRight = SPINE_START_X;
        for (const r of args.reserved) {
          maxRight = Math.max(maxRight, r.x + r.width);
        }
        x = Math.round(maxRight + args.gapX);
      }
      for (const detailModelId of modelIds) {
        let title = "Process";
        let symbolId: string | undefined;
        try {
          const scope = await this.reader.getDetailProcessScope({
            repositoryId: args.repositoryId,
            modelId: detailModelId,
          });
          title = scope.processTitle || title;
          symbolId = scope.processSymbolId;
        } catch (err) {
          notes.push(
            `${band} model ${detailModelId}: scope failed (${
              err instanceof Error ? err.message : String(err)
            }) — skipped`,
          );
          continue;
        }
        if (!symbolId) {
          symbolId = await this.resolveOrCreateSymbol({
            repositoryId: args.repositoryId,
            languageId: args.languageId,
            title,
            objectType: "process",
            owner: args.owner,
            group: args.group,
            cache: args.symbolCache,
          });
        }
        const vertex = await this.placeVertex({
          repositoryId: args.repositoryId,
          modelId: args.modelId,
          symbolId,
          languageId: args.languageId,
          title,
          objectType: "process",
          x,
          y,
          width: procSize.width,
          height: procSize.height,
          reserved: args.reserved,
        });
        const usedX = vertex.x ?? x;
        const usedY = vertex.y ?? y;
        const vertexId = String(vertex.uuid);
        placed.push({
          title,
          kind: "process",
          objectType: "process",
          symbolId,
          vertexId,
          x: usedX,
          y: usedY,
          width: procSize.width,
          height: procSize.height,
          detailModelId,
        });
        try {
          const bd = await this.linkBreakdown({
            repositoryId: args.repositoryId,
            detailModelId,
            overviewSymbolId: symbolId,
          });
          breakdowns.push(bd.data);
        } catch (err) {
          notes.push(
            `${band} breakdown ${title}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        x = Math.round(usedX + procSize.width + args.gapX);
      }
    };

    await placeBand(args.managementProcessIds, "management");
    await placeBand(args.coreProcessIds ?? [], "core");
    await placeBand(args.supportProcessIds, "support");
    if (placed.length) {
      notes.push(
        `threeBand placed ${placed.length} band chevron(s) without FLOW (ledning/stöd/coreProcessIds peers).`,
      );
    }
    return { placed, breakdowns, notes };
  }

  /**
   * After the spine is placed: any remaining detail-scope inputs/outputs that
   * are not already on the canvas are stacked under the primary left/right BO
   * (or under a column left/right of the process) with FLOW to L/R edges.
   */
  private async placeExtraScopeIoStacked(args: {
    repositoryId: string;
    modelId: string;
    languageId: string;
    owner?: string;
    group?: string;
    symbolCache: Map<string, string>;
    reserved: Array<{ x: number; y: number; width: number; height: number }>;
    gapY: number;
    placed: Array<{
      title: string;
      kind: string;
      objectType: string;
      symbolId: string;
      vertexId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      detailModelId?: string;
    }>;
  }): Promise<void> {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[\u00AC\u00AD]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const repoConfig = await this.getRepoConfig(args.repositoryId);
    const boSize = this.sizeFor(repoConfig, "businessObject");
    const gapX = 40;

    const spineOrdered = args.placed
      .filter((p) => p.kind === "process" || p.kind === "businessObject")
      .toSorted((a, b) => a.x - b.x || a.y - b.y);

    for (let i = 0; i < spineOrdered.length; i++) {
      const proc = spineOrdered[i]!;
      if (proc.kind !== "process" || !proc.detailModelId) continue;

      const scope = await this.reader.getDetailProcessScope({
        repositoryId: args.repositoryId,
        modelId: proc.detailModelId,
      });

      const leftBo = spineOrdered
        .slice(0, i)
        .findLast((p) => p.kind === "businessObject" && Math.abs(p.y - proc.y) < 60);
      const rightBo = spineOrdered
        .slice(i + 1)
        .find((p) => p.kind === "businessObject" && Math.abs(p.y - proc.y) < 60);

      const already = new Set(
        args.placed
          .filter((p) => p.kind === "businessObject")
          .flatMap((p) => [p.symbolId, norm(p.title)]),
      );

      const placeStacked = async (
        bos: Array<{ title: string; symbolId?: string }>,
        anchor: { x: number; y: number; width: number; height: number },
        role: "input" | "output",
      ) => {
        let stackIndex = 0;
        // If anchor is already a BO on spine, start stacking below it;
        // count how many BOs already share this x column below anchor.
        const colBos = args.placed.filter(
          (p) => p.kind === "businessObject" && Math.abs(p.x - anchor.x) < 8 && p.y >= anchor.y,
        );
        stackIndex = Math.max(0, colBos.length - 1);

        for (const bo of bos) {
          if ((bo.symbolId && already.has(bo.symbolId)) || already.has(norm(bo.title))) {
            continue;
          }
          stackIndex += 1;
          const x = Math.round(anchor.x);
          const y = Math.round(anchor.y + stackIndex * (boSize.height + args.gapY));
          const symbolId =
            bo.symbolId ??
            (await this.resolveOrCreateSymbol({
              repositoryId: args.repositoryId,
              languageId: args.languageId,
              title: bo.title,
              objectType: "businessObject",
              owner: args.owner,
              group: args.group,
              cache: args.symbolCache,
            }));
          const vertex = await this.placeVertex({
            repositoryId: args.repositoryId,
            modelId: args.modelId,
            symbolId,
            languageId: args.languageId,
            title: bo.title,
            objectType: "businessObject",
            x,
            y,
            width: boSize.width,
            height: boSize.height,
            reserved: args.reserved,
          });
          const vertexId = String(vertex.uuid);
          args.placed.push({
            title: bo.title,
            kind: "businessObject",
            objectType: "businessObject",
            symbolId,
            vertexId,
            x: vertex.x ?? x,
            y: vertex.y ?? y,
            width: boSize.width,
            height: boSize.height,
          });
          already.add(symbolId);
          already.add(norm(bo.title));
          if (role === "input") {
            await this.createCanvasEdge({
              repositoryId: args.repositoryId,
              modelId: args.modelId,
              fromVertexId: vertexId,
              toVertexId: proc.vertexId,
              edgeType: "flow",
              languageId: args.languageId,
            });
          } else {
            await this.createCanvasEdge({
              repositoryId: args.repositoryId,
              modelId: args.modelId,
              fromVertexId: proc.vertexId,
              toVertexId: vertexId,
              edgeType: "flow",
              languageId: args.languageId,
            });
          }
        }
      };

      const inputAnchor = leftBo ?? {
        x: Math.round(proc.x - gapX - boSize.width),
        y: proc.y,
        width: boSize.width,
        height: boSize.height,
      };
      const outputAnchor = rightBo ?? {
        x: Math.round(proc.x + proc.width + gapX),
        y: proc.y,
        width: boSize.width,
        height: boSize.height,
      };

      // Skip the primary already on spine (matched by left/right neighbor)
      const extraInputs = scope.inputs.filter((inp) => {
        if (
          leftBo &&
          (leftBo.symbolId === inp.symbolId || norm(leftBo.title) === norm(inp.title))
        ) {
          return false;
        }
        return true;
      });
      // Primary outputs already on spine; stack remaining primary extras + branch secondaryOutputs
      const allOut = [...scope.outputs, ...(scope.secondaryOutputs ?? [])];
      const extraOutputs = allOut.filter((out) => {
        if (
          rightBo &&
          (rightBo.symbolId === out.symbolId || norm(rightBo.title) === norm(out.title))
        ) {
          return false;
        }
        return true;
      });

      await placeStacked(extraInputs, inputAnchor, "input");
      await placeStacked(extraOutputs, outputAnchor, "output");
    }
  }

  /** Normalize edge type aliases to API UPPER_SNAKE values. */
  private toApiEdgeType(edgeType: string): string {
    const key = edgeType
      .trim()
      .toLowerCase()
      .replace(/[_\s-]/g, "");
    const map: Record<string, string> = {
      flow: "FLOW",
      raciresponsible: "RACI_RESPONSIBLE",
      responsible: "RACI_RESPONSIBLE",
      controls: "CONTROLS",
      control: "CONTROLS",
      isusedby: "IS_USED_BY",
      usedby: "IS_USED_BY",
      isfollowedby: "IS_FOLLOWED_BY",
      followedby: "IS_FOLLOWED_BY",
    };
    if (map[key]) return map[key];
    if (edgeType.includes("_")) return edgeType.toUpperCase();
    return edgeType.toUpperCase();
  }

  private boxCenter(b: { x?: number; y?: number; width?: number; height?: number }): {
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

  private isProcessObjectType(objectType?: string): boolean {
    const t = (objectType ?? "").toLowerCase().replace(/[\s_-]/g, "");
    return t === "process" || t === "processmodel";
  }

  private isActivityObjectType(objectType?: string): boolean {
    const t = (objectType ?? "").toLowerCase().replace(/[\s_-]/g, "");
    return t === "activity";
  }

  /** FLOW spine types that must use left-in / right-out (never top/bottom). */
  private isFlowLeftRightType(objectType?: string): boolean {
    return this.isProcessObjectType(objectType) || this.isActivityObjectType(objectType);
  }

  private isFlowEdgeType(edgeType?: string): boolean {
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
  private borderAttachment(
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
  private flowLeftAttach(box: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    objectType?: string;
  }): { x: number; y: number; side: "left" } {
    const x = box.x ?? 0;
    const y = box.y ?? 0;
    const w = box.width ?? DEFAULT_WIDTH;
    const h = box.height ?? DEFAULT_HEIGHT;
    const inset = this.isProcessObjectType(box.objectType) ? Math.floor(w * PROCESS_EDGE_INSET) : 0;
    return {
      x: x + inset,
      y: y + Math.floor(h / 2),
      side: "left",
    };
  }

  /** FLOW outgoing attach on right edge (no inset — matches MT). */
  private flowRightAttach(box: { x?: number; y?: number; width?: number; height?: number }): {
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
  private routeOrthogonal(
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
  private orthogonalPointsFlowLeftRight(
    from: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      objectType?: string;
    },
    to: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      objectType?: string;
    },
  ): Array<{ x: number; y: number }> {
    const fromForced = this.isFlowLeftRightType(from.objectType);
    const toForced = this.isFlowLeftRightType(to.objectType);
    // When either end is process/activity, both use left-in / right-out so
    // BO↔activity and side branches stay off top/bottom of the activity.
    const forceBoth = fromForced || toForced;
    const fromCenter = this.boxCenter(from);
    const toCenter = this.boxCenter(to);

    const p0 = forceBoth ? this.flowRightAttach(from) : this.borderAttachment(from, toCenter);
    const pN = forceBoth ? this.flowLeftAttach(to) : this.borderAttachment(to, fromCenter);

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

    return this.routeOrthogonal(p0, pN, opts);
  }

  /**
   * Orthogonal polyline with endpoints on symbol borders (not centers).
   * FLOW on process/activity: left-in / right-out (never top/bottom).
   * Non-FLOW (RACI/CONTROLS/IS_USED_BY): stacked symbols use top↔bottom.
   */
  private orthogonalPoints(
    from: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      objectType?: string;
    },
    to: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      objectType?: string;
    },
    edgeType?: string,
  ): Array<{ x: number; y: number }> {
    const isFlow = !edgeType || this.isFlowEdgeType(edgeType);
    if (
      isFlow &&
      (this.isFlowLeftRightType(from.objectType) || this.isFlowLeftRightType(to.objectType))
    ) {
      return this.orthogonalPointsFlowLeftRight(from, to);
    }

    const fy = from.y ?? 0;
    const fh = from.height ?? DEFAULT_HEIGHT;
    const ty = to.y ?? 0;
    const th = to.height ?? DEFAULT_HEIGHT;
    const fromCenter = this.boxCenter(from);
    const toCenter = this.boxCenter(to);

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
      p0 = this.borderAttachment(from, toCenter);
      pN = this.borderAttachment(to, fromCenter);
    }

    return this.routeOrthogonal(p0, pN);
  }

  /** @see layoutBottomSatellites in satellite-layout.ts */
  private layoutBottomSatellites(
    args: Parameters<typeof layoutBottomSatellites>[0],
  ): Map<string, { x: number; y: number }> {
    return layoutBottomSatellites(args);
  }

  /**
   * Pack satellites along one side of an activity without overlap.
   */
  private packAroundActivity(args: {
    activity: { x: number; y: number; width: number; height: number };
    side: "top" | "bottom" | "left" | "right";
    items: Array<{ width: number; height: number }>;
    gap: number;
  }): Array<{ x: number; y: number }> {
    const { activity, side, items, gap } = args;
    if (items.length === 0) {
      return [];
    }
    if (side === "bottom" || side === "top") {
      const totalW = items.reduce((s, it) => s + it.width, 0) + gap * (items.length - 1);
      let x = activity.x + Math.floor(activity.width / 2) - Math.floor(totalW / 2);
      const maxH = Math.max(...items.map((it) => it.height));
      const y = side === "bottom" ? activity.y + activity.height + gap : activity.y - gap - maxH;
      return items.map((it) => {
        const pos = {
          x: Math.round(x),
          y: side === "bottom" ? Math.round(y) : Math.round(activity.y - gap - it.height),
        };
        x += it.width + gap;
        return pos;
      });
    }
    // left / right
    const totalH = items.reduce((s, it) => s + it.height, 0) + gap * (items.length - 1);
    let y = activity.y + Math.floor(activity.height / 2) - Math.floor(totalH / 2);
    const maxW = Math.max(...items.map((it) => it.width));
    return items.map((it) => {
      const pos = {
        x:
          side === "right"
            ? Math.round(activity.x + activity.width + gap)
            : Math.round(activity.x - gap - it.width),
        y: Math.round(y),
      };
      void maxW;
      y += it.height + gap;
      return pos;
    });
  }

  async createCanvasEdge(args: {
    repositoryId: string;
    modelId: string;
    fromVertexId: string;
    toVertexId: string;
    edgeType: string;
    languageId: string;
    /** Edge label text (e.g. Ja/Nej on gateway branches). */
    label?: string;
  }) {
    const edgeType = this.toApiEdgeType(args.edgeType);
    const canvas = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    })) as {
      vertices?: Array<{
        uuid?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        objectType?: string;
      }>;
    };
    const from = (canvas.vertices ?? []).find((v) => v.uuid === args.fromVertexId);
    const to = (canvas.vertices ?? []).find((v) => v.uuid === args.toVertexId);
    const points = this.orthogonalPoints(from ?? {}, to ?? {}, edgeType);
    const midX = Math.floor(((points[0]?.x ?? 0) + (points[points.length - 1]?.x ?? 0)) / 2);
    const midY = Math.floor(((points[0]?.y ?? 0) + (points[points.length - 1]?.y ?? 0)) / 2) - 10;
    const labelText = (args.label ?? "").trim();
    const labelWidth = Math.max(40, Math.min(120, Math.ceil(labelText.length * 6) + 12));
    const edgeLabelBase = {
      title: labelText,
      rawTitle: labelText,
      x: midX - Math.floor(labelWidth / 2),
      y: midY,
      width: labelWidth,
      height: 20,
    };
    // Mirror label to every repo language. Default omits `translated`; all others get
    // translated:true so Ja/Nej (and other edge texts) do not leave GUI globes ON.
    const defLang = await this.defaultLanguageId(args.repositoryId);
    const langIds = await this.languageIds(args.repositoryId);
    const labels: Record<string, Record<string, unknown>> = {};
    const ids =
      langIds.length > 0
        ? langIds
        : [args.languageId, defLang].filter((id): id is string => Boolean(id));
    for (const langId of new Set(ids)) {
      labels[langId] =
        defLang && langId === defLang
          ? { ...edgeLabelBase }
          : { ...edgeLabelBase, translated: true };
    }

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
        edgeType,
        points,
        labels,
      },
    });
    return {
      data: edge,
      methodologyNotes: [
        `Created canvas edge type=${edgeType}${labelText ? ` label="${labelText}"` : ""}. Common types: FLOW, RACI_RESPONSIBLE, CONTROLS, IS_USED_BY, IS_FOLLOWED_BY.`,
        ...(this.isFlowEdgeType(edgeType)
          ? ["FLOW on process/activity: enter left edge, leave right edge (never top/bottom)."]
          : []),
      ],
      nextSuggestedTools: ["get_process_flow", "describe_process", "review_process_model"],
    };
  }

  /**
   * Move one or more canvas vertices via PATCH /canvas (API has no per-vertex PATCH).
   * Agent supplies vertexId + x/y; width/height/zOrder/breakdowns are filled from current state.
   *
   * Attached edges MUST be re-routed in the **same** PATCH as the vertex move. Updating
   * vertices alone (or edges alone against the old position) yields HTTP 400:
   * "Control point end must lie within the to-vertex bounds".
   */
  async moveCanvasVertices(args: {
    repositoryId: string;
    modelId: string;
    vertices: Array<{
      vertexId: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
    }>;
    /**
     * Kept for compatibility. Attached edges are always re-routed in the same PATCH
     * as the move (2c8 rejects vertex-only patches when control points go out of bounds).
     */
    reorthogonalizeEdges?: boolean;
  }) {
    if (!args.vertices.length) {
      throw new Error("move_canvas_vertices requires at least one vertex");
    }
    type CanvasVert = {
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
    type CanvasEdge = {
      uuid?: string;
      fromVertex?: string;
      toVertex?: string;
      edgeType?: string;
      points?: Array<{ x?: number; y?: number }>;
      breakdowns?: unknown[];
      labels?: Record<string, { x?: number; y?: number; width?: number; height?: number }>;
    };
    const canvas = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    })) as {
      vertices?: CanvasVert[];
      edges?: CanvasEdge[];
    };

    const objectTypeOf = (v: CanvasVert): string | undefined => {
      if (v.objectType) return v.objectType;
      if (v.symbol && typeof v.symbol === "object" && v.symbol.objectType) {
        return v.symbol.objectType;
      }
      return undefined;
    };

    const byId = new Map((canvas.vertices ?? []).filter((v) => v.uuid).map((v) => [v.uuid!, v]));
    const patchVertices: Array<Record<string, unknown>> = [];
    const missing: string[] = [];
    const movedIds = new Set<string>();

    // Post-move geometry for routing (unmoved verts keep current box)
    const nextGeom = new Map<
      string,
      { x: number; y: number; width: number; height: number; objectType?: string }
    >();
    for (const [id, cur] of byId) {
      nextGeom.set(id, {
        x: cur.x ?? 0,
        y: cur.y ?? 0,
        width: cur.width ?? DEFAULT_WIDTH,
        height: cur.height ?? DEFAULT_HEIGHT,
        objectType: objectTypeOf(cur),
      });
    }

    for (const mv of args.vertices) {
      const cur = byId.get(mv.vertexId);
      if (!cur) {
        missing.push(mv.vertexId);
        continue;
      }
      const width = mv.width ?? cur.width ?? DEFAULT_WIDTH;
      const height = mv.height ?? cur.height ?? DEFAULT_HEIGHT;
      const x = Math.round(mv.x);
      const y = Math.round(mv.y);
      patchVertices.push({
        uuid: mv.vertexId,
        x,
        y,
        width,
        height,
        zOrder: cur.zOrder ?? 0,
        breakdowns: cur.breakdowns ?? [],
      });
      movedIds.add(mv.vertexId);
      nextGeom.set(mv.vertexId, {
        x,
        y,
        width,
        height,
        objectType: objectTypeOf(cur),
      });
    }
    if (missing.length) {
      throw new Error(`Unknown vertexId(s) on canvas: ${missing.join(", ")}`);
    }

    const attached = (canvas.edges ?? []).filter(
      (e) =>
        e.uuid &&
        ((e.fromVertex && movedIds.has(e.fromVertex)) || (e.toVertex && movedIds.has(e.toVertex))),
    );

    // Always re-route attached edges in the same PATCH — vertex-only / edge-only updates 400.
    const patchEdges: Array<Record<string, unknown>> = [];
    for (const e of attached) {
      if (!e.uuid || !e.fromVertex || !e.toVertex) continue;
      const from = nextGeom.get(e.fromVertex);
      const to = nextGeom.get(e.toVertex);
      if (!from || !to) continue;
      const points = this.orthogonalPoints(from, to, e.edgeType ?? "FLOW").map((p) => ({
        x: Math.round(p.x),
        y: Math.round(p.y),
      }));
      let labels = e.labels as Record<string, Record<string, unknown>> | undefined;
      if (labels && points.length >= 2) {
        const midX = Math.floor(((points[0]?.x ?? 0) + (points[points.length - 1]?.x ?? 0)) / 2);
        const midY =
          Math.floor(((points[0]?.y ?? 0) + (points[points.length - 1]?.y ?? 0)) / 2) - 10;
        const nextLabels: Record<string, unknown> = {};
        for (const [lang, lab] of Object.entries(labels)) {
          const w = typeof lab.width === "number" ? lab.width : 40;
          const h = typeof lab.height === "number" ? lab.height : 20;
          nextLabels[lang] = {
            ...lab,
            x: midX - Math.floor(w / 2),
            y: midY,
            width: w,
            height: h,
          };
        }
        labels = nextLabels as typeof labels;
      }
      patchEdges.push({
        uuid: e.uuid,
        points,
        ...(labels ? { labels } : {}),
        breakdowns: e.breakdowns ?? [],
      });
    }

    const patchBody: {
      vertices: Array<Record<string, unknown>>;
      edges?: Array<Record<string, unknown>>;
    } = { vertices: patchVertices };
    if (patchEdges.length) {
      patchBody.edges = patchEdges;
    }

    try {
      await this.client.request({
        method: "PATCH",
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
        pathParams: {
          repositoryId: args.repositoryId,
          modelId: args.modelId,
        },
        body: patchBody,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Fallback: delete attached edges → move → recreate (same strategy as retargetVertexSymbol)
      if (!attached.length || !/Control point|400/.test(msg)) {
        throw new Error(withControlPointBoundsHint(msg, "move"), { cause: err });
      }
      try {
        const edgeSnapshots = attached.filter((e) => e.uuid && e.fromVertex && e.toVertex);
        await this.deleteCanvasEdges({
          repositoryId: args.repositoryId,
          modelId: args.modelId,
          edgeIds: edgeSnapshots.map((e) => e.uuid!),
        });
        await this.client.request({
          method: "PATCH",
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
          pathParams: {
            repositoryId: args.repositoryId,
            modelId: args.modelId,
          },
          body: { vertices: patchVertices },
        });
        const defLang = await this.defaultLanguageId(args.repositoryId);
        const languageId = defLang ?? Object.keys(edgeSnapshots[0]?.labels ?? {})[0];
        if (!languageId) {
          throw new Error(
            withControlPointBoundsHint(
              `Move fell back to delete/recreate edges but no languageId is available. Original error: ${msg}`,
              "move",
            ),
          );
        }
        const recreated: string[] = [];
        for (const e of edgeSnapshots) {
          const labelEntry = e.labels?.[languageId] as { title?: string } | undefined;
          const created = await this.createCanvasEdge({
            repositoryId: args.repositoryId,
            modelId: args.modelId,
            fromVertexId: e.fromVertex!,
            toVertexId: e.toVertex!,
            edgeType: e.edgeType ?? "FLOW",
            languageId,
            label: labelEntry?.title?.trim() || undefined,
          });
          const id =
            created.data && typeof created.data === "object" && "uuid" in (created.data as object)
              ? String((created.data as { uuid?: string }).uuid ?? "")
              : "";
          if (id) recreated.push(id);
        }
        return {
          data: {
            moved: patchVertices.map((v) => v.uuid),
            count: patchVertices.length,
            reorthogonalized: recreated,
            fallback: "delete-edges-move-recreate",
          },
          methodologyNotes: [
            "Combined vertex+edge PATCH failed; automatically fell back to delete edges → move → recreate.",
            "After layout fixes: review_process_model.",
          ],
          nextSuggestedTools: ["review_process_model", "describe_process", "delete_canvas_edge"],
        };
      } catch (fallbackErr) {
        const fb = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        throw new Error(
          withControlPointBoundsHint(
            `move_canvas_vertices failed after combined PATCH and delete→move→recreate fallback.\n` +
              `First error: ${msg}\nFallback error: ${fb}`,
            "move",
          ),
          { cause: fallbackErr },
        );
      }
    }

    return {
      data: {
        moved: patchVertices.map((v) => v.uuid),
        count: patchVertices.length,
        reorthogonalized: patchEdges.map((e) => e.uuid),
      },
      methodologyNotes: [
        "Moved vertices via PATCH /canvas with attached edges re-routed in the same request.",
        "Do not move then update_canvas_edges separately — 2c8 rejects stale control points.",
        "After layout fixes: review_process_model.",
      ],
      nextSuggestedTools: ["review_process_model", "describe_process"],
    };
  }

  /**
   * Replace the symbol on a canvas vertex while keeping position and edges.
   * API treats vertex.symbol as read-only on PATCH — implement via
   * delete edges → delete vertex → create vertex → recreate edges.
   */
  async retargetVertexSymbol(args: {
    repositoryId: string;
    modelId: string;
    vertexId: string;
    newSymbolId: string;
    languageId: string;
  }) {
    const canvas = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    })) as {
      vertices?: Array<{
        uuid?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        zOrder?: number;
        symbol?: string | { uuid?: string };
        breakdowns?: unknown[];
      }>;
      edges?: Array<{
        uuid?: string;
        edgeType?: string;
        fromVertex?: string;
        toVertex?: string;
        labels?: Record<string, { title?: string }>;
      }>;
    };

    const vertex = (canvas.vertices ?? []).find((v) => v.uuid === args.vertexId);
    if (!vertex) {
      throw new Error(`Unknown vertexId on canvas: ${args.vertexId}`);
    }
    const oldSymbol = typeof vertex.symbol === "string" ? vertex.symbol : vertex.symbol?.uuid;

    const attached = (canvas.edges ?? []).filter(
      (e) => e.fromVertex === args.vertexId || e.toVertex === args.vertexId,
    );

    if (attached.length) {
      await this.deleteCanvasEdges({
        repositoryId: args.repositoryId,
        modelId: args.modelId,
        edgeIds: attached.map((e) => e.uuid!).filter(Boolean),
      });
    }

    await this.client.request({
      method: "DELETE",
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas/vertices/{vertexId}",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
        vertexId: args.vertexId,
      },
    });

    // POST /canvas/vertices requires label bounds (default language included).
    // Raw body without labels → 400 "Label bounds must be provided".
    const newSymbol = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
      pathParams: {
        repositoryId: args.repositoryId,
        symbolId: args.newSymbolId,
      },
      query: { projection: "ALL" },
    })) as {
      objectType?: string;
      titles?: Record<string, { title?: string }>;
    };
    const objectType = newSymbol.objectType ?? "role";
    const title =
      pickTitle(newSymbol.titles as never, args.languageId) ??
      pickTitle(newSymbol.titles as never) ??
      "Symbol";
    const repoConfig = await this.getRepoConfig(args.repositoryId);
    const preferred = this.sizeFor(repoConfig, objectType);
    const width = vertex.width ?? preferred.width;
    const height = vertex.height ?? preferred.height;

    const created = await this.placeVertex({
      repositoryId: args.repositoryId,
      modelId: args.modelId,
      symbolId: args.newSymbolId,
      languageId: args.languageId,
      title,
      objectType,
      x: vertex.x ?? 0,
      y: vertex.y ?? 0,
      width,
      height,
      allowOverlap: true,
    });

    const newVertexId = created.uuid;
    if (!newVertexId) {
      throw new Error("retarget_vertex_symbol: create vertex returned no uuid");
    }

    const recreated: string[] = [];
    for (const e of attached) {
      const fromVertex = e.fromVertex === args.vertexId ? newVertexId : e.fromVertex;
      const toVertex = e.toVertex === args.vertexId ? newVertexId : e.toVertex;
      if (!fromVertex || !toVertex || !e.edgeType) continue;
      const label = Object.values(e.labels ?? {}).find((l) => l.title?.trim())?.title ?? undefined;
      const edge = await this.createCanvasEdge({
        repositoryId: args.repositoryId,
        modelId: args.modelId,
        fromVertexId: fromVertex,
        toVertexId: toVertex,
        edgeType: e.edgeType,
        languageId: args.languageId,
        label,
      });
      const eid = (edge.data as { uuid?: string })?.uuid;
      if (eid) recreated.push(eid);
    }

    return {
      data: {
        oldVertexId: args.vertexId,
        newVertexId,
        oldSymbolId: oldSymbol,
        newSymbolId: args.newSymbolId,
        edgesRecreated: recreated.length,
        edgeIds: recreated,
      },
      methodologyNotes: [
        "Vertex.symbol is read-only on PATCH /canvas — retarget deletes+recreates the vertex and its edges.",
        "Old symbol UUID remains in the repository (search_symbols / reuse_symbol).",
        "Prefer this over manual delete_canvas_edge + delete_canvas_vertex + reuse_symbol.",
      ],
      nextSuggestedTools: ["review_process_model", "find_symbol_usage"],
    };
  }

  /**
   * Update edge routing points (and optional label bounds) via PATCH /canvas.
   */
  async updateCanvasEdges(args: {
    repositoryId: string;
    modelId: string;
    edges: Array<{
      edgeId: string;
      points?: Array<{ x: number; y: number }>;
      /** Rebuild orthogonal route from current from/to vertices. */
      reorthogonalize?: boolean;
    }>;
  }) {
    if (!args.edges.length) {
      throw new Error("update_canvas_edges requires at least one edge");
    }
    const canvas = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    })) as {
      vertices?: Array<{
        uuid?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        objectType?: string;
      }>;
      edges?: Array<{
        uuid?: string;
        fromVertex?: string;
        toVertex?: string;
        edgeType?: string;
        points?: Array<{ x?: number; y?: number }>;
        breakdowns?: unknown[];
        labels?: Record<string, { x?: number; y?: number; width?: number; height?: number }>;
      }>;
    };
    const verts = new Map((canvas.vertices ?? []).filter((v) => v.uuid).map((v) => [v.uuid!, v]));
    const edgesById = new Map((canvas.edges ?? []).filter((e) => e.uuid).map((e) => [e.uuid!, e]));
    const patchEdges: Array<Record<string, unknown>> = [];
    const missing: string[] = [];
    for (const upd of args.edges) {
      const cur = edgesById.get(upd.edgeId);
      if (!cur) {
        missing.push(upd.edgeId);
        continue;
      }
      let points = upd.points;
      if (upd.reorthogonalize || !points?.length) {
        const from = verts.get(cur.fromVertex ?? "");
        const to = verts.get(cur.toVertex ?? "");
        points = this.orthogonalPoints(from ?? {}, to ?? {}, cur.edgeType ?? "FLOW");
      }
      const rounded = points.map((p) => ({
        x: Math.round(p.x),
        y: Math.round(p.y),
      }));
      // Keep existing label boxes but nudge to mid of new route when reorthogonalizing
      let labels = cur.labels;
      if (upd.reorthogonalize && labels && rounded.length >= 2) {
        const midX = Math.floor(((rounded[0]?.x ?? 0) + (rounded[rounded.length - 1]?.x ?? 0)) / 2);
        const midY =
          Math.floor(((rounded[0]?.y ?? 0) + (rounded[rounded.length - 1]?.y ?? 0)) / 2) - 10;
        const nextLabels: Record<string, unknown> = {};
        for (const [lang, lab] of Object.entries(labels)) {
          const w = lab.width ?? 40;
          const h = lab.height ?? 20;
          nextLabels[lang] = {
            ...lab,
            x: midX - Math.floor(w / 2),
            y: midY,
            width: w,
            height: h,
          };
        }
        labels = nextLabels as typeof labels;
      }
      patchEdges.push({
        uuid: upd.edgeId,
        points: rounded,
        ...(labels ? { labels } : {}),
        breakdowns: cur.breakdowns ?? [],
      });
    }
    if (missing.length) {
      throw new Error(`Unknown edgeId(s) on canvas: ${missing.join(", ")}`);
    }
    try {
      await this.client.request({
        method: "PATCH",
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
        pathParams: {
          repositoryId: args.repositoryId,
          modelId: args.modelId,
        },
        body: { edges: patchEdges },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(withControlPointBoundsHint(msg, "update_edges"), { cause: err });
    }
    return {
      data: { updated: patchEdges.map((e) => e.uuid), count: patchEdges.length },
      methodologyNotes: [
        "Updated edge routes via PATCH /canvas. To move symbols, use move_canvas_vertices (not edges-then-move).",
      ],
      nextSuggestedTools: ["review_process_model", "describe_process", "move_canvas_vertices"],
    };
  }

  /** Delete canvas edge(s). Corrective edit — does not require TWO_C8_ALLOW_DELETES. */
  async deleteCanvasEdges(args: { repositoryId: string; modelId: string; edgeIds: string[] }) {
    if (!args.edgeIds.length) {
      throw new Error("delete_canvas_edge requires edgeIds");
    }
    const deleted: string[] = [];
    const errors: Array<{ edgeId: string; error: string }> = [];
    for (const edgeId of args.edgeIds) {
      try {
        await this.client.request({
          method: "DELETE",
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas/edges/{edgeId}",
          pathParams: {
            repositoryId: args.repositoryId,
            modelId: args.modelId,
            edgeId,
          },
        });
        deleted.push(edgeId);
      } catch (err) {
        errors.push({
          edgeId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      data: { deleted, errors, okCount: deleted.length },
      methodologyNotes: [
        "Deleted canvas edge(s). Use after review flags activity→activity / BO→BO / wrong RACI.",
        "EdgeId comes from describe_process / get_process_flow outgoing[].edgeId.",
      ],
      nextSuggestedTools: ["review_process_model", "describe_process"],
    };
  }

  /**
   * Remove vertex from canvas (symbol remains in repository).
   * Connected edges must be deleted first or the API may fail.
   */
  async deleteCanvasVertices(args: { repositoryId: string; modelId: string; vertexIds: string[] }) {
    if (!args.vertexIds.length) {
      throw new Error("delete_canvas_vertex requires vertexIds");
    }
    const deleted: string[] = [];
    const errors: Array<{ vertexId: string; error: string }> = [];
    for (const vertexId of args.vertexIds) {
      try {
        await this.client.request({
          method: "DELETE",
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas/vertices/{vertexId}",
          pathParams: {
            repositoryId: args.repositoryId,
            modelId: args.modelId,
            vertexId,
          },
        });
        deleted.push(vertexId);
      } catch (err) {
        errors.push({
          vertexId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      data: { deleted, errors, okCount: deleted.length },
      methodologyNotes: [
        "Removed vertex from canvas only — symbol UUID remains reusable via search_symbols / reuse_symbol.",
        "Delete attached edges first if DELETE fails.",
      ],
      nextSuggestedTools: ["review_process_model", "search_symbols"],
    };
  }

  async createRepository(args: {
    name: string;
    languages?: Array<{ name: string; locale: string; default?: boolean }>;
    template?: boolean;
    owner?: string;
    directory?: string;
    colorScheme?: string;
    body?: Record<string, unknown>;
  }) {
    const languages = args.languages ?? [
      {
        name: "Svenska",
        locale: "sv_SE",
        default: true,
      },
    ];
    const created = await this.client.request({
      method: "POST",
      path: "/api/v1/repositories",
      body: {
        name: args.name,
        template: args.template ?? false,
        languages,
        ...(args.owner ? { owner: args.owner } : {}),
        ...(args.directory ? { directory: args.directory } : {}),
        ...(args.colorScheme ? { colorScheme: args.colorScheme } : {}),
        ...args.body,
      },
    });
    return {
      data: created,
      methodologyNotes: [
        "Repository created. List languages via list_languages before writing titles.",
      ],
      nextSuggestedTools: [
        "list_languages",
        "list_allowed_types",
        "propose_model_from_text",
        "apply_model_proposal",
      ],
    };
  }

  /**
   * Anchor for a vägval side-branch activity: prefer the main-path activity
   * after the diamond (Ja continuation on spine), else the deciding activity
   * before the diamond. Falls back to the gateway itself.
   */
  private sideBranchAnchorPlacement(args: {
    gatewayTitle: string;
    chain: Array<{ kind: string; title: string }>;
    vertexByTitle: Map<
      string,
      { vertexId: string; x: number; y: number; width: number; height: number; kind: string }
    >;
    gatewayPlacement: { x: number; y: number; width: number; height: number };
  }): { x: number; y: number; width: number; height: number } {
    const gKey = args.gatewayTitle.toLowerCase();
    const gi = args.chain.findIndex((n) => n.title.toLowerCase() === gKey);
    const pickActivity = (start: number, dir: 1 | -1) => {
      for (let i = start; i >= 0 && i < args.chain.length; i += dir) {
        const n = args.chain[i]!;
        if (dir === 1 && (n.kind === "gateway" || n.kind === "and") && i !== gi) {
          break;
        }
        if (n.kind !== "activity") continue;
        const v = args.vertexByTitle.get(n.title.toLowerCase());
        if (v) return v;
      }
      return undefined;
    };
    if (gi >= 0) {
      const after = pickActivity(gi + 1, 1);
      if (after) return after;
      const before = pickActivity(gi - 1, -1);
      if (before) return before;
    }
    return args.gatewayPlacement;
  }

  /**
   * Resolve or create a symbol by title (reuse-first), return symbolId.
   * preferredSymbolId / cache (reuseHints) win over search+create.
   */
  private async resolveOrCreateSymbol(args: {
    repositoryId: string;
    languageId: string;
    title: string;
    objectType: string;
    owner?: string;
    group?: string;
    cache: Map<string, string>;
    preferredSymbolId?: string;
  }): Promise<string> {
    const apiType = toApiObjectType(args.objectType);
    const plainTitle = stripSoftBreaks(args.title).trim();
    const rawTitle = applySoftBreaks(args.title);
    const cacheKey = `${apiType}::${plainTitle.toLowerCase()}`;
    const preferred =
      args.preferredSymbolId ??
      args.cache.get(cacheKey) ??
      args.cache.get(plainTitle.toLowerCase());
    if (preferred) {
      args.cache.set(cacheKey, preferred);
      return preferred;
    }

    const search = await this.reader.searchSymbols({
      repositoryId: args.repositoryId,
      query: plainTitle,
      objectType: apiType,
      maxResults: "20",
    });
    const exact = (search.symbols as Array<{ uuid?: string; title?: string }>).find(
      (s) =>
        stripSoftBreaks(s.title ?? "")
          .trim()
          .toLowerCase() === plainTitle.toLowerCase(),
    );
    if (exact?.uuid) {
      args.cache.set(cacheKey, exact.uuid);
      return exact.uuid;
    }

    const alt = alternativeSymbolFor(args.objectType);
    const titles = await this.titlesForLanguages(
      args.repositoryId,
      args.languageId,
      plainTitle,
      // Soft hyphen (UI "¬") so 2c8 wraps compound labels compactly
      rawTitle,
    );
    const symbol = (await this.client.request({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/symbols",
      pathParams: { repositoryId: args.repositoryId },
      body: {
        objectType: apiType,
        ...(alt ? { alternativeSymbol: alt } : {}),
        titles,
        ...(args.owner ? { owner: args.owner } : {}),
        ...(args.group ? { group: args.group } : {}),
      },
    })) as { uuid?: string };
    if (!symbol.uuid) {
      throw new Error(`Failed to create symbol '${plainTitle}' (${apiType})`);
    }
    args.cache.set(cacheKey, symbol.uuid);
    return symbol.uuid;
  }

  private boxesOverlap(
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
  private findFreePlacement(
    occupied: Array<{ x: number; y: number; width: number; height: number }>,
    x: number,
    y: number,
    width: number,
    height: number,
    stepX = 24,
    stepY = 24,
  ): { x: number; y: number; shifted: boolean } {
    const collides = (cx: number, cy: number) =>
      occupied.some((o) => this.boxesOverlap({ x: cx, y: cy, width, height }, o));
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
  private groupSpineNodes<T extends { kind: string }>(
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
  private findFreePlacementOnSpine(
    occupied: Array<{ x: number; y: number; width: number; height: number }>,
    x: number,
    y: number,
    width: number,
    height: number,
    stepX = 24,
  ): { x: number; y: number; shifted: boolean } {
    const collides = (cx: number) =>
      occupied.some((o) => this.boxesOverlap({ x: cx, y: Math.round(y), width, height }, o));
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

  private async placeVertex(args: {
    repositoryId: string;
    modelId: string;
    symbolId: string;
    languageId: string;
    title: string;
    objectType: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    /**
     * Side of this symbol where the primary relation attaches.
     * Outside labels are placed on the opposite side.
     */
    edgeAttachSide?: "top" | "bottom" | "left" | "right";
    outsideLabelSide?: OutsideLabelSide;
    /**
     * In-batch boxes not yet on the canvas. Mutated when a free slot is taken.
     */
    reserved?: Array<{ x: number; y: number; width: number; height: number }>;
    /** Skip overlap nudge (rare; default false). */
    allowOverlap?: boolean;
    /** Keep Y fixed (FLOW spine); only nudge X on collision. */
    spineAlign?: boolean;
  }): Promise<{ uuid?: string; x?: number; y?: number; width?: number; height?: number }> {
    const width = args.width ?? DEFAULT_WIDTH;
    const height = args.height ?? DEFAULT_HEIGHT;

    let x = Math.round(args.x);
    let y = Math.round(args.y);
    if (!args.allowOverlap) {
      const canvas = (await this.client.request({
        path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
        pathParams: {
          repositoryId: args.repositoryId,
          modelId: args.modelId,
        },
      })) as {
        vertices?: Array<{
          x?: number;
          y?: number;
          width?: number;
          height?: number;
        }>;
      };
      const occupied = [
        ...(canvas.vertices ?? []).map((v) => ({
          x: v.x ?? 0,
          y: v.y ?? 0,
          width: v.width ?? DEFAULT_WIDTH,
          height: v.height ?? DEFAULT_HEIGHT,
        })),
        ...(args.reserved ?? []),
      ];
      const free = args.spineAlign
        ? this.findFreePlacementOnSpine(occupied, x, y, width, height)
        : this.findFreePlacement(occupied, x, y, width, height);
      x = free.x;
      y = free.y;
      args.reserved?.push({ x, y, width, height });
    } else {
      args.reserved?.push({ x, y, width, height });
    }

    const outsideLabelSide =
      args.outsideLabelSide ??
      (args.edgeAttachSide ? outsideLabelAwayFromEdge(args.edgeAttachSide) : undefined);
    const { centerLabel, label } = this.labelBounds({
      objectType: args.objectType,
      title: args.title,
      x,
      y,
      width,
      height,
      outsideLabelSide,
    });
    // 2c8 requires bounds for the repo default language even when writing another languageId.
    const labels = await this.labelsForLanguages(args.repositoryId, args.languageId, label);
    return (await this.client.request({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas/vertices",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
      body: {
        x,
        y,
        width,
        height,
        symbol: args.symbolId,
        centerLabel,
        // Bounds required; title comes from the symbol (cannot set label title on create).
        labels,
      },
    })) as { uuid?: string; x?: number; y?: number; width?: number; height?: number };
  }

  /** Best-effort delete of a model we just created when later steps fail. */
  private async rollbackCreatedModel(args: {
    repositoryId: string;
    modelId: string;
  }): Promise<string | undefined> {
    // Draft creates live under the draft alias, not the target repositoryId.
    const deleteRepoId = this.writeMode === "draft" ? "draft" : args.repositoryId;
    try {
      await this.deleteModel({ repositoryId: deleteRepoId, modelId: args.modelId });
      return `Rolled back empty model ${args.modelId} after failed populate (repo=${deleteRepoId}).`;
    } catch (err) {
      return `Failed to roll back model ${args.modelId} (repo=${deleteRepoId}): ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
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
    const proposal = normalizeProposal(args.proposal);
    let modelId = args.modelId;
    let createdThisCall = false;
    const results: unknown[] = [];
    const symbolCache = new Map<string, string>();
    const reserved: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
    const placed: Array<{
      title: string;
      objectType: string;
      symbolId: string;
      vertexId: string;
      kind?: string;
    }> = [];

    if (!modelId) {
      const created = await this.createProcessModel({
        repositoryId: args.repositoryId,
        title: proposal.title,
        languageId: args.languageId,
        modelType: proposal.modelType,
        permissionGroup: args.permissionGroup,
        owner: args.owner,
        group: args.group,
      });
      results.push({ createModel: created });
      modelId =
        (created.data as { uuid?: string })?.uuid ??
        (created.data as { model?: { uuid?: string } })?.model?.uuid;
      createdThisCall = Boolean(modelId);
    }

    if (!modelId) {
      throw new Error(
        "Could not resolve modelId from create_process_model response; pass modelId explicitly.",
      );
    }

    try {
      return await this.applyProposalOntoModel({
        ...args,
        modelId,
        proposal,
        results,
        symbolCache,
        reserved,
        placed,
      });
    } catch (err) {
      if (createdThisCall) {
        const note = await this.rollbackCreatedModel({
          repositoryId: args.repositoryId,
          modelId,
        });
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${msg}${note ? ` (${note})` : ""}`);
      }
      throw err;
    }
  }

  private async applyProposalOntoModel(args: {
    repositoryId: string;
    languageId: string;
    proposal: ModelProposal;
    permissionGroup?: string;
    owner?: string;
    group?: string;
    modelId: string;
    results: unknown[];
    symbolCache: Map<string, string>;
    reserved: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    placed: Array<{
      title: string;
      objectType: string;
      symbolId: string;
      vertexId: string;
      kind?: string;
    }>;
  }) {
    const proposal = args.proposal;
    const modelId = args.modelId;
    const results = args.results;
    const symbolCache = args.symbolCache;
    const reserved = args.reserved;
    const placed = args.placed;

    const chain = proposal.chain ?? [];
    const activityDetails = proposal.activities ?? [];
    const branches = proposal.branches ?? [];
    // Seed cache from reuseHints + chain[].symbolId so handoff BOs are not re-created
    const seedReuse = (title: string, symbolId: string | undefined, objectType?: string) => {
      if (!symbolId) return;
      const plain = stripSoftBreaks(title).trim().toLowerCase();
      symbolCache.set(plain, symbolId);
      if (objectType) {
        const apiType = toApiObjectType(objectType);
        symbolCache.set(`${apiType}::${plain}`, symbolId);
      }
    };
    for (const [title, sid] of Object.entries(proposal.reuseHints ?? {})) {
      seedReuse(title, sid);
    }
    for (const node of chain) {
      seedReuse(node.title, node.symbolId, node.objectType);
    }
    const detailByTitle = new Map(activityDetails.map((a) => [a.title.toLowerCase(), a]));
    const branchLabel = (fromTitle: string, toTitle: string): string | undefined => {
      const hit = branches.find(
        (b) =>
          b.fromTitle.toLowerCase() === fromTitle.toLowerCase() &&
          b.toTitle.toLowerCase() === toTitle.toLowerCase(),
      );
      return hit?.label?.trim() || undefined;
    };
    const repoConfig = await this.getRepoConfig(args.repositoryId);
    const { distance } = this.layoutGaps(repoConfig);

    // Process chevron (top-left)
    const processTitle = proposal.processTitle ?? proposal.title;
    const processSize = this.sizeFor(repoConfig, "process");
    const processSymbolId = await this.resolveOrCreateSymbol({
      repositoryId: args.repositoryId,
      languageId: args.languageId,
      title: processTitle,
      objectType: "process",
      owner: args.owner,
      group: args.group,
      cache: symbolCache,
      preferredSymbolId: proposal.reuseHints?.[processTitle],
    });
    const processVertex = await this.placeVertex({
      repositoryId: args.repositoryId,
      modelId,
      symbolId: processSymbolId,
      languageId: args.languageId,
      title: processTitle,
      objectType: "process",
      x: 20,
      y: 20,
      width: processSize.width,
      height: processSize.height,
      reserved,
    });
    placed.push({
      title: processTitle,
      objectType: "process",
      symbolId: processSymbolId,
      vertexId: String(processVertex.uuid),
      kind: "process",
    });
    results.push({ processChevron: processVertex });

    // FLOW spine — advance by symbol width + quickdraw left margin
    let previousVertexId: string | undefined;
    let previousTitle: string | undefined;
    let previousKind: string | undefined;
    /** BO that must only feed the next gateway (not also the activity after it). */
    let boLockedToGateway: string | undefined;
    let cursorX = SPINE_START_X;
    const activityVertices = new Map<
      string,
      { vertexId: string; x: number; y: number; width: number; height: number }
    >();
    const vertexByTitle = new Map<
      string,
      { vertexId: string; x: number; y: number; width: number; height: number; kind: string }
    >();
    const connectedPairs = new Set<string>();

    const spineY = (kind: string): number => {
      if (kind === "businessObject") return Y_BO;
      if (kind === "gateway" || kind === "and") return Y_GATEWAY;
      return Y_ACTIVITY;
    };

    const stackedUnder = new Map<string, string[]>();
    const spineGroups = this.groupSpineNodes(
      chain.map((n) => ({ ...n, kind: n.kind === "businessObject" ? "businessObject" : n.kind })),
    );
    // groupSpineNodes only groups kind==="businessObject"; other kinds stay as steps
    const gapY = Math.max(distance.bottom, 12);

    const placeChainBo = async (
      node: (typeof chain)[number],
      x: number,
      y: number,
      onSpine: boolean,
    ) => {
      const size = this.sizeFor(repoConfig, node.objectType);
      const symbolId = await this.resolveOrCreateSymbol({
        repositoryId: args.repositoryId,
        languageId: args.languageId,
        title: node.title,
        objectType: node.objectType,
        owner: args.owner,
        group: args.group,
        cache: symbolCache,
        preferredSymbolId: node.symbolId,
      });
      const vertex = await this.placeVertex({
        repositoryId: args.repositoryId,
        modelId,
        symbolId,
        languageId: args.languageId,
        title: node.title,
        objectType: node.objectType,
        x,
        y,
        width: size.width,
        height: size.height,
        reserved,
        spineAlign: onSpine,
      });
      const vertexId = String(vertex.uuid);
      const usedX = vertex.x ?? x;
      const usedY = vertex.y ?? y;
      placed.push({
        title: node.title,
        objectType: node.objectType,
        symbolId,
        vertexId,
        kind: node.kind,
      });
      vertexByTitle.set(node.title.toLowerCase(), {
        vertexId,
        x: usedX,
        y: usedY,
        width: size.width,
        height: size.height,
        kind: node.kind,
      });
      return { vertexId, x: usedX, y: usedY, width: size.width, height: size.height };
    };

    for (const group of spineGroups) {
      if (group.type === "bo-group") {
        const items = group.items as typeof chain;
        const primaryNode = items[0]!;
        const boSize = this.sizeFor(repoConfig, primaryNode.objectType);
        const y = spineY("businessObject");
        const primary = await placeChainBo(primaryNode, cursorX, y, true);

        if (previousVertexId && previousTitle) {
          const label =
            previousKind === "gateway" || previousKind === "and"
              ? branchLabel(previousTitle, primaryNode.title)
              : undefined;
          const edge = await this.createCanvasEdge({
            repositoryId: args.repositoryId,
            modelId,
            fromVertexId: previousVertexId,
            toVertexId: primary.vertexId,
            edgeType: "flow",
            languageId: args.languageId,
            label,
          });
          connectedPairs.add(`${previousTitle.toLowerCase()}→${primaryNode.title.toLowerCase()}`);
          results.push({ flow: edge });
        }

        const stackedIds: string[] = [];
        const prevWasStep =
          previousKind === "activity" ||
          previousKind === "gateway" ||
          previousKind === "and" ||
          previousKind === "process";
        for (let si = 1; si < items.length; si++) {
          const extra = items[si]!;
          const sx = primary.x;
          const sy = Math.round(
            primary.y + primary.height + gapY + (si - 1) * (boSize.height + gapY),
          );
          const stacked = await placeChainBo(extra, sx, sy, false);
          stackedIds.push(stacked.vertexId);
          if (prevWasStep && previousVertexId) {
            await this.createCanvasEdge({
              repositoryId: args.repositoryId,
              modelId,
              fromVertexId: previousVertexId,
              toVertexId: stacked.vertexId,
              edgeType: "flow",
              languageId: args.languageId,
            });
            connectedPairs.add(`${previousTitle!.toLowerCase()}→${extra.title.toLowerCase()}`);
          }
        }
        stackedUnder.set(primary.vertexId, stackedIds);
        previousVertexId = primary.vertexId;
        previousTitle = primaryNode.title;
        previousKind = "businessObject";
        cursorX = primary.x + primary.width + distance.left;
        continue;
      }

      const node = group.item as (typeof chain)[number];
      const size = this.sizeFor(repoConfig, node.objectType);
      const x = cursorX;
      const y = spineY(node.kind);
      const symbolId = await this.resolveOrCreateSymbol({
        repositoryId: args.repositoryId,
        languageId: args.languageId,
        title: node.title,
        objectType: node.objectType,
        owner: args.owner,
        group: args.group,
        cache: symbolCache,
        preferredSymbolId: node.symbolId,
      });
      const vertex = await this.placeVertex({
        repositoryId: args.repositoryId,
        modelId,
        symbolId,
        languageId: args.languageId,
        title: node.title,
        objectType: node.objectType,
        x,
        y,
        width: size.width,
        height: size.height,
        reserved,
        spineAlign: true,
      });
      const vertexId = String(vertex.uuid);
      const usedX = vertex.x ?? x;
      const usedY = vertex.y ?? y;
      placed.push({
        title: node.title,
        objectType: node.objectType,
        symbolId,
        vertexId,
        kind: node.kind,
      });
      vertexByTitle.set(node.title.toLowerCase(), {
        vertexId,
        x: usedX,
        y: usedY,
        width: size.width,
        height: size.height,
        kind: node.kind,
      });

      if (previousVertexId && previousTitle) {
        const label =
          previousKind === "gateway" || previousKind === "and"
            ? branchLabel(previousTitle, node.title)
            : undefined;
        if (previousKind === "businessObject") {
          // BO → gateway locks the BO so we never also fan it to the next activity
          if (node.kind === "gateway" || node.kind === "and") {
            boLockedToGateway = previousVertexId;
          }
          if (node.kind === "activity" && boLockedToGateway === previousVertexId) {
            // Skip BO→activity; value stream goes BO→gateway→…
            results.push({
              flowSkipped: `Avoid BO→${node.title} while BO feeds a vägval`,
            });
          } else {
            const incoming = [previousVertexId, ...(stackedUnder.get(previousVertexId) ?? [])];
            for (const fromId of incoming) {
              const edge = await this.createCanvasEdge({
                repositoryId: args.repositoryId,
                modelId,
                fromVertexId: fromId,
                toVertexId: vertexId,
                edgeType: "flow",
                languageId: args.languageId,
                label: fromId === previousVertexId ? label : undefined,
              });
              results.push({ flow: edge });
            }
            connectedPairs.add(`${previousTitle.toLowerCase()}→${node.title.toLowerCase()}`);
          }
        } else {
          const edge = await this.createCanvasEdge({
            repositoryId: args.repositoryId,
            modelId,
            fromVertexId: previousVertexId,
            toVertexId: vertexId,
            edgeType: "flow",
            languageId: args.languageId,
            label,
          });
          connectedPairs.add(`${previousTitle.toLowerCase()}→${node.title.toLowerCase()}`);
          results.push({ flow: edge });
          if (previousKind === "gateway" || previousKind === "and") {
            boLockedToGateway = undefined;
          }
        }
      }
      previousVertexId = vertexId;
      previousTitle = node.title;
      previousKind = node.kind;
      if (node.kind === "activity") {
        activityVertices.set(node.title.toLowerCase(), {
          vertexId,
          x: usedX,
          y: usedY,
          width: size.width,
          height: size.height,
        });
      }
      cursorX = usedX + size.width + distance.left;
    }

    // Process-level secondaryOutputs: stack under primary terminal BO (multi-output)
    const spineSecondary = proposal.secondaryOutputs ?? [];
    if (spineSecondary.length) {
      const lastBo = [...placed]
        .reverse()
        .find((p) => p.kind === "businessObject" || p.objectType === "businessObject");
      const lastAct = [...chain].reverse().find((n) => n.kind === "activity");
      const actPlacement = lastAct ? activityVertices.get(lastAct.title.toLowerCase()) : undefined;
      if (lastBo && actPlacement) {
        const boSize = this.sizeFor(repoConfig, "businessObject");
        const stackGap = Math.max(distance.bottom, 24);
        const primaryV = vertexByTitle.get(lastBo.title.toLowerCase());
        const baseX = primaryV?.x ?? 0;
        const baseY = (primaryV?.y ?? Y_BO) + boSize.height + stackGap;
        for (let i = 0; i < spineSecondary.length; i++) {
          const outTitle = spineSecondary[i]!;
          const ox = baseX;
          const oy = baseY + i * (boSize.height + stackGap);
          const outSymbolId = await this.resolveOrCreateSymbol({
            repositoryId: args.repositoryId,
            languageId: args.languageId,
            title: outTitle,
            objectType: "businessObject",
            owner: args.owner,
            group: args.group,
            cache: symbolCache,
          });
          const outVertex = await this.placeVertex({
            repositoryId: args.repositoryId,
            modelId,
            symbolId: outSymbolId,
            languageId: args.languageId,
            title: outTitle,
            objectType: "businessObject",
            x: ox,
            y: oy,
            width: boSize.width,
            height: boSize.height,
            reserved,
          });
          const outId = String(outVertex.uuid);
          placed.push({
            title: outTitle,
            objectType: "businessObject",
            symbolId: outSymbolId,
            vertexId: outId,
            kind: "businessObject",
          });
          await this.createCanvasEdge({
            repositoryId: args.repositoryId,
            modelId,
            fromVertexId: actPlacement.vertexId,
            toVertexId: outId,
            edgeType: "flow",
            languageId: args.languageId,
          });
          results.push({ secondaryOutputBo: outTitle });
        }
      }
    }

    // Side branches from gateways — only for targets NOT already ahead on the spine
    let branchSlot = 0;
    for (const b of branches) {
      const pairKey = `${b.fromTitle.toLowerCase()}→${b.toTitle.toLowerCase()}`;
      if (connectedPairs.has(pairKey)) {
        continue;
      }
      const from = vertexByTitle.get(b.fromTitle.toLowerCase());
      if (!from) {
        results.push({
          branchSkipped: `fromTitle not placed: ${b.fromTitle}`,
        });
        continue;
      }

      let to = vertexByTitle.get(b.toTitle.toLowerCase());
      // Target already on the main spine ahead of the gateway → spine FLOW is enough;
      // drawing gateway→forward target crosses through other objects (spaghetti).
      if (to && to.x > from.x + 20 && Math.abs(to.y - from.y) < 100) {
        results.push({
          branchSkipped: `Target "${b.toTitle}" already on spine ahead of "${b.fromTitle}" — no cross-edge`,
        });
        connectedPairs.add(pairKey);
        continue;
      }

      if (!to) {
        const toKind = b.toKind ?? "activity";
        const toOt =
          b.objectType ??
          (toKind === "businessObject"
            ? "businessObject"
            : toKind === "gateway"
              ? "or"
              : toKind === "and"
                ? "and"
                : "activity");
        const size = this.sizeFor(repoConfig, toOt);
        // Align under main-path activity (Ja successor, else deciding activity) — not under the diamond.
        // Centering on the gateway makes FLOW exit left/back through the rule symbol.
        const anchor = this.sideBranchAnchorPlacement({
          gatewayTitle: b.fromTitle,
          chain,
          vertexByTitle,
          gatewayPlacement: from,
        });
        const rawX = Math.round(anchor.x + (anchor.width - size.width) / 2);
        const x = Math.max(MAP_LEFT_MARGIN, rawX);
        const y =
          Math.round(anchor.y + BRANCH_BELOW_ACTIVITY_GAP) +
          branchSlot * (size.height + Math.max(distance.bottom, 24));
        branchSlot += 1;
        const symbolId = await this.resolveOrCreateSymbol({
          repositoryId: args.repositoryId,
          languageId: args.languageId,
          title: b.toTitle,
          objectType: toOt,
          owner: args.owner,
          group: args.group,
          cache: symbolCache,
        });
        const vertex = await this.placeVertex({
          repositoryId: args.repositoryId,
          modelId,
          symbolId,
          languageId: args.languageId,
          title: b.toTitle,
          objectType: toOt,
          x,
          y,
          width: size.width,
          height: size.height,
          reserved,
        });
        const vertexId = String(vertex.uuid);
        const usedX = vertex.x ?? x;
        const usedY = vertex.y ?? y;
        placed.push({
          title: b.toTitle,
          objectType: toOt,
          symbolId,
          vertexId,
          kind: toKind,
        });
        to = {
          vertexId,
          x: usedX,
          y: usedY,
          width: size.width,
          height: size.height,
          kind: toKind,
        };
        vertexByTitle.set(b.toTitle.toLowerCase(), to);
        if (toKind === "activity") {
          activityVertices.set(b.toTitle.toLowerCase(), {
            vertexId,
            x: usedX,
            y: usedY,
            width: size.width,
            height: size.height,
          });
          // Dead-end branch activities need an output BO (value artefact).
          // Prefer branch.outputTitle / secondaryOutputs from propose (Nej-side Output:).
          const outTitles = [b.outputTitle, ...(b.secondaryOutputs ?? [])].filter(
            (t): t is string => Boolean(t?.trim()),
          );
          if (outTitles.length === 0) {
            outTitles.push(`${b.toTitle} result`);
          }
          const boSize = this.sizeFor(repoConfig, "businessObject");
          const primaryOx = Math.round(usedX + size.width + distance.left);
          const primaryOy = Math.round(usedY + Math.floor((size.height - boSize.height) / 2));
          const stackGap = Math.max(distance.bottom, 24);
          for (let i = 0; i < outTitles.length; i++) {
            const outTitle = outTitles[i]!;
            const ox = primaryOx;
            const oy = primaryOy + i * (boSize.height + stackGap);
            const outSymbolId = await this.resolveOrCreateSymbol({
              repositoryId: args.repositoryId,
              languageId: args.languageId,
              title: outTitle,
              objectType: "businessObject",
              owner: args.owner,
              group: args.group,
              cache: symbolCache,
            });
            const outVertex = await this.placeVertex({
              repositoryId: args.repositoryId,
              modelId,
              symbolId: outSymbolId,
              languageId: args.languageId,
              title: outTitle,
              objectType: "businessObject",
              x: ox,
              y: oy,
              width: boSize.width,
              height: boSize.height,
              reserved,
            });
            const outId = String(outVertex.uuid);
            placed.push({
              title: outTitle,
              objectType: "businessObject",
              symbolId: outSymbolId,
              vertexId: outId,
              kind: "businessObject",
            });
            await this.createCanvasEdge({
              repositoryId: args.repositoryId,
              modelId,
              fromVertexId: vertexId,
              toVertexId: outId,
              edgeType: "flow",
              languageId: args.languageId,
            });
            results.push({ branchOutputBo: outTitle });
          }
        }
      }

      const edge = await this.createCanvasEdge({
        repositoryId: args.repositoryId,
        modelId,
        fromVertexId: from.vertexId,
        toVertexId: to.vertexId,
        edgeType: "flow",
        languageId: args.languageId,
        label: b.label,
      });
      connectedPairs.add(pairKey);
      results.push({ branchFlow: edge });
    }

    // RACI / CONTROLS / IS_USED_BY — pack per side so icons do not stack.
    // Include side-branch activities (Nej path): they are in activityVertices but not on chain.
    const satelliteActivityKeys = new Set<string>([
      ...chain.filter((n) => n.kind === "activity").map((n) => n.title.toLowerCase()),
      ...branches
        .filter((b) => (b.toKind ?? "activity") === "activity")
        .map((b) => b.toTitle.toLowerCase()),
    ]);
    for (const activityKey of satelliteActivityKeys) {
      const activityPlacement = activityVertices.get(activityKey);
      if (!activityPlacement) continue;
      const detail = detailByTitle.get(activityKey);
      if (!detail) continue;

      const activityBox = {
        x: activityPlacement.x,
        y: activityPlacement.y,
        width: activityPlacement.width,
        height: activityPlacement.height,
      };
      const activityVertexId = activityPlacement.vertexId;
      const sideGap = Math.max(distance.bottom, distance.top, 12);

      type Sat = {
        title: string;
        objectType: string;
        edgeType: string;
        kind: string;
        width: number;
        height: number;
      };

      const topSats: Sat[] = detail.controlledBy.map((docTitle) => {
        const size = this.sizeFor(repoConfig, "core_document");
        return {
          title: docTitle,
          objectType: "core_document",
          edgeType: "controls",
          kind: "controls",
          width: size.width,
          height: size.height,
        };
      });

      const roleSats: Sat[] = detail.performers.map((performer) => {
        const size = this.sizeFor(repoConfig, "role");
        return {
          title: performer,
          objectType: "role",
          edgeType: "raciresponsible",
          kind: "performer",
          width: size.width,
          height: size.height,
        };
      });
      const otherBottomSats: Sat[] = detail.usedBy.map((usedTitle) => {
        const usedType =
          detail.usedByTypes?.[usedTitle] ??
          (/mall|checklista|dokument/i.test(usedTitle) ? "core_document" : "application");
        const size = this.sizeFor(repoConfig, usedType);
        return {
          title: usedTitle,
          objectType: usedType,
          edgeType: "isusedby",
          kind: "usedBy",
          width: size.width,
          height: size.height,
        };
      });

      const placeOne = async (
        sat: Sat,
        pos: { x: number; y: number },
        edgeAttachSide: "top" | "bottom",
      ): Promise<void> => {
        const symbolId = await this.resolveOrCreateSymbol({
          repositoryId: args.repositoryId,
          languageId: args.languageId,
          title: sat.title,
          objectType: sat.objectType,
          owner: args.owner,
          group: args.group,
          cache: symbolCache,
        });
        const satVertex = await this.placeVertex({
          repositoryId: args.repositoryId,
          modelId,
          symbolId,
          languageId: args.languageId,
          title: sat.title,
          objectType: sat.objectType,
          x: pos.x,
          y: pos.y,
          width: sat.width,
          height: sat.height,
          edgeAttachSide,
          reserved,
        });
        await this.createCanvasEdge({
          repositoryId: args.repositoryId,
          modelId,
          fromVertexId: String(satVertex.uuid),
          toVertexId: activityVertexId,
          edgeType: sat.edgeType,
          languageId: args.languageId,
        });
        placed.push({
          title: sat.title,
          objectType: sat.objectType,
          symbolId,
          vertexId: String(satVertex.uuid),
          kind: sat.kind,
        });
      };

      // Top: CONTROLS docs, pack centered above
      if (topSats.length > 0) {
        const packItems = topSats.map((s) => {
          const lab = this.measureOutsideLabel(s.title);
          return {
            width: Math.max(s.width, lab.width),
            height: s.height,
          };
        });
        const positions = this.packAroundActivity({
          activity: activityBox,
          side: "top",
          items: packItems,
          gap: sideGap,
        });
        for (let i = 0; i < topSats.length; i++) {
          const sat = topSats[i];
          const pos = positions[i];
          const pack = packItems[i];
          if (!sat || !pos || !pack) continue;
          await placeOne(
            sat,
            {
              x: pos.x + Math.floor((pack.width - sat.width) / 2),
              y: pos.y,
            },
            "bottom",
          );
        }
      }

      // Bottom: primary role centered; apps/extra nest to the RIGHT (never stacked)
      const withPack = (s: Sat) => ({
        title: s.title,
        width: s.width,
        height: s.height,
        packWidth: Math.max(s.width, this.measureOutsideLabel(s.title).width),
      });
      const bottomPositions = this.layoutBottomSatellites({
        activity: activityBox,
        roles: roleSats.map(withPack),
        others: otherBottomSats.map(withPack),
        gap: sideGap,
      });
      for (const sat of [...roleSats, ...otherBottomSats]) {
        const pos = bottomPositions.get(sat.title);
        if (!pos) continue;
        await placeOne(sat, pos, "top");
      }
    }

    const boCount = chain.filter((n) => n.kind === "businessObject").length;
    const placedBoCount = placed.filter(
      (p) => p.kind === "businessObject" || p.objectType === "businessObject",
    ).length;
    const missingBos = boCount === 0 || placedBoCount === 0;
    return {
      data: {
        modelId,
        placed,
        chainLength: chain.length,
        activityCount: activityDetails.length,
        businessObjectCount: placedBoCount,
        chainBusinessObjectCount: boCount,
        branchCount: branches.length,
        ok: !missingBos,
        warning: missingBos
          ? "NO business objects on FLOW spine — model is incomplete. Fix chain (BO→activity→BO) and re-apply, or add BOs with set_step_io. Do NOT treat this as done."
          : undefined,
      },
      methodologyNotes: [
        ...(proposal.methodologyNotes ?? []),
        "Applied FLOW chain, RACI_RESPONSIBLE, CONTROLS and IS_USED_BY with reuse-first symbols.",
        "FLOW on activities/processes: left-in / right-out. Roles: one placement under each responsible activity (shared symbol, never fan-out edges).",
        "Multiple FLOW I/O BOs: primary on spine; extras stacked below with edges to activity left / from activity right.",
        ...(branches.length
          ? [
              "Applied gateway branches with FLOW edge labels (Ja/Nej). Side targets align under the main-path activity (not under the diamond) with space for RACI/apps.",
            ]
          : []),
        ...(missingBos
          ? [
              "ERROR: chain had no business objects (or none were placed). Value stream requires BO → activity → BO. If you put BO titles only in steps.inputs/outputs, ensure they are woven into chain — re-run apply after fixing the proposal. ALWAYS call review_process_model next.",
            ]
          : []),
        "Always verify: businessObjectCount > 0, then describe_process + review_process_model before reporting done.",
      ],
      namingChecks: proposal.namingChecks,
      nextSuggestedTools: missingBos
        ? ["review_process_model", "describe_process", "set_step_io", "propose_model_from_text"]
        : ["describe_process", "review_process_model", "get_process_flow"],
    };
  }

  async setActivityPerformer(args: {
    repositoryId: string;
    modelId: string;
    activityVertexId: string;
    performerSymbolId: string;
    languageId: string;
    performerTitle?: string;
    edgeType?: string;
    x?: number;
    y?: number;
  }) {
    const result = await this.linkActivitySatellite({
      repositoryId: args.repositoryId,
      modelId: args.modelId,
      activityVertexId: args.activityVertexId,
      satelliteSymbolId: args.performerSymbolId,
      languageId: args.languageId,
      satelliteTitle: args.performerTitle,
      objectType: "role",
      edgeType: args.edgeType ?? "raciresponsible",
      edgeTypeAliases: ["raciresponsible", "responsible"],
      side: "bottom",
      x: args.x,
      y: args.y,
      kind: "performer",
    });
    return {
      data: {
        performerVertex: result.data.satelliteVertex,
        edge: result.data.edge,
        alreadyLinked: result.data.alreadyLinked,
      },
      methodologyNotes: [
        "Linked performer via RACI_RESPONSIBLE. Placement alone is not ownership.",
        "Same role on multiple activities: place a vertex under each activity (shared symbol UUID, separate canvas placements). Never one role icon with edges to many activities.",
        ...(result.data.alreadyLinked
          ? ["Performer already RACI-linked to this activity; no new edge created."]
          : []),
      ],
      nextSuggestedTools: ["get_roles_and_responsibilities", "describe_process"],
    };
  }

  /**
   * Place application/core_document under an activity and link with IS_USED_BY.
   * One canvas vertex per activity (no fan-out), same pattern as set_activity_performer.
   */
  async setActivityUsedBy(args: {
    repositoryId: string;
    modelId: string;
    activityVertexId: string;
    usedBySymbolId: string;
    languageId: string;
    usedByTitle?: string;
    objectTypeHint?: string;
    edgeType?: string;
    x?: number;
    y?: number;
  }) {
    const objectType =
      args.objectTypeHint ??
      (await this.resolveSymbolObjectType(args.repositoryId, args.usedBySymbolId)) ??
      "application";
    const result = await this.linkActivitySatellite({
      repositoryId: args.repositoryId,
      modelId: args.modelId,
      activityVertexId: args.activityVertexId,
      satelliteSymbolId: args.usedBySymbolId,
      languageId: args.languageId,
      satelliteTitle: args.usedByTitle,
      objectType,
      edgeType: args.edgeType ?? "isusedby",
      edgeTypeAliases: ["isusedby", "usedby"],
      side: "bottom",
      x: args.x,
      y: args.y,
      kind: "usedBy",
    });
    return {
      data: {
        usedByVertex: result.data.satelliteVertex,
        edge: result.data.edge,
        alreadyLinked: result.data.alreadyLinked,
        objectType,
      },
      methodologyNotes: [
        "Linked via IS_USED_BY (IT-stöd / mall / blankett for THIS step).",
        "Process-wide documents belong on the process symbol (link_document), not fan-out on every activity.",
        "Prefer set_activity_used_by over raw create_canvas_edge for satellites.",
      ],
      nextSuggestedTools: ["review_process_model", "describe_process"],
    };
  }

  /**
   * Place a step-specific controlling document above an activity (CONTROLS).
   * Do not use for process-wide policies — those go on the process via link_document.
   */
  async setActivityControls(args: {
    repositoryId: string;
    modelId: string;
    activityVertexId: string;
    controlsSymbolId: string;
    languageId: string;
    controlsTitle?: string;
    edgeType?: string;
    x?: number;
    y?: number;
  }) {
    const objectType =
      (await this.resolveSymbolObjectType(args.repositoryId, args.controlsSymbolId)) ??
      "core_document";
    const result = await this.linkActivitySatellite({
      repositoryId: args.repositoryId,
      modelId: args.modelId,
      activityVertexId: args.activityVertexId,
      satelliteSymbolId: args.controlsSymbolId,
      languageId: args.languageId,
      satelliteTitle: args.controlsTitle,
      objectType,
      edgeType: args.edgeType ?? "controls",
      edgeTypeAliases: ["controls", "control", "styr"],
      side: "top",
      x: args.x,
      y: args.y,
      kind: "controls",
    });
    return {
      data: {
        controlsVertex: result.data.satelliteVertex,
        edge: result.data.edge,
        alreadyLinked: result.data.alreadyLinked,
        objectType,
      },
      methodologyNotes: [
        "Linked via CONTROLS — use only for step-specific styrning (policy/riktlinje/checklista for THAT step).",
        "Process-wide docs (Leveransrutin, Kvalitetspolicy, …): link_document on the process symbol, not set_activity_controls fan-out.",
      ],
      nextSuggestedTools: ["review_process_model", "get_controlling_documents"],
    };
  }

  private async resolveSymbolObjectType(
    repositoryId: string,
    symbolId: string,
  ): Promise<string | undefined> {
    try {
      const symbol = (await this.client.request({
        path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
        pathParams: { repositoryId, symbolId },
        query: { projection: "SIMPLE" },
      })) as { objectType?: string };
      return symbol.objectType;
    } catch {
      return undefined;
    }
  }

  private async resolveSymbolTitle(
    repositoryId: string,
    symbolId: string,
    languageId: string,
  ): Promise<string | undefined> {
    try {
      const symbol = (await this.client.request({
        path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
        pathParams: { repositoryId, symbolId },
        query: { projection: "ALL" },
      })) as { titles?: Record<string, { title?: string }> };
      return pickTitle(symbol.titles as never, languageId) ?? pickTitle(symbol.titles as never);
    } catch {
      return undefined;
    }
  }

  /**
   * Shared RACI / CONTROLS / IS_USED_BY satellite placement under/above one activity.
   * Never fans one canvas vertex to multiple activities.
   */
  private async linkActivitySatellite(args: {
    repositoryId: string;
    modelId: string;
    activityVertexId: string;
    satelliteSymbolId: string;
    languageId: string;
    satelliteTitle?: string;
    objectType: string;
    edgeType: string;
    edgeTypeAliases: string[];
    side: "top" | "bottom";
    x?: number;
    y?: number;
    kind: string;
  }) {
    const canvas = (await this.client.request({
      path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
      pathParams: {
        repositoryId: args.repositoryId,
        modelId: args.modelId,
      },
    })) as {
      vertices?: Array<{
        uuid?: string;
        symbol?: string | { uuid?: string };
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      }>;
      edges?: Array<{
        fromVertex?: string | { uuid?: string };
        toVertex?: string | { uuid?: string };
        edgeType?: string;
      }>;
    };

    const vertexId = (ref: string | { uuid?: string } | undefined): string =>
      typeof ref === "string" ? ref : String(ref?.uuid ?? "");

    const aliases = new Set(
      args.edgeTypeAliases.map((a) => a.toLowerCase().replace(/[_\s-]/g, "")),
    );
    const alreadyLinked = (canvas.edges ?? []).find((e) => {
      const et = (e.edgeType ?? "").toLowerCase().replace(/[_\s-]/g, "");
      if (!aliases.has(et)) return false;
      if (vertexId(e.toVertex) !== args.activityVertexId) return false;
      const from = (canvas.vertices ?? []).find((v) => v.uuid === vertexId(e.fromVertex));
      const sid = typeof from?.symbol === "string" ? from.symbol : from?.symbol?.uuid;
      return sid === args.satelliteSymbolId;
    });

    if (alreadyLinked) {
      const satelliteVertex = (canvas.vertices ?? []).find(
        (v) => v.uuid === vertexId(alreadyLinked.fromVertex),
      );
      return {
        data: {
          satelliteVertex,
          edge: alreadyLinked,
          alreadyLinked: true as const,
          kind: args.kind,
        },
      };
    }

    const activity = (canvas.vertices ?? []).find((v) => v.uuid === args.activityVertexId);
    if (!activity) {
      throw new Error(`Unknown activityVertexId on canvas: ${args.activityVertexId}`);
    }

    const repoConfig = await this.getRepoConfig(args.repositoryId);
    const size = this.sizeFor(repoConfig, args.objectType);
    const { distance } = this.layoutGaps(repoConfig);
    const gap = Math.max(args.side === "top" ? distance.top : distance.bottom, 12);
    const actX = activity.x ?? 80;
    const actY = activity.y ?? Y_BASE;
    const actW = activity.width ?? DEFAULT_WIDTH;
    const actH = activity.height ?? DEFAULT_HEIGHT;
    const title =
      args.satelliteTitle ??
      (await this.resolveSymbolTitle(args.repositoryId, args.satelliteSymbolId, args.languageId)) ??
      args.kind;

    // Same rule as apply layoutBottomSatellites: first sat centered under/above
    // activity; further sats nest to the RIGHT — never stacked on the role.
    const nestGap = 16;
    const staggerY = 14;
    const isSatelliteEdge = (edgeType: string | undefined) => {
      const et = (edgeType ?? "").toLowerCase().replace(/[_\s-]/g, "");
      return /raci|usedby|controls|responsible/.test(et);
    };
    const linkedSiblings = (below: boolean) =>
      (canvas.vertices ?? []).filter((v) => {
        if (!v.uuid || v.uuid === args.activityVertexId) return false;
        const linked = (canvas.edges ?? []).some(
          (e) =>
            isSatelliteEdge(e.edgeType) &&
            vertexId(e.toVertex) === args.activityVertexId &&
            vertexId(e.fromVertex) === v.uuid,
        );
        if (!linked) return false;
        if (below) return (v.y ?? 0) >= actY + actH - 4;
        return (v.y ?? 0) + (v.height ?? 0) <= actY + 4;
      });

    let x = args.x;
    let y = args.y;
    if (x === undefined || y === undefined) {
      if (args.side === "bottom") {
        const baseY = Math.round(actY + actH + gap);
        const siblings = linkedSiblings(true);
        if (siblings.length === 0) {
          x = Math.round(actX + Math.floor(actW / 2) - Math.floor(size.width / 2));
          y = baseY;
        } else {
          let rightEdge = actX;
          for (const s of siblings) {
            rightEdge = Math.max(rightEdge, (s.x ?? 0) + (s.width ?? size.width));
          }
          x = Math.round(rightEdge + nestGap);
          y = Math.round(baseY + staggerY);
        }
      } else {
        const baseY = Math.round(actY - gap - size.height);
        const siblings = linkedSiblings(false);
        if (siblings.length === 0) {
          x = Math.round(actX + Math.floor(actW / 2) - Math.floor(size.width / 2));
          y = baseY;
        } else {
          let rightEdge = actX;
          for (const s of siblings) {
            rightEdge = Math.max(rightEdge, (s.x ?? 0) + (s.width ?? size.width));
          }
          x = Math.round(rightEdge + nestGap);
          y = baseY;
        }
      }
    }

    // Satellite above → edge attaches on bottom; below → attach on top.
    const edgeAttachSide: "top" | "bottom" = args.side === "top" ? "bottom" : "top";

    const satelliteVertex = await this.placeVertex({
      repositoryId: args.repositoryId,
      modelId: args.modelId,
      symbolId: args.satelliteSymbolId,
      languageId: args.languageId,
      title,
      objectType: args.objectType,
      x: x!,
      y: y!,
      width: size.width,
      height: size.height,
      edgeAttachSide,
    });

    const edge = await this.createCanvasEdge({
      repositoryId: args.repositoryId,
      modelId: args.modelId,
      fromVertexId: String(satelliteVertex.uuid),
      toVertexId: args.activityVertexId,
      edgeType: args.edgeType,
      languageId: args.languageId,
    });

    return {
      data: {
        satelliteVertex,
        edge: edge.data,
        alreadyLinked: false as const,
        kind: args.kind,
      },
    };
  }

  async setStepIo(args: {
    repositoryId: string;
    modelId: string;
    fromVertexId: string;
    toVertexId: string;
    languageId: string;
    edgeType?: string;
  }) {
    return this.createCanvasEdge({
      repositoryId: args.repositoryId,
      modelId: args.modelId,
      fromVertexId: args.fromVertexId,
      toVertexId: args.toVertexId,
      edgeType: args.edgeType ?? "flow",
      languageId: args.languageId,
    });
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
