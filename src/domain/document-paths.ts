import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Encode a path for use in document links / root values.
 * Each segment is percent-encoded (spaces → %20, non-ASCII → UTF-8 octets).
 * `/` separators are preserved; empty segments (leading/trailing slash) kept.
 */
export function encodeUrlPath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, "/");
  return normalized
    .split("/")
    .map((segment) => {
      if (segment === "") {
        return "";
      }
      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return encodeURIComponent(segment);
      }
    })
    .join("/");
}

/** Relative path under a library folder — no leading slash; segments URL-encoded. */
export function encodeRelativeDocumentPath(relativePath: string): string {
  const cleaned = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned) {
    throw new Error("relativePath is empty");
  }
  if (/^(https?:|file:)/i.test(cleaned)) {
    throw new Error("relativePath must be relative to the document root base, not an absolute URL");
  }
  return encodeUrlPath(cleaned);
}

export function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** True file URL with absolute path: file:///… (three slashes). */
export function isAbsoluteFileUrl(value: string): boolean {
  return /^file:\/\/\//i.test(value.trim());
}

export function isAbsoluteDocumentUrl(value: string): boolean {
  return isAbsoluteHttpUrl(value) || isAbsoluteFileUrl(value);
}

export type DocumentLinkIssueCode =
  | "missing-link"
  | "relative-without-absolute-url"
  | "invalid-file-url";

/**
 * Join a document-root base URL with a relative path → absolute URL.
 * Used when building MT document content (full URL stored in 2c8).
 * API field `prefix` is NOT a document-root binding — do not use it for this.
 */
export function joinRootValueAndRelativePath(rootValue: string, relativePath: string): string {
  const base = normalizeDocumentRootValue(rootValue);
  const rel = encodeRelativeDocumentPath(relativePath);
  return `${base}${rel}`;
}

/**
 * If resolve returns a relative path after 2c8 UI root-matching, try each root
 * value as a base. Prefer absolute links from create/link (before UI match).
 */
export function expandRelativeLinkAgainstRoots(
  link: string | undefined | null,
  rootValues: readonly string[],
): { absoluteLink: string | undefined } {
  if (link == null || !String(link).trim()) {
    return { absoluteLink: undefined };
  }
  const trimmed = String(link).trim();
  if (isAbsoluteDocumentUrl(trimmed)) {
    return { absoluteLink: trimmed };
  }
  if (/^file:/i.test(trimmed)) {
    return { absoluteLink: trimmed };
  }
  const rel = trimmed.replace(/^\//, "");
  for (const raw of rootValues) {
    const v = raw?.trim();
    if (!v) continue;
    try {
      const base = normalizeDocumentRootValue(v);
      return { absoluteLink: `${base}${encodeRelativeDocumentPath(rel)}` };
    } catch {
      // try next root
    }
  }
  return { absoluteLink: trimmed };
}

/**
 * Classify a resolved document link. Create/link must store absolute https/file:///.
 * Bare relative paths fail (non-clickable until absolute URL exists / UI match).
 */
export function classifyResolvedDocumentLink(link: string | undefined | null): {
  ok: boolean;
  code?: DocumentLinkIssueCode;
  detail?: string;
} {
  if (link == null || !String(link).trim()) {
    return {
      ok: false,
      code: "missing-link",
      detail: "Resolved link is empty",
    };
  }
  const trimmed = String(link).trim();
  if (isAbsoluteHttpUrl(trimmed) || isAbsoluteFileUrl(trimmed)) {
    return { ok: true };
  }
  if (/^file:/i.test(trimmed)) {
    return {
      ok: false,
      code: "invalid-file-url",
      detail: `Need file:///absolute/path, got: ${trimmed}`,
    };
  }
  return {
    ok: false,
    code: "relative-without-absolute-url",
    detail: `Link is not absolute http(s)/file:///: ${trimmed}. Store the full URL (root value + relative path). After create, use 2c8 UI “match document roots” to bind paths to roots.`,
  };
}

/**
 * Normalize a document-root value to a usable base URL ending with `/`.
 * Filesystem paths → file:///…/ with encoded segments.
 */
export function normalizeDocumentRootValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("document root value is empty");
  }

  if (isAbsoluteHttpUrl(trimmed)) {
    const withSlash = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
    const url = new URL(withSlash);
    const encodedPath = encodeUrlPath(decodeURIComponent(url.pathname));
    url.pathname = encodedPath.endsWith("/") ? encodedPath : `${encodedPath}/`;
    return url.href;
  }

  if (/^file:/i.test(trimmed)) {
    if (!isAbsoluteFileUrl(trimmed)) {
      throw new Error(
        `Document root value must be file:///… (absolute) or a filesystem path, got: ${trimmed}`,
      );
    }
    const url = new URL(trimmed);
    let filePath = decodeURIComponent(url.pathname);
    if (!filePath.endsWith(path.sep) && !filePath.endsWith("/")) {
      filePath = `${filePath}/`;
    }
    let href = pathToFileURL(filePath).href;
    if (!href.endsWith("/")) {
      href += "/";
    }
    return href;
  }

  const resolved = path.resolve(trimmed);
  let href = pathToFileURL(resolved).href;
  if (!href.endsWith("/")) {
    href += "/";
  }
  return href;
}

/** Ensure languages.*.content is an absolute, percent-encoded http(s)/file:/// URL. */
export function normalizeAbsoluteDocumentLink(content: string): string {
  const trimmed = content.trim();
  if (isAbsoluteHttpUrl(trimmed)) {
    return new URL(trimmed).href;
  }
  if (/^file:/i.test(trimmed)) {
    if (!isAbsoluteFileUrl(trimmed)) {
      throw new Error(`Invalid file URL (need file:///absolute/path): ${trimmed}`);
    }
    const url = new URL(trimmed);
    return pathToFileURL(decodeURIComponent(url.pathname)).href;
  }
  if (path.isAbsolute(trimmed)) {
    return pathToFileURL(trimmed).href;
  }
  throw new Error(
    `languages.*.content must be an absolute http(s) or file:/// URL (or absolute filesystem path). Got: ${trimmed}. Prefer link_document(documentRootKey, relativePath) which joins the root value into a full URL. Do not use API prefix for document roots — bind roots in the 2c8 UI after create.`,
  );
}

export type MtDocumentLanguageEntry = {
  title?: string;
  content?: string;
  [key: string]: unknown;
};

/**
 * Normalize/validate POST/PATCH mt-documents body.
 *
 * 2c8 API `prefix` is a free-text id/name — NOT a document-root foreign key.
 * Always store absolute URLs in languages.*.content so the UI can match them
 * to a document root by path prefix later.
 */
export function normalizeMtDocumentBody(body: Record<string, unknown>): Record<string, unknown> {
  if (typeof body.content === "string" && body.content.trim()) {
    throw new Error(
      "createDocumentBody.content at top level is invalid. Put the path in languages.<languageId>.content as a full absolute URL (or use link_document(documentRootKey, relativePath, title, languageId)).",
    );
  }

  const languages = body.languages;

  if (!languages || typeof languages !== "object" || Array.isArray(languages)) {
    if (body.type === "URL" || body.type === "file") {
      throw new Error(
        "createDocumentBody with type URL|file requires languages.<languageId>.{ title, content } with absolute content URL.",
      );
    }
    return body;
  }

  const nextLanguages: Record<string, MtDocumentLanguageEntry> = {};
  let sawContent = false;
  for (const [langId, raw] of Object.entries(languages as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      nextLanguages[langId] = raw as MtDocumentLanguageEntry;
      continue;
    }
    const entry = { ...(raw as MtDocumentLanguageEntry) };
    if (typeof entry.content === "string" && entry.content.trim()) {
      sawContent = true;
      entry.content = normalizeAbsoluteDocumentLink(entry.content);
    }
    nextLanguages[langId] = entry;
  }

  if ((body.type === "URL" || body.type === "file") && !sawContent) {
    throw new Error(
      "createDocumentBody type URL|file requires non-empty languages.*.content with an absolute http(s)/file:/// URL.",
    );
  }

  return {
    ...body,
    languages: nextLanguages,
  };
}

/**
 * Build createDocumentBody with a FULL absolute URL (root value + relative path).
 * Does not set API `prefix` to the root key — roots are bound in the 2c8 UI.
 */
export function buildAbsoluteDocumentBody(args: {
  documentRootValue: string;
  relativePath: string;
  title: string;
  languageId: string;
  type?: "file" | "URL";
  documentTypes?: string[];
  extraTitles?: Record<string, string>;
}): Record<string, unknown> {
  const content = joinRootValueAndRelativePath(args.documentRootValue, args.relativePath);
  const languages: Record<string, { title: string; content: string }> = {
    [args.languageId]: { title: args.title, content },
  };
  for (const [langId, title] of Object.entries(args.extraTitles ?? {})) {
    if (langId === args.languageId) continue;
    languages[langId] = { title, content };
  }
  const body: Record<string, unknown> = {
    type: args.type ?? "file",
    languages,
  };
  if (args.documentTypes?.length) {
    body.documentTypes = args.documentTypes;
  }
  return body;
}
