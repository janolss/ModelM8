import type { LocalizedTitle } from "../api/types.js";

export function pickTitle(
  titles: Record<string, LocalizedTitle> | undefined,
  preferredLanguageId?: string,
): string | undefined {
  if (!titles || typeof titles !== "object") {
    return undefined;
  }
  if (preferredLanguageId && titles[preferredLanguageId]?.title) {
    return titles[preferredLanguageId].title;
  }
  for (const value of Object.values(titles)) {
    if (value?.title) {
      return value.title;
    }
  }
  return undefined;
}

export function titleMatches(
  titles: Record<string, LocalizedTitle> | undefined,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q || !titles) {
    return false;
  }
  return Object.values(titles).some((t) =>
    (t?.title ?? "").toLowerCase().includes(q),
  );
}
