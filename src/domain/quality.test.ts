import { describe, expect, it } from "vitest";
import { collectModelTitles, modelMatchesExpected } from "./quality.js";

/** Mirrors verify_handoffs title resolution (exact match only; no first-hit fallback). */
function resolveHandoffSymbolId(
  title: string,
  symbols: Array<{ uuid?: string; title?: string }>,
): { symbolId?: string; error?: string } {
  const needle = title.trim().toLowerCase();
  const exact = symbols.find((s) => (s.title ?? "").toLowerCase() === needle);
  if (exact?.uuid) return { symbolId: exact.uuid };
  return {
    error: `No exact businessObject title match for "${title}" (refusing first-search-hit fallback)`,
  };
}

describe("verify_handoffs exact title resolve", () => {
  it("uses exact title match only", () => {
    const r = resolveHandoffSymbolId("Order", [
      { uuid: "u1", title: "Order draft" },
      { uuid: "u2", title: "Order" },
    ]);
    expect(r.symbolId).toBe("u2");
    expect(r.error).toBeUndefined();
  });

  it("refuses symbols[0] when no exact match", () => {
    const r = resolveHandoffSymbolId("Order", [
      { uuid: "u1", title: "Order draft" },
      { uuid: "u2", title: "Customer order" },
    ]);
    expect(r.symbolId).toBeUndefined();
    expect(r.error).toMatch(/exact businessObject title match/i);
  });
});

describe("verify_process_coverage multi-lang matching", () => {
  const svId = "lang-sv";
  const enId = "lang-en";
  const model = {
    title: "Handle incident",
    titles: {
      [svId]: { title: "Hantera incident" },
      [enId]: { title: "Handle incident" },
    },
  };

  it("matches SV titleContains when default title is EN", () => {
    expect(modelMatchesExpected(model, { titleContains: "Hantera incident" })).toBe(true);
    expect(modelMatchesExpected(model, { title: "Hantera incident" })).toBe(true);
  });

  it("matches EN default / titleContains", () => {
    expect(modelMatchesExpected(model, { titleContains: "Handle" })).toBe(true);
    expect(modelMatchesExpected(model, { title: "Handle incident" })).toBe(true);
  });

  it("languageId pins to that language only", () => {
    expect(modelMatchesExpected(model, { titleContains: "Hantera" }, { languageId: svId })).toBe(
      true,
    );
    expect(modelMatchesExpected(model, { titleContains: "Hantera" }, { languageId: enId })).toBe(
      false,
    );
    expect(modelMatchesExpected(model, { titleContains: "Handle" }, { languageId: enId })).toBe(
      true,
    );
  });

  it("collectModelTitles includes all langs by default", () => {
    const titles = collectModelTitles(model);
    expect(titles).toContain("Handle incident");
    expect(titles).toContain("Hantera incident");
  });

  it("does not match unrelated strings", () => {
    expect(modelMatchesExpected(model, { titleContains: "Problemhantering" })).toBe(false);
  });
});
