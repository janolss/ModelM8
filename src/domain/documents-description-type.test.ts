import { describe, expect, it } from "vitest";
import { normalizeDescriptionTypeBody } from "./documents.js";

describe("normalizeDescriptionTypeBody", () => {
  it("fills rich-text defaults and connectedTo; strips entries", () => {
    const out = normalizeDescriptionTypeBody({
      titles: { "lang-1": { title: "Purpose" } },
      dataType: "STRING",
      inputType: "TEXTAREA",
      entries: [{ bad: true }],
    });
    expect(out.entries).toBeUndefined();
    expect(out.dataType).toBe("se.conciliate.rich.text");
    expect(out.inputType).toBe("rich-text-editor");
    expect(Array.isArray(out.connectedTo) && (out.connectedTo as unknown[]).length).toBeGreaterThan(
      0,
    );
  });

  it("preserves explicit connectedTo", () => {
    const connectedTo = [{ type: "PROCESS", position: 2, hidden: "" }];
    const out = normalizeDescriptionTypeBody({
      titles: { "lang-1": { title: "Scope" } },
      connectedTo,
    });
    expect(out.connectedTo).toEqual(connectedTo);
    expect(out.dataType).toBe("se.conciliate.rich.text");
  });
});
