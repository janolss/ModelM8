import { describe, expect, it } from "vitest";
import { loadMethodologyPack } from "./loader.js";
import {
  checkBusinessObjectValue,
  checkNaming,
  getMethodologyTopic,
  isBusinessObjectStatusEcho,
  isCompoundPerformerTitle,
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

  it("flags dual-actor performer titles joined by och", () => {
    expect(isCompoundPerformerTitle("Projektägare och Projektkontoret")).toBe(true);
    expect(isCompoundPerformerTitle("Dokument¬ägare och kvalitets¬funktion")).toBe(true);
    expect(isCompoundPerformerTitle("Hälso- och sjukvårdschef")).toBe(false);
    expect(isCompoundPerformerTitle("Projektägare")).toBe(false);

    const bad = checkNaming(pack, "role", "Projektägare och Projektkontoret");
    expect(bad.pass).toBe(false);
    expect(bad.hint).toMatch(/two performer|RACI/i);

    const coordinated = checkNaming(pack, "position", "Hälso- och sjukvårdschef");
    expect(coordinated.pass).toBe(true);
  });

  it("get_methodology(raci) surfaces compound-performer guidance", () => {
    const topic = getMethodologyTopic(pack, "raci") as { kind?: string; summary?: string };
    expect(topic.kind).toBe("raci");
    expect(topic.summary).toMatch(/och/i);
  });
});
