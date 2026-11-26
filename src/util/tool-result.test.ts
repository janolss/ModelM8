import { describe, expect, it } from "vitest";
import { jsonResult, MAX_JSON_RESULT_CHARS } from "./tool-result.js";

describe("jsonResult size guard", () => {
  it("pretty-prints small payloads", () => {
    const r = jsonResult({ ok: true, n: 1 });
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain('"ok": true');
  });

  it("falls back to compact then truncated preview for huge payloads", () => {
    const huge = { blob: "x".repeat(MAX_JSON_RESULT_CHARS) };
    const r = jsonResult(huge);
    const text = (r.content[0] as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(MAX_JSON_RESULT_CHARS + 200);
    expect(text).toMatch(/truncated|preview/i);
  });
});
