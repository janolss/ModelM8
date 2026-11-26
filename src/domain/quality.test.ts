import { describe, expect, it } from "vitest";
import { collectModelTitles, modelMatchesExpected } from "./quality.js";

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
