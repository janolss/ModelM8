import { describe, expect, it } from "vitest";
import type { CanvasDto, FlowStep } from "../api/types.js";
import { reviewProcessCanvas } from "./process-review.js";

function vertex(
  uuid: string,
  objectType: string,
  x: number,
  y: number,
  title: string,
): NonNullable<CanvasDto["vertices"]>[number] {
  return {
    uuid,
    objectType,
    x,
    y,
    width: 75,
    height: 50,
    labels: { lang: { title } },
  };
}

describe("reviewProcessCanvas", () => {
  it("flags missing performer and missing BO I/O on a lone activity", () => {
    const steps: FlowStep[] = [
      {
        vertexId: "v-act",
        objectType: "activity",
        title: "Registrera order",
        x: 200,
        y: 120,
        width: 75,
        height: 50,
        inputs: [],
        outputs: [],
        responsible: [],
      },
    ];
    const canvas: CanvasDto = {
      vertices: [vertex("v-act", "activity", 200, 120, "Registrera order")],
      edges: [],
    };
    const result = reviewProcessCanvas({ steps, canvas, modelKind: "process" });
    const ids = result.findings.map((f) => f.id);
    expect(ids).toContain("activity-missing-input-bo");
    expect(ids).toContain("activity-missing-output-bo");
    expect(ids).toContain("activity-missing-performer");
    expect(result.summary.ok).toBe(false);
  });

  it("flags forbidden join symbols", () => {
    const steps: FlowStep[] = [
      {
        vertexId: "v-join",
        objectType: "join",
        title: "Förbinda",
        x: 200,
        y: 120,
      },
    ];
    const canvas: CanvasDto = {
      vertices: [vertex("v-join", "join", 200, 120, "Förbinda")],
      edges: [],
    };
    const result = reviewProcessCanvas({ steps, canvas, modelKind: "process" });
    expect(result.findings.some((f) => f.id === "forbidden-join")).toBe(true);
  });

  it("accepts a minimal BO → activity → BO chain with performer", () => {
    const steps: FlowStep[] = [
      {
        vertexId: "v-in",
        objectType: "businessObject",
        title: "Kundbehov",
        x: 80,
        y: 135,
        width: 75,
        height: 18,
        outputs: [{ vertexId: "v-act", objectType: "activity", title: "Registrera order" }],
      },
      {
        vertexId: "v-act",
        objectType: "activity",
        title: "Registrera order",
        x: 200,
        y: 119,
        width: 75,
        height: 50,
        inputs: [{ vertexId: "v-in", objectType: "businessObject", title: "Kundbehov" }],
        outputs: [{ vertexId: "v-out", objectType: "businessObject", title: "Order" }],
        responsible: [{ vertexId: "v-role", objectType: "role", title: "Orderadministratör" }],
      },
      {
        vertexId: "v-out",
        objectType: "businessObject",
        title: "Order",
        x: 320,
        y: 135,
        width: 75,
        height: 18,
        inputs: [{ vertexId: "v-act", objectType: "activity", title: "Registrera order" }],
      },
      {
        vertexId: "v-role",
        objectType: "role",
        title: "Orderadministratör",
        x: 200,
        y: 220,
        width: 75,
        height: 40,
      },
    ];
    const canvas: CanvasDto = {
      vertices: [
        vertex("v-in", "businessObject", 80, 135, "Kundbehov"),
        vertex("v-act", "activity", 200, 119, "Registrera order"),
        vertex("v-out", "businessObject", 320, 135, "Order"),
        vertex("v-role", "role", 200, 220, "Orderadministratör"),
      ],
      edges: [
        {
          uuid: "e1",
          edgeType: "flow",
          fromVertex: "v-in",
          toVertex: "v-act",
        },
        {
          uuid: "e2",
          edgeType: "flow",
          fromVertex: "v-act",
          toVertex: "v-out",
        },
        {
          uuid: "e3",
          edgeType: "raciresponsible",
          fromVertex: "v-role",
          toVertex: "v-act",
        },
      ],
    };
    const result = reviewProcessCanvas({ steps, canvas, modelKind: "process" });
    const methodologyErrors = result.findings.filter(
      (f) => f.category === "methodology" && f.severity === "error",
    );
    expect(methodologyErrors.map((f) => f.id)).toEqual([]);
  });
});
