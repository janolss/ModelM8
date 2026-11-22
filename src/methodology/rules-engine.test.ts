import { describe, expect, it } from "vitest";
import { loadMethodologyPack } from "./loader.js";
import {
  checkBusinessObjectValue,
  checkNaming,
  isBusinessObjectStatusEcho,
} from "./rules-engine.js";

describe("rules-engine naming", () => {
  const pack = loadMethodologyPack();

  it("checkNaming accepts infinitive activity titles", () => {
    const ok = checkNaming(pack, "activity", "Registrera order");
    expect(ok.pass).toBe(true);
  });

  it("detects status-echo BO titles", () => {
    expect(isBusinessObjectStatusEcho("Godkänd order", "Godkänna order")).toBe(true);
    expect(isBusinessObjectStatusEcho("Orderbekräftelse", "Registrera order")).toBe(false);
  });

  it("checkBusinessObjectValue fails on status echoes", () => {
    const bad = checkBusinessObjectValue(pack, "Dokumenterad risk", "Dokumentera risk");
    expect(bad.pass).toBe(false);
    expect(bad.hint).toMatch(/value|artefact|capability/i);

    const good = checkBusinessObjectValue(pack, "Riskanalys", "Dokumentera risk");
    expect(good.pass).toBe(true);
  });
});
