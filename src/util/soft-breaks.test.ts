import { describe, expect, it } from "vitest";
import {
  applySoftBreaks,
  normalizeSoftBreaks,
  SOFT_HYPHEN,
  stripSoftBreaks,
} from "./soft-breaks.js";

describe("soft-breaks", () => {
  it("breaks leveransöverlämning at the compound boundary", () => {
    expect(applySoftBreaks("leveransöverlämning")).toBe(`leverans${SOFT_HYPHEN}överlämning`);
  });

  it("breaks role compounds before known suffixes", () => {
    expect(applySoftBreaks("Personalansvarig")).toBe(`Personal${SOFT_HYPHEN}ansvarig`);
    expect(applySoftBreaks("Servicetekniker")).toBe(`Service${SOFT_HYPHEN}tekniker`);
  });

  it("preserves whitespace and only soft-breaks long tokens", () => {
    expect(applySoftBreaks("Förbereda leveransöverlämning")).toBe(
      `Förbereda leverans${SOFT_HYPHEN}överlämning`,
    );
  });

  it("preserves explicit soft breaks from UI/proposal", () => {
    expect(applySoftBreaks(`Redan${SOFT_HYPHEN}bruten`)).toBe(`Redan${SOFT_HYPHEN}bruten`);
    expect(applySoftBreaks("Redan¬bruten")).toBe(`Redan${SOFT_HYPHEN}bruten`);
  });

  it("leaves short tokens unchanged", () => {
    expect(applySoftBreaks("Registrera order")).toBe("Registrera order");
  });

  it("stripSoftBreaks removes both ¬ and soft hyphen", () => {
    expect(stripSoftBreaks(`a${SOFT_HYPHEN}b¬c`)).toBe("abc");
  });

  it("normalizeSoftBreaks maps ¬ to soft hyphen", () => {
    expect(normalizeSoftBreaks("a¬b")).toBe(`a${SOFT_HYPHEN}b`);
  });
});
