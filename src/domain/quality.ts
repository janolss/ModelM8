import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TwoC8Client } from "../api/twoc8-client.js";
import { TwoC8ApiError } from "../api/twoc8-client.js";
import type {
  BreakdownView,
  CanvasDto,
  LocalizedTitle,
  ModelView,
  Page,
  SymbolView,
} from "../api/types.js";
import { pickTitle } from "../util/titles.js";
import { classifyResolvedDocumentLink, expandRelativeLinkAgainstRoots } from "./document-paths.js";
import type { DocumentsService } from "./documents.js";
import type { ProcessReader } from "./process-reader.js";

const SWEDISH_CHARS = /[åäöÅÄÖ]/;

function symbolIdOfVertex(vertex: { symbol?: string | { uuid?: string } }): string | undefined {
  if (typeof vertex.symbol === "string") return vertex.symbol;
  if (vertex.symbol && typeof vertex.symbol === "object") {
    return vertex.symbol.uuid;
  }
  return undefined;
}

function breakdownSymbolId(b: BreakdownView): string | undefined {
  const s = b.symbol;
  if (typeof s === "string") return s;
  if (s && typeof s === "object" && "uuid" in s) {
    return (s as { uuid?: string }).uuid;
  }
  return undefined;
}

function titleForLang(
  titles: Record<string, LocalizedTitle> | undefined,
  languageId: string,
): string | undefined {
  const t = titles?.[languageId]?.title?.trim();
  return t || undefined;
}

/**
 * Quality / QA helpers used after large IMS builds (handoffs, translations,
 * navigation tree, process-register coverage, document links).
 */
export class QualityService {
  constructor(
    private readonly client: TwoC8Client,
    private readonly reader: ProcessReader,
    private readonly documents: DocumentsService,
  ) {}

  /** Paginate all models in a repository (any modelType). */
  async listAllModels(repositoryId: string): Promise<
    Array<{
      uuid: string;
      title?: string;
      modelType?: string;
      titles?: Record<string, LocalizedTitle>;
    }>
  > {
    const out: Array<{
      uuid: string;
      title?: string;
      modelType?: string;
      titles?: Record<string, LocalizedTitle>;
    }> = [];
    let startAt = 0;
    const pageSize = 100;
    for (;;) {
      const page = await this.client.request<Page<ModelView>>({
        path: "/api/v1/repositories/{repositoryId}/models",
        pathParams: { repositoryId },
        query: {
          startAt: String(startAt),
          maxResults: String(pageSize),
          projection: "ALL",
        },
      });
      const batch = page.data ?? [];
      for (const m of batch) {
        if (!m.uuid) continue;
        out.push({
          uuid: m.uuid,
          title: pickTitle(m.titles),
          modelType: m.modelType,
          titles: m.titles,
        });
      }
      startAt += batch.length;
      if (batch.length === 0 || startAt >= (page.total ?? startAt)) break;
    }
    return out;
  }

  /**
   * Symbols missing or not marked translated for a language.
   * GUI globe ON when translated !== true (false or omitted on non-default).
   * Reasons: missing title, not-marked (translated !== true), or same as
   * compareLanguageId with Swedish characters (EN left as SV copy).
   */
  async listUntranslatedSymbols(args: {
    repositoryId: string;
    languageId: string;
    compareLanguageId?: string;
    objectType?: string;
    maxResults?: number;
  }) {
    const max = args.maxResults ?? 500;
    const items: Array<{
      uuid: string;
      objectType?: string;
      title?: string;
      reason: string;
      titles?: Record<string, LocalizedTitle>;
    }> = [];
    let startAt = 0;
    const pageSize = 100;

    while (items.length < max) {
      const page = await this.client.request<Page<SymbolView>>({
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
        if (
          args.objectType &&
          (s.objectType ?? "").toLowerCase() !== args.objectType.toLowerCase()
        ) {
          continue;
        }
        const entry = s.titles?.[args.languageId];
        const title = entry?.title?.trim();
        let reason: string | undefined;
        if (!title) {
          reason = "missing";
        } else if (entry?.translated !== true) {
          // false or omitted → GUI Translation status globe
          reason = "not-marked";
        } else if (args.compareLanguageId) {
          const other = titleForLang(s.titles, args.compareLanguageId);
          if (other && title === other) {
            // Same string as primary → likely untranslated copy (EN left as EN on SV, etc.)
            reason = SWEDISH_CHARS.test(title)
              ? "same-as-compare-with-swedish-chars"
              : "same-as-compare";
          }
        }
        if (reason) {
          items.push({
            uuid: s.uuid,
            objectType: s.objectType,
            title: pickTitle(s.titles),
            reason,
            titles: s.titles,
          });
          if (items.length >= max) break;
        }
      }

      startAt += batch.length;
      if (startAt >= (page.total ?? startAt)) break;
    }

    const byReason: Record<string, number> = {};
    for (const i of items) {
      byReason[i.reason] = (byReason[i.reason] ?? 0) + 1;
    }

    return {
      data: {
        languageId: args.languageId,
        compareLanguageId: args.compareLanguageId,
        total: items.length,
        byReason,
        symbols: items,
      },
      methodologyNotes: [
        "translated:true = confirmed (globe OFF); translated:false/omitted = not translated (globe ON).",
        "missing = no title; not-marked = title exists but translated !== true.",
        "same-as-compare / same-as-compare-with-swedish-chars = secondary title identical to compareLanguageId — confirm_translations alone is NOT enough; use update_titles with real target-language text.",
        "Q6 stickprov: spot-check that secondary titles look like the target language before closing an area.",
      ],
      nextSuggestedTools: ["update_titles", "confirm_translations", "search_symbols"],
    };
  }

  /**
   * Symbols not placed on any model canvas (orphans). Canvas-only —
   * documents panel / breakdowns may still reference them.
   */
  async listOrphanSymbols(args: {
    repositoryId: string;
    languageId?: string;
    titlePrefix?: string;
    objectType?: string;
    /** When true, also return symbols that ARE on a canvas (debug). Default false. */
    includeUsedOnCanvas?: boolean;
    maxResults?: number;
  }) {
    const max = args.maxResults ?? 200;
    const prefix = args.titlePrefix?.trim().toLowerCase();
    const objectTypeFilter = args.objectType?.trim().toLowerCase();

    const allSymbols: Array<{
      symbolId: string;
      title?: string;
      objectType?: string;
    }> = [];
    let startAt = 0;
    const pageSize = 100;
    for (;;) {
      const page = await this.client.request<Page<SymbolView>>({
        path: "/api/v1/repositories/{repositoryId}/symbols",
        pathParams: { repositoryId: args.repositoryId },
        query: {
          startAt: String(startAt),
          maxResults: String(pageSize),
          projection: "ALL",
        },
      });
      const batch = page.data ?? [];
      for (const s of batch) {
        if (!s.uuid) continue;
        if (objectTypeFilter && (s.objectType ?? "").toLowerCase() !== objectTypeFilter) {
          continue;
        }
        const title = pickTitle(s.titles, args.languageId);
        if (prefix && !(title ?? "").toLowerCase().startsWith(prefix)) {
          continue;
        }
        allSymbols.push({
          symbolId: s.uuid,
          title,
          objectType: s.objectType,
        });
      }
      startAt += batch.length;
      if (batch.length === 0 || startAt >= (page.total ?? startAt)) break;
    }

    const models = await this.listAllModels(args.repositoryId);
    const usedOnCanvas = new Set<string>();
    const concurrency = 6;
    for (let i = 0; i < models.length; i += concurrency) {
      const chunk = models.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (m) => {
          try {
            const canvas = await this.client.request<CanvasDto>({
              path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
              pathParams: {
                repositoryId: args.repositoryId,
                modelId: m.uuid,
              },
            });
            for (const v of canvas.vertices ?? []) {
              const sid = symbolIdOfVertex(v);
              if (sid) usedOnCanvas.add(sid);
            }
          } catch {
            // model without canvas
          }
        }),
      );
    }

    const orphans = allSymbols.filter((s) => !usedOnCanvas.has(s.symbolId));
    const used = args.includeUsedOnCanvas
      ? allSymbols.filter((s) => usedOnCanvas.has(s.symbolId))
      : undefined;

    return {
      data: {
        orphanCount: orphans.length,
        orphans: orphans.slice(0, max),
        truncated: orphans.length > max,
        scannedModels: models.length,
        scannedSymbols: allSymbols.length,
        usedOnCanvasCount: usedOnCanvas.size,
        ...(used ? { usedOnCanvas: used.slice(0, max), usedTruncated: used.length > max } : {}),
        note: "Canvas-only; documents panel / breakdowns may still reference symbols",
      },
      methodologyNotes: [
        "Orphans often include ZZ_UTGÅR leftovers after retarget/consolidation.",
        "Filter with titlePrefix (e.g. ZZ_) before delete_model / cleanup.",
        "Reuse-first: prefer search_symbols over creating when an orphan already matches the concept.",
      ],
      nextSuggestedTools: ["search_symbols", "find_symbol_usage", "retarget_vertex_symbol"],
    };
  }

  /**
   * Verify handoff BOs appear on both producer and consumer models
   * (same symbol UUID). Optionally checks FLOW I/O roles via detail scope.
   *
   * Accepts legacy `handoffs`, IMS `contract` (producer/consumer aliases),
   * and/or `autoDiscover` (pairwise primary outputs ∩ inputs).
   */
  async verifyHandoffs(args: {
    repositoryId: string;
    handoffs?: Array<{
      fromModelId: string;
      toModelId: string;
      symbolId?: string;
      title?: string;
      /** When true (default), require symbol as from-output and to-input. */
      checkIo?: boolean;
    }>;
    /** IMS handoff-contract alias: producer→from, consumer→to. */
    contract?: Array<{
      producerModelId: string;
      consumerModelId: string;
      symbolId?: string;
      title?: string;
      checkIo?: boolean;
    }>;
    /** Derive checks from primary outputs(A) ∩ inputs(B) for each ordered pair. */
    autoDiscover?: {
      modelIds: string[];
      checkIo?: boolean;
    };
  }) {
    type HandoffCheck = {
      fromModelId: string;
      toModelId: string;
      symbolId?: string;
      title?: string;
      checkIo?: boolean;
      source?: "handoffs" | "contract" | "autoDiscover";
    };

    const normalized: HandoffCheck[] = [];
    for (const h of args.handoffs ?? []) {
      normalized.push({ ...h, source: "handoffs" });
    }
    for (const c of args.contract ?? []) {
      normalized.push({
        fromModelId: c.producerModelId,
        toModelId: c.consumerModelId,
        symbolId: c.symbolId,
        title: c.title,
        checkIo: c.checkIo,
        source: "contract",
      });
    }

    const discovered: Array<{
      fromModelId: string;
      toModelId: string;
      symbolId: string;
      title?: string;
    }> = [];
    const emptyIntersections: Array<{
      fromModelId: string;
      toModelId: string;
      reason: string;
    }> = [];

    if (args.autoDiscover?.modelIds?.length) {
      const ids = [...new Set(args.autoDiscover.modelIds)];
      const checkIo = args.autoDiscover.checkIo;
      const scopeCache = new Map<
        string,
        Awaited<ReturnType<ProcessReader["getDetailProcessScope"]>> | null
      >();
      for (const id of ids) {
        try {
          scopeCache.set(
            id,
            await this.reader.getDetailProcessScope({
              repositoryId: args.repositoryId,
              modelId: id,
            }),
          );
        } catch {
          scopeCache.set(id, null);
        }
      }

      for (const fromId of ids) {
        for (const toId of ids) {
          if (fromId === toId) continue;
          const fromScope = scopeCache.get(fromId);
          const toScope = scopeCache.get(toId);
          if (!fromScope || !toScope) {
            emptyIntersections.push({
              fromModelId: fromId,
              toModelId: toId,
              reason: !fromScope ? "producer scope unavailable" : "consumer scope unavailable",
            });
            continue;
          }
          // Primary outputs only — overview/handoff spine (not secondaryOutputs).
          const outById = new Map(
            fromScope.outputs.filter((o) => o.symbolId).map((o) => [o.symbolId!, o.title] as const),
          );
          const shared: Array<{ symbolId: string; title?: string }> = [];
          for (const inp of toScope.inputs) {
            if (!inp.symbolId || !outById.has(inp.symbolId)) continue;
            shared.push({
              symbolId: inp.symbolId,
              title: inp.title ?? outById.get(inp.symbolId),
            });
          }
          if (shared.length === 0) {
            emptyIntersections.push({
              fromModelId: fromId,
              toModelId: toId,
              reason: "no primary output ∩ input",
            });
            continue;
          }
          for (const s of shared) {
            discovered.push({
              fromModelId: fromId,
              toModelId: toId,
              symbolId: s.symbolId,
              title: s.title,
            });
            // Dedupe against already queued explicit checks
            const dup = normalized.some(
              (n) => n.fromModelId === fromId && n.toModelId === toId && n.symbolId === s.symbolId,
            );
            if (dup) continue;
            normalized.push({
              fromModelId: fromId,
              toModelId: toId,
              symbolId: s.symbolId,
              title: s.title,
              checkIo: checkIo !== false,
              source: "autoDiscover",
            });
          }
        }
      }
    }

    if (normalized.length === 0) {
      throw new Error(
        "verify_handoffs requires handoffs[], contract[], and/or autoDiscover.modelIds that yield at least one check",
      );
    }

    const results: Array<Record<string, unknown>> = [];

    for (const h of normalized) {
      let symbolId = h.symbolId;
      let title = h.title;
      if (!symbolId && title) {
        const found = await this.reader.searchSymbols({
          repositoryId: args.repositoryId,
          query: title,
          objectType: "businessObject",
          maxResults: "20",
        });
        const symbols = (found.symbols ?? []) as Array<{
          uuid?: string;
          title?: string;
        }>;
        const exact = symbols.find(
          (s) => (s.title ?? "").toLowerCase() === title!.trim().toLowerCase(),
        );
        symbolId = exact?.uuid ?? symbols[0]?.uuid;
        title = exact?.title ?? symbols[0]?.title ?? title;
      }
      if (!symbolId) {
        results.push({
          fromModelId: h.fromModelId,
          toModelId: h.toModelId,
          symbolId: h.symbolId,
          title: h.title,
          source: h.source,
          pass: false,
          error: "Could not resolve symbolId or title",
        });
        continue;
      }

      const usage = (await this.reader.findSymbolUsage({
        repositoryId: args.repositoryId,
        symbolId,
        enrich: "basic",
      })) as {
        usages?: Array<{ modelId?: string; title?: string }>;
        symbol?: { title?: string };
      };
      const usageModelIds = new Set((usage.usages ?? []).map((u) => u.modelId).filter(Boolean));
      const onFrom = usageModelIds.has(h.fromModelId);
      const onTo = usageModelIds.has(h.toModelId);
      const usageCount = usage.usages?.length ?? 0;

      let ioOk: boolean | undefined;
      if (h.checkIo !== false) {
        try {
          const fromScope = await this.reader.getDetailProcessScope({
            repositoryId: args.repositoryId,
            modelId: h.fromModelId,
          });
          const toScope = await this.reader.getDetailProcessScope({
            repositoryId: args.repositoryId,
            modelId: h.toModelId,
          });
          const fromOutputs = [...fromScope.outputs, ...fromScope.secondaryOutputs]
            .map((o) => o.symbolId)
            .filter((x): x is string => Boolean(x));
          const toInputs = toScope.inputs
            .map((i) => i.symbolId)
            .filter((x): x is string => Boolean(x));
          ioOk = fromOutputs.includes(symbolId) && toInputs.includes(symbolId);
        } catch (err) {
          ioOk = undefined;
          results.push({
            fromModelId: h.fromModelId,
            toModelId: h.toModelId,
            symbolId,
            title: title ?? usage.symbol?.title,
            source: h.source,
            onFrom,
            onTo,
            usageCount,
            pass: onFrom && onTo,
            ioCheckError: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
      }

      const pass = onFrom && onTo && (h.checkIo === false || ioOk === true);
      results.push({
        fromModelId: h.fromModelId,
        toModelId: h.toModelId,
        symbolId,
        title: title ?? usage.symbol?.title,
        source: h.source,
        onFrom,
        onTo,
        usageCount,
        ioOk,
        pass,
      });
    }

    const passCount = results.filter((r) => r.pass).length;
    return {
      data: {
        results,
        passCount,
        total: results.length,
        allPass: passCount === results.length,
        ...(discovered.length || emptyIntersections.length
          ? {
              autoDiscover: {
                discoveredCount: discovered.length,
                discovered,
                emptyIntersections,
              },
            }
          : {}),
      },
      methodologyNotes: [
        "Handoff = same business-object UUID on producer and consumer — never 'similar title'.",
        "ioOk checks from-model primary/secondary outputs and to-model inputs via get_detail_process_scope.",
        "contract[] is an IMS alias (producerModelId/consumerModelId). autoDiscover uses primary outputs ∩ inputs only.",
      ],
      nextSuggestedTools: [
        "search_symbols",
        "set_step_io",
        "get_detail_process_scope",
        "list_orphan_symbols",
      ],
    };
  }

  /**
   * Build L0→… navigation from detail models' broken-down-from links.
   * Marks models with no upward link (except optional roots).
   */
  async getNavigationTree(args: { repositoryId: string; rootModelId?: string }) {
    const models = await this.listAllModels(args.repositoryId);

    // symbolId → modelIds that place that symbol
    const symbolToModels = new Map<string, string[]>();
    const modelMeta = new Map(models.map((m) => [m.uuid, m] as const));

    // Load canvases in chunks to find which models host overview symbols
    const concurrency = 6;
    for (let i = 0; i < models.length; i += concurrency) {
      const chunk = models.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (m) => {
          try {
            const canvas = await this.client.request<CanvasDto>({
              path: "/api/v1/repositories/{repositoryId}/models/{modelId}/canvas",
              pathParams: {
                repositoryId: args.repositoryId,
                modelId: m.uuid,
              },
            });
            for (const v of canvas.vertices ?? []) {
              const sid = symbolIdOfVertex(v);
              if (!sid) continue;
              const list = symbolToModels.get(sid) ?? [];
              list.push(m.uuid);
              symbolToModels.set(sid, list);
            }
          } catch {
            // ignore models without canvas
          }
        }),
      );
    }

    type Link = {
      modelId: string;
      title?: string;
      parentSymbolId?: string;
      parentModelIds: string[];
      breakdownId?: string;
    };
    const links: Link[] = [];
    const missingUpward: Array<{ modelId: string; title?: string }> = [];

    for (const m of models) {
      let page: Page<BreakdownView> | undefined;
      try {
        page = await this.client.request<Page<BreakdownView>>({
          path: "/api/v1/repositories/{repositoryId}/models/{modelId}/broken-down-from",
          pathParams: {
            repositoryId: args.repositoryId,
            modelId: m.uuid,
          },
        });
      } catch (err) {
        if (err instanceof TwoC8ApiError && err.status === 404) {
          // Overview / models without breakdown endpoint
          if (!args.rootModelId || m.uuid !== args.rootModelId) {
            // defer missing classification until we know who is a parent
          }
          continue;
        }
        throw err;
      }
      const data = page.data ?? [];
      if (data.length === 0) {
        missingUpward.push({ modelId: m.uuid, title: m.title });
        continue;
      }
      for (const b of data) {
        const parentSymbolId = breakdownSymbolId(b);
        const parentModelIds = parentSymbolId
          ? [...new Set(symbolToModels.get(parentSymbolId) ?? [])].filter((id) => id !== m.uuid)
          : [];
        links.push({
          modelId: m.uuid,
          title: m.title,
          parentSymbolId,
          parentModelIds,
          breakdownId: b.uuid,
        });
        if (parentModelIds.length === 0) {
          missingUpward.push({
            modelId: m.uuid,
            title: m.title,
          });
        }
      }
    }

    // Models that appear as parents but have no own parent link = roots/interiors
    const childIds = new Set(links.map((l) => l.modelId));
    const parentIds = new Set(links.flatMap((l) => l.parentModelIds));
    const roots = models.filter(
      (m) =>
        parentIds.has(m.uuid) ||
        (args.rootModelId ? m.uuid === args.rootModelId : false) ||
        (!childIds.has(m.uuid) && (m.modelType ?? "").toLowerCase().includes("process")),
    );

    // Prefer explicit root when given
    const rootIds = args.rootModelId ? [args.rootModelId] : roots.map((r) => r.uuid);

    const childrenOf = new Map<string, Link[]>();
    for (const l of links) {
      for (const p of l.parentModelIds) {
        const arr = childrenOf.get(p) ?? [];
        arr.push(l);
        childrenOf.set(p, arr);
      }
    }

    type TreeNode = {
      modelId: string;
      title?: string;
      modelType?: string;
      children: TreeNode[];
    };

    const build = (modelId: string, seen: Set<string>): TreeNode => {
      const meta = modelMeta.get(modelId);
      const kids = (childrenOf.get(modelId) ?? []).filter((c) => !seen.has(c.modelId));
      const nextSeen = new Set(seen);
      nextSeen.add(modelId);
      return {
        modelId,
        title: meta?.title,
        modelType: meta?.modelType,
        children: kids.map((c) => build(c.modelId, nextSeen)),
      };
    };

    const tree = rootIds.filter((id) => modelMeta.has(id)).map((id) => build(id, new Set()));

    // Dedupe missing: models that are children with empty parentModelIds, or
    // process models that are neither roots nor linked (exclude known parents of others when they are roots)
    const linkedAsChild = new Set(
      links.filter((l) => l.parentModelIds.length > 0).map((l) => l.modelId),
    );
    const missingUnique = [
      ...new Map(
        missingUpward
          .filter((m) => !linkedAsChild.has(m.modelId))
          .filter((m) => !rootIds.includes(m.modelId))
          .map((m) => [m.modelId, m]),
      ).values(),
    ];

    return {
      data: {
        roots: tree,
        links,
        missingUpwardLinks: missingUnique,
        modelCount: models.length,
        linkCount: links.length,
      },
      methodologyNotes: [
        "Breakdowns are stored on DETAIL models (GET …/broken-down-from). get_breakdowns(overview) is often empty/404 — use this tree instead.",
        "Every model except L0 should have broken-down-from immediately after create (link_breakdown).",
        "missingUpwardLinks = details with breakdown symbol not found on any parent canvas, or no breakdown at all.",
      ],
      nextSuggestedTools: ["link_breakdown", "find_models", "get_breakdowns"],
    };
  }

  /**
   * Map expected process codes/titles to models (generic process-register coverage).
   */
  async verifyProcessCoverage(args: {
    repositoryId: string;
    expected: Array<{
      code?: string;
      title?: string;
      titleContains?: string;
    }>;
    /** When set, also require reachability from this root via navigation tree. */
    rootModelId?: string;
  }) {
    const models = await this.listAllModels(args.repositoryId);
    let reachable: Set<string> | undefined;
    if (args.rootModelId) {
      const nav = await this.getNavigationTree({
        repositoryId: args.repositoryId,
        rootModelId: args.rootModelId,
      });
      reachable = new Set<string>();
      const walk = (nodes: Array<{ modelId: string; children: unknown[] }>) => {
        for (const n of nodes) {
          reachable!.add(n.modelId);
          walk(n.children as Array<{ modelId: string; children: unknown[] }>);
        }
      };
      walk(nav.data.roots as Array<{ modelId: string; children: unknown[] }>);
    }

    const rows = args.expected.map((exp) => {
      const matches = models.filter((m) => {
        const t = (m.title ?? "").toLowerCase();
        if (exp.code) {
          const c = exp.code.toLowerCase();
          if (
            t.includes(c) ||
            Object.values(m.titles ?? {}).some((x) => (x.title ?? "").toLowerCase().includes(c))
          ) {
            return true;
          }
        }
        if (exp.title) {
          if (t === exp.title.toLowerCase()) return true;
        }
        if (exp.titleContains) {
          if (t.includes(exp.titleContains.toLowerCase())) return true;
        }
        return false;
      });
      const covered = matches.length > 0;
      const reachableOk = !reachable || matches.some((m) => reachable!.has(m.uuid));
      return {
        expected: exp,
        pass: covered && reachableOk,
        covered,
        reachableFromRoot: reachable ? reachableOk : undefined,
        matches: matches.map((m) => ({
          modelId: m.uuid,
          title: m.title,
          modelType: m.modelType,
        })),
      };
    });

    const passCount = rows.filter((r) => r.pass).length;
    return {
      data: {
        rows,
        passCount,
        total: rows.length,
        allPass: passCount === rows.length,
      },
      methodologyNotes: [
        "Pass expected[] from your process register (code and/or titleContains). Does not parse documents.",
        "Optional rootModelId checks navigation reachability via get_navigation_tree.",
      ],
      nextSuggestedTools: ["get_navigation_tree", "find_models", "link_breakdown"],
    };
  }

  /**
   * Verify MT document links resolve to absolute http(s)/file:/// URLs.
   * Content/URL is per language — omit languageId to check every repo language
   * (avoids EN-only allPass while SV content is empty).
   * API prefix is not a document-root binding — create stores full absolute URLs;
   * user matches paths to roots in the 2c8 UI afterward.
   */
  async verifyDocumentLinks(args: {
    repositoryId: string;
    languageId?: string;
    documentIds?: string[];
    requireRootsIfDocuments?: boolean;
    checkFileExists?: boolean;
    maxResults?: number;
  }) {
    const requireRoots = args.requireRootsIfDocuments !== false;
    const checkFiles = args.checkFileExists === true;
    const maxIssues = args.maxResults ?? 100;

    const { roots } = await this.documents.listRoots(args.repositoryId);
    const rootKeys = roots.map((r) => r.key?.trim()).filter((k): k is string => Boolean(k));
    const rootValues = roots.map((r) => r.value?.trim()).filter((v): v is string => Boolean(v));

    const languageIds = args.languageId
      ? [args.languageId]
      : await this.documents.listLanguageIds(args.repositoryId);
    if (languageIds.length === 0) {
      throw new Error(
        "verify_document_links: repository has no languages — call list_languages / create repository languages first",
      );
    }

    let keys: string[];
    if (args.documentIds?.length) {
      keys = [...new Set(args.documentIds.filter(Boolean))];
    } else {
      // Keys are language-agnostic; resolve with default/first language for listing.
      const listed = await this.documents.listDocumentKeys({
        repositoryId: args.repositoryId,
        languageId: languageIds[0],
      });
      keys = listed.keys;
    }

    const findings: Array<{
      documentId?: string;
      languageId?: string;
      title?: string;
      link?: string;
      code: string;
      detail: string;
      fileExists?: boolean;
    }> = [];

    if (requireRoots && keys.length > 0 && rootKeys.length === 0) {
      findings.push({
        code: "no-document-roots",
        detail:
          "Repository has MT documents but no document roots. Create create_document_root (SOURCE_DIR → file:///…/) so the 2c8 UI can match absolute document URLs to the root after create.",
      });
    }

    const chunkSize = 40;
    let checked = 0;
    for (const languageId of languageIds) {
      if (findings.length >= maxIssues) break;
      for (let i = 0; i < keys.length && findings.length < maxIssues; i += chunkSize) {
        const chunk = keys.slice(i, i + chunkSize);
        const { documents } = await this.documents.resolveDocuments({
          repositoryId: args.repositoryId,
          documentKeys: chunk,
          languageId,
        });
        for (const doc of documents) {
          checked += 1;
          // Prefer absolute as stored; if UI matching left a relative path, try root values.
          let absoluteLink = doc.link;
          const direct = classifyResolvedDocumentLink(doc.link);
          if (!direct.ok && rootValues.length > 0) {
            absoluteLink = expandRelativeLinkAgainstRoots(doc.link, rootValues).absoluteLink;
          }

          const classification = classifyResolvedDocumentLink(absoluteLink);
          if (!classification.ok) {
            findings.push({
              documentId: doc.id,
              languageId,
              title: doc.title,
              link: absoluteLink ?? doc.link,
              code: classification.code ?? "invalid-link",
              detail: `${classification.detail ?? "Invalid document link"} [languageId=${languageId}]`,
            });
            if (findings.length >= maxIssues) break;
            continue;
          }

          if (checkFiles && absoluteLink && /^file:\/\/\//i.test(absoluteLink)) {
            let fileExists = false;
            try {
              const path = fileURLToPath(absoluteLink);
              fileExists = existsSync(path);
            } catch {
              fileExists = false;
            }
            if (!fileExists) {
              findings.push({
                documentId: doc.id,
                languageId,
                title: doc.title,
                link: absoluteLink,
                code: "file-not-found",
                detail: `file:/// link does not exist on this host: ${absoluteLink} [languageId=${languageId}]`,
                fileExists: false,
              });
              if (findings.length >= maxIssues) break;
            }
          }
        }
      }
    }

    const brokenCount = findings.filter((f) => f.code !== "no-document-roots").length;
    const rootWarning = findings.some((f) => f.code === "no-document-roots");
    const expectedChecks = keys.length * languageIds.length;

    return {
      data: {
        documentCount: keys.length,
        languageIds,
        languagesChecked: languageIds.length,
        checkedCount: checked,
        rootCount: roots.length,
        rootKeys,
        roots: roots.map((r) => ({
          key: r.key,
          value: r.value,
          title: r.title,
          uuid: r.uuid,
        })),
        findings,
        brokenCount,
        allPass: findings.length === 0,
        truncated: findings.length >= maxIssues && checked < expectedChecks,
      },
      methodologyNotes: [
        "MT document content/URL is per language (languages.<id>.content) — same as titles. Empty content on a secondary language → missing-link in that language’s GUI.",
        args.languageId
          ? `Checked languageId=${args.languageId} only. Omit languageId to verify all repo languages.`
          : `Checked all ${languageIds.length} repo language(s). Pass languageId to scope to one language.`,
        "Create/link must store absolute https:// or file:///… URLs for every active language (same file → same absolute URL via link_document titles map).",
        "After mass create: user runs 2c8 UI match so paths that start with a root value bind to that root.",
        requireRoots
          ? "requireRootsIfDocuments=true: repos with documents should have at least one document root for later UI matching."
          : "requireRootsIfDocuments=false: root presence not required.",
        checkFiles
          ? "checkFileExists=true: file:/// targets are checked with fs.existsSync on this host."
          : "checkFileExists=false: no filesystem probe (default).",
        rootWarning
          ? "Fix: create_document_root then recreate links as full absolute URLs (link_document documentRootKey + relativePath + titles for all languages)."
          : "Fix broken rows with link_document updateDocumentBody setting languages.*.content for the failing languageId(s).",
      ],
      nextSuggestedTools: [
        "list_document_roots",
        "list_languages",
        "create_document_root",
        "link_document",
        "unlink_document",
        "resolve_documents",
      ],
    };
  }
}
