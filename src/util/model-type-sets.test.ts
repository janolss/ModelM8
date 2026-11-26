import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMethodologyPack } from "../methodology/loader.js";
import {
  DECISION_TYPES,
  isDecisionType,
  isValueBusinessObject,
  VALUE_BUSINESS_OBJECT_TYPES,
} from "./model-type-sets.js";
import { isAndAlias, isExclusiveBranchAlias } from "./object-types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("model-type-sets ↔ knowledge gateways aliases", () => {
  it("every gateways.yaml alias maps to exclusive or parallel helper", () => {
    const pack = loadMethodologyPack();
    const rule = pack.rules.gateways as { aliases?: string[] };
    const aliases = rule.aliases ?? [];
    expect(aliases.length).toBeGreaterThan(5);
    for (const a of aliases) {
      expect(
        isExclusiveBranchAlias(a) || isAndAlias(a) || isDecisionType(a),
        `alias "${a}" missing from object-types / DECISION_TYPES`,
      ).toBe(true);
    }
  });

  it("YAML file on disk still lists expected exclusive aliases", () => {
    const raw = readFileSync(join(root, "knowledge/rules/gateways.yaml"), "utf8");
    for (const a of ["vägval", "gateway", "or", "and", "beslut"]) {
      expect(raw).toContain(a);
    }
  });

  it("value BO set excludes document (review spine)", () => {
    expect(VALUE_BUSINESS_OBJECT_TYPES.has("document")).toBe(false);
    expect(isValueBusinessObject("businessObject")).toBe(true);
    expect(isValueBusinessObject("document")).toBe(false);
    expect(DECISION_TYPES.has("or")).toBe(true);
  });
});
