import { describe, expect, it } from "vitest";
import { loadMethodologyPack } from "./loader.js";

describe("loadMethodologyPack", () => {
  it("loads object types and naming from knowledge/", () => {
    const pack = loadMethodologyPack();
    expect(pack.objectTypes.length).toBeGreaterThan(0);
    expect(pack.objectTypes.some((ot) => ot.id === "activity")).toBe(true);
    expect(pack.naming).toBeDefined();
  });
});
