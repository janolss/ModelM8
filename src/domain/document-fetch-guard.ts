import dns from "node:dns/promises";
import { realpath } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Cap download size before PDF/text parse (bytes). */
export const DOCUMENT_FETCH_MAX_BYTES = 5_000_000;
/** Abort hung HTTP fetches. */
export const DOCUMENT_FETCH_TIMEOUT_MS = 15_000;

/**
 * True when path is under one of the allowed root directories (after resolve).
 * Uses path.resolve; callers should prefer realpath when the path exists.
 */
export function isPathInsideRoots(filePath: string, allowedRoots: readonly string[]): boolean {
  if (!filePath || allowedRoots.length === 0) {
    return false;
  }
  const resolved = path.resolve(filePath);
  for (const root of allowedRoots) {
    if (!root?.trim()) continue;
    const rootResolved = path.resolve(root.trim());
    if (resolved === rootResolved || resolved.startsWith(`${rootResolved}${path.sep}`)) {
      return true;
    }
  }
  return false;
}

/** Convert file:// document-root values to filesystem paths for allowlisting. */
export function filesystemPathsFromDocumentRootValues(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const v = raw?.trim();
    if (!v) continue;
    if (/^file:/i.test(v)) {
      try {
        out.push(fileURLToPath(v.endsWith("/") ? v : `${v}/`));
      } catch {
        // skip unparsable
      }
      continue;
    }
    if (v.startsWith("/") || /^[A-Za-z]:[\\/]/.test(v)) {
      out.push(v);
    }
  }
  return out;
}

export function parseDocumentReadRootsEnv(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function isPrivateOrLoopbackIp(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }
  // IPv4-mapped IPv6
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) {
    return isPrivateOrLoopbackIp(mapped[1]);
  }
  if (net.isIPv6(normalized)) {
    // Unique local fc00::/7, link-local fe80::/10
    return (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }
  if (!net.isIPv4(normalized)) {
    return false;
  }
  const parts = normalized.split(".").map((n) => Number(n));
  const [a, b] = parts;
  if (a === undefined || b === undefined) return false;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function isBlockedHostnameLiteral(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h === "metadata.google.internal") {
    return true;
  }
  if (net.isIP(h)) {
    return isPrivateOrLoopbackIp(h);
  }
  return false;
}

/** Resolve hostname and reject private/loopback targets (SSRF hardening). */
export async function assertHttpUrlSafeForFetch(urlString: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme: ${url.protocol}`);
  }
  const host = url.hostname;
  if (isBlockedHostnameLiteral(host)) {
    throw new Error(`Refusing to fetch private/loopback host: ${host}`);
  }
  if (!net.isIP(host)) {
    let addresses: string[];
    try {
      const lookup = await dns.lookup(host, { all: true, verbatim: true });
      addresses = lookup.map((a) => a.address);
    } catch (err) {
      throw new Error(
        `DNS lookup failed for ${host}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    for (const addr of addresses) {
      if (isPrivateOrLoopbackIp(addr)) {
        throw new Error(`Refusing to fetch ${host} — resolves to private/loopback address ${addr}`);
      }
    }
  }
}

/**
 * Fetch URL with timeout, no redirects, and hard byte cap.
 * Returns buffer or throws / returns structured refusal via Error message.
 */
export async function fetchDocumentBytes(
  urlString: string,
  options?: { maxBytes?: number; timeoutMs?: number },
): Promise<Buffer> {
  const maxBytes = options?.maxBytes ?? DOCUMENT_FETCH_MAX_BYTES;
  const timeoutMs = options?.timeoutMs ?? DOCUMENT_FETCH_TIMEOUT_MS;
  await assertHttpUrlSafeForFetch(urlString);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(urlString, {
      signal: controller.signal,
      redirect: "error",
      headers: { Accept: "*/*" },
    });
    if (!res.ok) {
      throw new Error(`HTTP fetch failed with ${res.status} for ${urlString}`);
    }
    const declared = res.headers.get("content-length");
    if (declared) {
      const n = Number(declared);
      if (Number.isFinite(n) && n > maxBytes) {
        throw new Error(`Refusing download: Content-Length ${n} exceeds ${maxBytes} bytes`);
      }
    }
    if (!res.body) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) {
        throw new Error(`Refusing download: body ${buf.length} exceeds ${maxBytes} bytes`);
      }
      return buf;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`Refusing download: body exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
  } finally {
    clearTimeout(timer);
  }
}

/** Ensure file path is readable only under allowlisted roots (realpath when possible). */
export async function assertFilePathAllowed(
  filePath: string,
  allowedRoots: readonly string[],
): Promise<string> {
  if (allowedRoots.length === 0) {
    throw new Error(
      "file:// reads require an allowlist: configure repository document roots (file:///…) " +
        "or set TWO_C8_DOCUMENT_READ_ROOTS to comma-separated absolute directories.",
    );
  }
  let candidate = path.resolve(filePath);
  try {
    candidate = await realpath(candidate);
  } catch {
    // File may not exist yet / unreadable — still check resolved path against roots
  }
  const normalizedRoots: string[] = [];
  for (const root of allowedRoots) {
    try {
      normalizedRoots.push(await realpath(path.resolve(root)));
    } catch {
      normalizedRoots.push(path.resolve(root));
    }
  }
  if (!isPathInsideRoots(candidate, normalizedRoots)) {
    throw new Error(
      `file:// path is outside allowed document roots: ${candidate}. ` +
        "Add a matching document root or TWO_C8_DOCUMENT_READ_ROOTS entry.",
    );
  }
  return candidate;
}

export function isNonLoopbackBindHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h || h === "127.0.0.1" || h === "::1" || h === "localhost") {
    return false;
  }
  return true;
}
