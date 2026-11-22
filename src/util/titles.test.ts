import { describe, expect, it } from "vitest";
import { pickTitle, titleMatches } from "./titles.js";

describe("titles", () => {
  const titles = {
    sv: { title: "Registrera order" },
    en: { title: "Register order" },
  };

  it("pickTitle prefers language when present", () => {
    expect(pickTitle(titles, "en")).toBe("Register order");
    expect(pickTitle(titles, "sv")).toBe("Registrera order");
  });

  it("pickTitle falls back to first available title", () => {
    expect(pickTitle(titles, "missing")).toBe("Registrera order");
    expect(pickTitle(undefined)).toBeUndefined();
  });

  it("titleMatches is case-insensitive substring", () => {
    expect(titleMatches(titles, "order")).toBe(true);
    expect(titleMatches(titles, "REGISTER")).toBe(true);
    expect(titleMatches(titles, "faktura")).toBe(false);
    expect(titleMatches(undefined, "x")).toBe(false);
  });
});
