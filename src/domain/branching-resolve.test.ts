import { describe, expect, it } from "vitest";
import { resolveBranchingObjectType } from "./branching-resolve.js";

describe("resolveBranchingObjectType", () => {
  it.each(["gateway", "vägval", "xor", "decision", "or"])("maps exclusive ask %s → or", (ask) => {
    const r = resolveBranchingObjectType(ask);
    expect(r.intent).toBe("exclusive");
    expect(r.useObjectType).toBe("or");
    expect(r.neverUse).toContain("gateway");
    expect(r.neverUse).toContain("join");
  });

  it.each(["and", "parallel", "och"])("maps parallel ask %s → and", (ask) => {
    const r = resolveBranchingObjectType(ask);
    expect(r.intent).toBe("parallel");
    expect(r.useObjectType).toBe("and");
  });

  it.each(["join", "förbinda"])("forbids %s", (ask) => {
    const r = resolveBranchingObjectType(ask);
    expect(r.intent).toBe("forbidden");
    expect(r.useObjectType).toBeNull();
  });

  it("returns unknown for unrelated terms", () => {
    const r = resolveBranchingObjectType("swimlane");
    expect(r.intent).toBe("unknown");
    expect(r.useObjectType).toBeNull();
  });
});
