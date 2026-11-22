import { describe, expect, it } from "vitest";
import {
  isAndAlias,
  isExclusiveBranchAlias,
  isForbiddenJoinType,
  matchesObjectTypeFilter,
} from "./object-types.js";

describe("object-types", () => {
  it("detects forbidden join aliases", () => {
    expect(isForbiddenJoinType("join")).toBe(true);
    expect(isForbiddenJoinType("Förbinda")).toBe(true);
    expect(isForbiddenJoinType("activity")).toBe(false);
  });

  it("detects exclusive and parallel aliases", () => {
    expect(isExclusiveBranchAlias("vägval")).toBe(true);
    expect(isExclusiveBranchAlias("gateway")).toBe(true);
    expect(isAndAlias("parallel")).toBe(true);
    expect(isAndAlias("or")).toBe(false);
  });

  it("matches exclusive filters against stored decision types", () => {
    expect(matchesObjectTypeFilter("decision", "or")).toBe(true);
    expect(matchesObjectTypeFilter("or", "vägval")).toBe(true);
    expect(matchesObjectTypeFilter("and", "or")).toBe(false);
    expect(matchesObjectTypeFilter("activity", "join")).toBe(false);
  });
});
