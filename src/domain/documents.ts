import { readFile } from "node:fs/promises";
import type { TwoC8Client } from "../api/twoc8-client.js";
import type { DocumentRootView, DocumentTypeView, Page } from "../api/types.js";
import {
  mtDocumentUrlCreateMutex,
  mtDocumentUrlLockKey,
  symbolDocumentLinkMutex,
  symbolDocumentLockKey,
} from "../util/keyed-async-mutex.js";
import { pickTitle } from "../util/titles.js";
import {
  absoluteUrlsFromMtDocumentBody,
  linksMatchForDedupe,
  normalizeDocumentRootValue,
  normalizeMtDocumentBody,
} from "./document-paths.js";

export interface ResolvedDocView {
  source?: string;
  id?: string;
  title?: string;
  link?: string;
  iconURL?: string;
  metadata?: unknown[];
  docType?: string;
}

function fileUrlToPath(link: string): string | null {
  if (!link.startsWith("file:")) {
    return null;
  }
  try {
    return decodeURIComponent(new URL(link).pathname);
  } catch {
    return null;
  }
}

function metaValue(metadata: unknown[] | undefined, id: string): string | undefined {
  for (const m of metadata ?? []) {
    if (m && typeof m === "object" && (m as { id?: string }).id === id) {
      const data = (m as { data?: string }).data;
      return typeof data === "string" ? data : undefined;
    }
  }
  return undefined;
}

function extractDocumentId(doc: unknown): string | null {
  if (!doc || typeof doc !== "object") return null;
  if ("uuid" in doc && typeof (doc as { uuid: unknown }).uuid === "string") {
    return (doc as { uuid: string }).uuid;
  }
  if ("id" in doc && typeof (doc as { id: unknown }).id === "string") {
    return (doc as { id: string }).id;
  }
  return null;
}

export class DocumentsService {
  constructor(private readonly client: TwoC8Client) {}

  async listRoots(repositoryId: string) {
    const page = await this.client.request<Page<DocumentRootView>>({
      path: "/api/v1/repositories/{repositoryId}/document-roots",
      pathParams: { repositoryId },
    });
    return {
      roots: (page.data ?? []).map((r) => ({
        uuid: r.uuid,
        title: pickTitle(r.titles),
        type: r.type,
        key: r.key,
        value: r.value,
      })),
    };
  }

  /**
   * Create a document root (shared base URL/folder).
   * 2c8 does not bind MT documents to roots via API prefix — store full absolute
   * URLs on documents, then match paths to this root in the 2c8 UI.
   * Body: { key, value, titles: { [languageId]: { title } } }
   */
  async createDocumentRoot(repositoryId: string, body: Record<string, unknown>) {
    const normalized = { ...body };
    if (typeof normalized.value === "string") {
      normalized.value = normalizeDocumentRootValue(normalized.value);
    }
    const created = await this.client.request<DocumentRootView>({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/document-roots",
      pathParams: { repositoryId },
      body: normalized,
    });
    return {
      data: {
        uuid: created.uuid,
        title: pickTitle(created.titles),
        titles: created.titles,
        type: created.type ?? "mtDocumentRoot",
        key: created.key,
        value: created.value,
        raw: created,
      },
      methodologyNotes: [
        "Document root = shared base path (normalized to file:///…/ or https://…/).",
        "link_document(documentRootKey, relativePath, …) joins this value into a FULL absolute URL on the document — API prefix is not a root FK.",
        "After mass create: user matches document paths to this root in the 2c8 UI.",
        "Omit showInPanel on documents unless panel/iframe open is wanted (MCP defaults to false).",
      ],
      nextSuggestedTools: ["list_document_roots", "link_document"],
    };
  }

  async listTypes(repositoryId: string) {
    const page = await this.client.request<Page<DocumentTypeView>>({
      path: "/api/v1/repositories/{repositoryId}/document-types",
      pathParams: { repositoryId },
    });
    return {
      documentTypes: (page.data ?? []).map((t) => ({
        uuid: t.uuid,
        title: pickTitle(t.titles),
        titles: t.titles,
      })),
    };
  }

  /**
   * Create a document type (category for MT documents / panel filtering).
   * Body: { titles: { [languageId]: { title } } }
   */
  async createDocumentType(repositoryId: string, body: Record<string, unknown>) {
    const created = await this.client.request<DocumentTypeView>({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/document-types",
      pathParams: { repositoryId },
      body,
    });
    return {
      data: {
        uuid: created.uuid,
        title: pickTitle(created.titles),
        titles: created.titles,
        raw: created,
      },
      methodologyNotes: [
        "Document types categorise MT documents. Pass uuid in createDocumentBody.documentTypes when creating documents.",
        "MT documents also require type: 'URL' | 'file' (separate from documentTypes).",
        "Omit showInPanel unless the link should open in the web 2c8 panel/iframe; default is new tab.",
      ],
      nextSuggestedTools: ["list_document_types", "link_document"],
    };
  }

  async listSources(repositoryId: string) {
    return this.client.request({
      path: "/api/v1/repositories/{repositoryId}/documents/sources",
      pathParams: { repositoryId },
    });
  }

  async defaultLanguageId(repositoryId: string): Promise<string | undefined> {
    const ids = await this.listLanguageIds(repositoryId);
    return ids[0];
  }

  /** All language UUIDs in the repo (default language first when flagged). */
  async listLanguageIds(repositoryId: string): Promise<string[]> {
    const page = await this.client.request<Page<{ uuid?: string; defaultLanguage?: boolean }>>({
      path: "/api/v1/repositories/{repositoryId}/languages",
      pathParams: { repositoryId },
    });
    const data = page.data ?? [];
    const ordered = [
      ...data.filter((l) => l.defaultLanguage),
      ...data.filter((l) => !l.defaultLanguage),
    ];
    const ids = ordered.map((l) => l.uuid?.trim()).filter((id): id is string => Boolean(id));
    return [...new Set(ids)];
  }

  async listDocumentKeys(args: {
    repositoryId: string;
    sourceId?: string;
    languageId?: string;
  }): Promise<{ sourceId: string; keys: string[] }> {
    const sourceId = args.sourceId ?? "mt.documents";
    const language = args.languageId ?? (await this.defaultLanguageId(args.repositoryId));
    const keys = await this.client.request<string[]>({
      path: "/api/v1/repositories/{repositoryId}/documents/sources/{sourceId}/documents",
      pathParams: { repositoryId: args.repositoryId, sourceId },
      query: language ? { language } : undefined,
    });
    return { sourceId, keys: keys ?? [] };
  }

  async resolveDocuments(args: {
    repositoryId: string;
    sourceId?: string;
    documentKeys: string[];
    languageId?: string;
  }): Promise<{ sourceId: string; documents: ResolvedDocView[] }> {
    const sourceId = args.sourceId ?? "mt.documents";
    const language = args.languageId ?? (await this.defaultLanguageId(args.repositoryId));
    if (!language) {
      throw new Error("Could not resolve repository default language");
    }
    const resolved = await this.client.request<
      Array<{
        documentId?: { source?: string; id?: string };
        link?: string;
        title?: string;
        iconURL?: string;
        metadata?: unknown[];
      }>
    >({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/documents/sources/{sourceId}/documents/resolve",
      pathParams: { repositoryId: args.repositoryId, sourceId },
      body: { language, documentKeys: args.documentKeys },
    });

    const documents: ResolvedDocView[] = (resolved ?? []).map((d) => ({
      source: d.documentId?.source ?? sourceId,
      id: d.documentId?.id,
      title: d.title,
      link: d.link,
      iconURL: d.iconURL,
      metadata: d.metadata,
      docType: metaValue(d.metadata, "mt.docTypes"),
    }));

    return { sourceId, documents };
  }

  /**
   * Search documents by resolving all (or filtered) keys and matching titles.
   * API list-keys does not support title filter reliably — resolve then filter.
   */
  async searchDocuments(args: {
    repositoryId: string;
    query: string;
    sourceId?: string;
    languageId?: string;
    maxResults?: number;
  }): Promise<Record<string, unknown>> {
    const sourceId = args.sourceId ?? "mt.documents";
    const { keys } = await this.listDocumentKeys({
      repositoryId: args.repositoryId,
      sourceId,
      languageId: args.languageId,
    });

    // Resolve in chunks — full resolve can be large
    const chunkSize = 40;
    const matches: ResolvedDocView[] = [];
    const q = args.query.trim().toLowerCase();
    const limit = args.maxResults ?? 25;

    for (let i = 0; i < keys.length && matches.length < limit; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      const { documents } = await this.resolveDocuments({
        repositoryId: args.repositoryId,
        sourceId,
        documentKeys: chunk,
        languageId: args.languageId,
      });
      for (const d of documents) {
        const title = (d.title ?? "").toLowerCase();
        const docType = (d.docType ?? "").toLowerCase();
        if (title.includes(q) || docType.includes(q) || (d.id ?? "").includes(q)) {
          matches.push(d);
          if (matches.length >= limit) {
            break;
          }
        }
      }
    }

    return {
      query: args.query,
      sourceId,
      totalKeysScanned: keys.length,
      total: matches.length,
      documents: matches,
      methodologyNotes: [
        "search_documents resolves MT document metadata (title, link, type).",
        "Use get_document_content to extract text from the resolved link when readable.",
      ],
      nextSuggestedTools: ["get_document_content", "get_controlling_documents"],
    };
  }

  async getDocumentContent(args: {
    repositoryId: string;
    documentId?: string;
    documentKeys?: string[];
    sourceId?: string;
    languageId?: string;
    maxChars?: number;
  }): Promise<Record<string, unknown>> {
    const keys = args.documentKeys ?? (args.documentId ? [args.documentId] : undefined);
    if (!keys?.length) {
      throw new Error("Provide documentId or documentKeys");
    }

    const { sourceId, documents } = await this.resolveDocuments({
      repositoryId: args.repositoryId,
      sourceId: args.sourceId,
      documentKeys: keys,
      languageId: args.languageId,
    });

    const maxChars = args.maxChars ?? 12000;
    const enriched = [];
    for (const doc of documents) {
      const content = await this.extractTextFromLink(doc.link, maxChars);
      enriched.push({
        ...doc,
        content: content.text,
        contentSource: content.source,
        contentNote: content.note,
        truncated: content.truncated,
      });
    }

    return {
      sourceId,
      documents: enriched,
      methodologyNotes: [
        "PDF/text extraction works for local file:// paths and http(s) URLs reachable from the MCP host.",
        "If link is file:// on another machine, contentNote explains the limitation — share a published URL or place the file where the MCP server can read it.",
      ],
      nextSuggestedTools: ["search_documents", "describe_role"],
    };
  }

  private async extractTextFromLink(
    link: string | undefined,
    maxChars: number,
  ): Promise<{
    text?: string;
    source?: string;
    note?: string;
    truncated?: boolean;
  }> {
    if (!link) {
      return { note: "No link returned by document resolve." };
    }

    try {
      let buffer: Buffer | undefined;
      let source: string | undefined;

      if (link.startsWith("file:")) {
        const filePath = fileUrlToPath(link);
        if (!filePath) {
          return { note: `Could not parse file URL: ${link}` };
        }
        try {
          buffer = await readFile(filePath);
          source = `file:${filePath}`;
        } catch {
          return {
            note: `file:// link not readable from MCP host (${filePath}). Use a published URL or run MCP on a machine with access to the path.`,
          };
        }
      } else if (link.startsWith("http://") || link.startsWith("https://")) {
        const res = await fetch(link);
        if (!res.ok) {
          return { note: `HTTP fetch failed with ${res.status} for ${link}` };
        }
        buffer = Buffer.from(await res.arrayBuffer());
        source = link;
      } else {
        return { note: `Unsupported link scheme: ${link}` };
      }

      if (!buffer) {
        return { note: "Empty document buffer." };
      }

      const lower = (source ?? link).toLowerCase();
      if (lower.endsWith(".pdf") || link.toLowerCase().includes(".pdf")) {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        let text = String(result.text ?? "").trim();
        let truncated = false;
        if (text.length > maxChars) {
          text = text.slice(0, maxChars);
          truncated = true;
        }
        return { text, source, truncated };
      }

      // Plain text / html fallback
      let text = buffer.toString("utf8");
      let truncated = false;
      if (text.length > maxChars) {
        text = text.slice(0, maxChars);
        truncated = true;
      }
      return { text, source, truncated };
    } catch (error) {
      return {
        note: `Failed to extract content: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  async createMtDocument(repositoryId: string, body: unknown) {
    // API defaults showInPanel to true; prefer new-tab unless caller opts in.
    let payload = body;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const b = normalizeMtDocumentBody(body as Record<string, unknown>);
      if (!("showInPanel" in b)) {
        payload = { ...b, showInPanel: false };
      } else {
        payload = b;
      }
    }
    return this.client.request({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/mt-documents",
      pathParams: { repositoryId },
      body: payload,
    });
  }

  /**
   * Find an existing MT document whose resolved link matches absoluteUrl.
   * Scans document keys in chunks (same approach as search_documents).
   */
  async findMtDocumentByAbsoluteUrl(
    repositoryId: string,
    absoluteUrl: string,
    languageId?: string,
  ): Promise<ResolvedDocView | null> {
    const sourceId = "mt.documents";
    const { keys } = await this.listDocumentKeys({
      repositoryId,
      sourceId,
      languageId,
    });
    const chunkSize = 40;
    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      const { documents } = await this.resolveDocuments({
        repositoryId,
        sourceId,
        documentKeys: chunk,
        languageId,
      });
      for (const d of documents) {
        if (d.link && linksMatchForDedupe(d.link, absoluteUrl)) {
          return d;
        }
      }
    }
    return null;
  }

  /**
   * Create MT document, or reuse an existing one with the same absolute content URL.
   * Parallel creates for the same URL are serialized so smoke + SAL-MSP + SAL-CV
   * do not mint three UUIDs for one Sales Practice file.
   */
  async createOrReuseMtDocument(
    repositoryId: string,
    body: unknown,
  ): Promise<{
    document: unknown;
    reused: boolean;
    matchedUrl?: string;
    documentId?: string;
  }> {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      const document = await this.createMtDocument(repositoryId, body);
      const id = extractDocumentId(document);
      return { document, reused: false, documentId: id ?? undefined };
    }

    const urls = absoluteUrlsFromMtDocumentBody(body as Record<string, unknown>);
    const primaryUrl = urls[0];
    if (!primaryUrl) {
      const document = await this.createMtDocument(repositoryId, body);
      const id = extractDocumentId(document);
      return { document, reused: false, documentId: id ?? undefined };
    }

    return mtDocumentUrlCreateMutex.runExclusive(
      mtDocumentUrlLockKey(repositoryId, primaryUrl),
      async () => {
        const existing = await this.findMtDocumentByAbsoluteUrl(repositoryId, primaryUrl);
        if (existing?.id) {
          return {
            document: {
              uuid: existing.id,
              id: existing.id,
              title: existing.title,
              link: existing.link,
              reusedFromResolve: true,
            },
            reused: true,
            matchedUrl: primaryUrl,
            documentId: existing.id,
          };
        }
        const document = await this.createMtDocument(repositoryId, body);
        const id = extractDocumentId(document);
        return {
          document,
          reused: false,
          matchedUrl: primaryUrl,
          documentId: id ?? undefined,
        };
      },
    );
  }

  async updateMtDocument(repositoryId: string, documentId: string, body: unknown) {
    let payload = body;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      payload = normalizeMtDocumentBody(body as Record<string, unknown>);
    }
    return this.client.request({
      method: "PATCH",
      path: "/api/v1/repositories/{repositoryId}/mt-documents/{documentId}",
      pathParams: { repositoryId, documentId },
      body: payload,
    });
  }

  /**
   * Permanently delete MT document(s). Same DELETE shape as symbols
   * (DELETE …/mt-documents/{documentId}). OpenAPI omits DELETE but API returns 204.
   * Gated by TWO_C8_ALLOW_DELETES at tool registration.
   */
  async deleteMtDocuments(args: { repositoryId: string; documentIds: string[] }) {
    const ids = [...new Set(args.documentIds.filter(Boolean))];
    if (ids.length === 0) {
      throw new Error("documentIds must contain at least one UUID");
    }
    const deleted: string[] = [];
    const errors: Array<{ documentId: string; error: string }> = [];
    for (const documentId of ids) {
      try {
        await this.client.request({
          method: "DELETE",
          path: "/api/v1/repositories/{repositoryId}/mt-documents/{documentId}",
          pathParams: {
            repositoryId: args.repositoryId,
            documentId,
          },
        });
        deleted.push(documentId);
      } catch (error) {
        errors.push({
          documentId,
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
        "Permanently deleted MT document(s) via DELETE …/mt-documents/{documentId} (irreversible).",
        "Does not unlink from symbols first — unlink_document if the doc is still attached, or delete after confirming no symbol refs.",
        "Same gating as delete_model / delete_symbol: TWO_C8_ALLOW_DELETES=true.",
      ],
      nextSuggestedTools: [
        "verify_document_links",
        "list_document_roots",
        "search_documents",
        "unlink_document",
      ],
    };
  }

  async linkDocumentsToSymbol(args: {
    repositoryId: string;
    symbolId: string;
    documentIds: string[];
    merge?: boolean;
  }) {
    // Serialize read-modify-write per symbol so parallel link_document calls do not clobber each other.
    return symbolDocumentLinkMutex.runExclusive(
      symbolDocumentLockKey(args.repositoryId, args.symbolId),
      () => this.linkDocumentsToSymbolUnlocked(args),
    );
  }

  private async linkDocumentsToSymbolUnlocked(args: {
    repositoryId: string;
    symbolId: string;
    documentIds: string[];
    merge?: boolean;
  }) {
    // API expects MtbDocumentIdDto objects — plain UUID strings are rejected (400).
    const toRef = (id: string) => ({ id, source: "mt.documents" as const });
    const extractId = (d: unknown): string | null => {
      if (typeof d === "string") return d;
      if (d && typeof d === "object" && "uuid" in d) {
        return String((d as { uuid: string }).uuid);
      }
      if (d && typeof d === "object" && "id" in d) {
        return String((d as { id: string }).id);
      }
      return null;
    };

    let ids = [...args.documentIds];

    if (args.merge !== false) {
      const existing = await this.client.request<{ documents?: unknown[] }>({
        path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
        pathParams: {
          repositoryId: args.repositoryId,
          symbolId: args.symbolId,
        },
        query: { projection: "ALL" },
      });
      const prev = (existing.documents ?? []).map(extractId).filter((x): x is string => Boolean(x));
      ids = [...new Set([...prev, ...ids])];
    }

    // PATCH often returns empty 200 → client yields undefined; still report success.
    await this.client.request({
      method: "PATCH",
      path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
      pathParams: {
        repositoryId: args.repositoryId,
        symbolId: args.symbolId,
      },
      body: { documents: ids.map(toRef) },
    });
    return {
      ok: true as const,
      symbolId: args.symbolId,
      documents: ids.map(toRef),
    };
  }

  /** Remove MT document refs from a symbol (documents panel). */
  async unlinkDocumentsFromSymbol(args: {
    repositoryId: string;
    symbolId: string;
    documentIds: string[];
  }) {
    return symbolDocumentLinkMutex.runExclusive(
      symbolDocumentLockKey(args.repositoryId, args.symbolId),
      () => this.unlinkDocumentsFromSymbolUnlocked(args),
    );
  }

  private async unlinkDocumentsFromSymbolUnlocked(args: {
    repositoryId: string;
    symbolId: string;
    documentIds: string[];
  }) {
    const toRef = (id: string) => ({ id, source: "mt.documents" as const });
    const extractId = (d: unknown): string | null => {
      if (typeof d === "string") return d;
      if (d && typeof d === "object" && "uuid" in d) {
        return String((d as { uuid: string }).uuid);
      }
      if (d && typeof d === "object" && "id" in d) {
        return String((d as { id: string }).id);
      }
      return null;
    };

    const remove = new Set(args.documentIds);
    const existing = await this.client.request<{ documents?: unknown[] }>({
      path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
      pathParams: {
        repositoryId: args.repositoryId,
        symbolId: args.symbolId,
      },
      query: { projection: "ALL" },
    });
    const prev = (existing.documents ?? []).map(extractId).filter((x): x is string => Boolean(x));
    const prevSet = new Set(prev);
    const remaining = [...prevSet.difference(remove)];
    const removed = [...prevSet.intersection(remove)];

    await this.client.request({
      method: "PATCH",
      path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
      pathParams: {
        repositoryId: args.repositoryId,
        symbolId: args.symbolId,
      },
      body: { documents: remaining.map(toRef) },
    });

    return {
      ok: true as const,
      symbolId: args.symbolId,
      removed,
      documents: remaining.map(toRef),
      note:
        removed.length < args.documentIds.length
          ? "Some documentIds were not linked on the symbol"
          : undefined,
    };
  }

  /**
   * Create a description type (syfte/scope/ägare fields etc.).
   * API requires dataType + inputType + non-empty connectedTo (type links).
   * "Entries cannot be null" = missing connectedTo; "field 'entries' not allowed" = do not send entries.
   */
  async createDescriptionType(repositoryId: string, body: Record<string, unknown>) {
    const normalized = normalizeDescriptionTypeBody(body);
    const created = await this.client.request<{
      uuid?: string;
      titles?: Record<string, { title?: string }>;
      dataType?: string;
      inputType?: string;
      connectedTo?: unknown[];
    }>({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/description-types",
      pathParams: { repositoryId },
      body: normalized,
    });
    return {
      data: {
        uuid: created.uuid,
        title: pickTitle(created.titles as never),
        titles: created.titles,
        dataType: created.dataType,
        inputType: created.inputType,
        connectedTo: created.connectedTo,
      },
      methodologyNotes: [
        "Minimal body: titles + dataType se.conciliate.rich.text + inputType rich-text-editor + connectedTo[{type,position,hidden}].",
        "Do not send `entries` (API rejects it). Missing connectedTo → 400 Entries cannot be null.",
        "New repos may lack description types until the 2c8 client opens them — create before update_*_description.",
      ],
      nextSuggestedTools: [
        "list_description_types",
        "update_model_description",
        "update_symbol_description",
      ],
    };
  }
}

const DEFAULT_DESCRIPTION_CONNECTED_TO = [
  { type: "PROCESS", position: 1, hidden: "" },
  { type: "ACTIVITY", position: 1, hidden: "" },
  { type: "BUSINESS_OBJECT", position: 1, hidden: "" },
];

/** Ensure POST body matches live 2c8 contract (rich-text field on process/activity/BO). */
export function normalizeDescriptionTypeBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  // Agent mistake from MCP-FEEDBACK — strip illegal key
  delete out.entries;
  if (!out.dataType || out.dataType === "STRING" || out.dataType === "TEXT") {
    out.dataType = "se.conciliate.rich.text";
  }
  if (
    !out.inputType ||
    out.inputType === "TEXTAREA" ||
    out.inputType === "TEXT" ||
    out.inputType === "STRING"
  ) {
    out.inputType = "rich-text-editor";
  }
  const connected = out.connectedTo;
  if (!Array.isArray(connected) || connected.length === 0) {
    out.connectedTo = DEFAULT_DESCRIPTION_CONNECTED_TO;
  }
  return out;
}
