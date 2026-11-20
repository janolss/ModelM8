import { readFile } from "node:fs/promises";
import type { TwoC8Client } from "../api/twoc8-client.js";
import type { DocumentRootView, DocumentTypeView, Page } from "../api/types.js";
import { pickTitle } from "../util/titles.js";

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

function metaValue(
  metadata: unknown[] | undefined,
  id: string,
): string | undefined {
  for (const m of metadata ?? []) {
    if (m && typeof m === "object" && (m as { id?: string }).id === id) {
      const data = (m as { data?: string }).data;
      return typeof data === "string" ? data : undefined;
    }
  }
  return undefined;
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

  async listSources(repositoryId: string) {
    return this.client.request({
      path: "/api/v1/repositories/{repositoryId}/documents/sources",
      pathParams: { repositoryId },
    });
  }

  async defaultLanguageId(repositoryId: string): Promise<string | undefined> {
    const page = await this.client.request<
      Page<{ uuid?: string; defaultLanguage?: boolean }>
    >({
      path: "/api/v1/repositories/{repositoryId}/languages",
      pathParams: { repositoryId },
    });
    const data = page.data ?? [];
    return (
      data.find((l) => l.defaultLanguage)?.uuid ?? data[0]?.uuid ?? undefined
    );
  }

  async listDocumentKeys(args: {
    repositoryId: string;
    sourceId?: string;
    languageId?: string;
  }): Promise<{ sourceId: string; keys: string[] }> {
    const sourceId = args.sourceId ?? "mt.documents";
    const language =
      args.languageId ?? (await this.defaultLanguageId(args.repositoryId));
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
    const language =
      args.languageId ?? (await this.defaultLanguageId(args.repositoryId));
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
    const keys =
      args.documentKeys ??
      (args.documentId ? [args.documentId] : undefined);
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
    return this.client.request({
      method: "POST",
      path: "/api/v1/repositories/{repositoryId}/mt-documents",
      pathParams: { repositoryId },
      body,
    });
  }

  async updateMtDocument(
    repositoryId: string,
    documentId: string,
    body: unknown,
  ) {
    return this.client.request({
      method: "PATCH",
      path: "/api/v1/repositories/{repositoryId}/mt-documents/{documentId}",
      pathParams: { repositoryId, documentId },
      body,
    });
  }

  async linkDocumentsToSymbol(args: {
    repositoryId: string;
    symbolId: string;
    documentIds: string[];
    merge?: boolean;
  }) {
    let documents = args.documentIds.map((id) =>
      typeof id === "string" ? id : id,
    );

    if (args.merge !== false) {
      const existing = await this.client.request<{ documents?: unknown[] }>({
        path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
        pathParams: {
          repositoryId: args.repositoryId,
          symbolId: args.symbolId,
        },
        query: { projection: "ALL" },
      });
      const prev = (existing.documents ?? [])
        .map((d) => {
          if (typeof d === "string") {
            return d;
          }
          if (d && typeof d === "object" && "uuid" in d) {
            return String((d as { uuid: string }).uuid);
          }
          if (d && typeof d === "object" && "id" in d) {
            return String((d as { id: string }).id);
          }
          return null;
        })
        .filter((x): x is string => Boolean(x));
      documents = [...new Set([...prev, ...documents])];
    }

    return this.client.request({
      method: "PATCH",
      path: "/api/v1/repositories/{repositoryId}/symbols/{symbolId}",
      pathParams: {
        repositoryId: args.repositoryId,
        symbolId: args.symbolId,
      },
      body: { documents },
    });
  }
}
