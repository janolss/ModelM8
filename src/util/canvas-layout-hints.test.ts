import { describe, expect, it } from "vitest";
import { isControlPointBoundsError, withControlPointBoundsHint } from "./canvas-layout-hints.js";

describe("canvas-layout-hints", () => {
  it("detects control-point bounds errors", () => {
    expect(
      isControlPointBoundsError("Control point end must lie within the to-vertex bounds."),
    ).toBe(true);
    expect(isControlPointBoundsError("something else")).toBe(false);
  });

  it("appends delete→move→recreate hint for move context", () => {
    const out = withControlPointBoundsHint(
      "Control point end must lie within the to-vertex bounds.",
      "move",
    );
    expect(out).toContain("delete_canvas_edge");
    expect(out).toContain("move_canvas_vertices");
    expect(out).toContain("create_canvas_edge");
    expect(out).toContain("Hint");
  });

  it("leaves unrelated errors unchanged", () => {
    expect(withControlPointBoundsHint("Unknown vertexId", "move")).toBe("Unknown vertexId");
  });
});
