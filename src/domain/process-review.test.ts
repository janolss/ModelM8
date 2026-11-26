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
    expect(result.findings.map((f) => f.id)).not.toContain("orphan-performer-vertex");
    expect(result.findings.map((f) => f.id)).not.toContain("compound-performer-title");
  });

  it("flags compound performer titles, orphan roles, and role→CONTROLS", () => {
    const steps: FlowStep[] = [
      {
        vertexId: "v-act",
        objectType: "activity",
        title: "Godkänna plan",
        x: 200,
        y: 120,
        width: 75,
        height: 50,
        inputs: [],
        outputs: [],
        responsible: [
          {
            vertexId: "v-dual",
            objectType: "role",
            title: "Projektägare och Projektkontoret",
          },
        ],
      },
      {
        vertexId: "v-dual",
        objectType: "role",
        title: "Projektägare och Projektkontoret",
        x: 200,
        y: 220,
      },
      {
        vertexId: "v-orphan",
        objectType: "role",
        title: "Kvalitetsfunktion",
        x: 40,
        y: 220,
      },
      {
        vertexId: "v-doc",
        objectType: "core_document",
        title: "Checklista",
        x: 40,
        y: 40,
      },
    ];
    const canvas: CanvasDto = {
      vertices: [
        vertex("v-act", "activity", 200, 120, "Godkänna plan"),
        vertex("v-dual", "role", 200, 220, "Projektägare och Projektkontoret"),
        vertex("v-orphan", "role", 40, 220, "Kvalitetsfunktion"),
        {
          ...vertex("v-doc", "core_document", 40, 40, "Checklista"),
          width: 60,
          height: 40,
        },
      ],
      edges: [
        {
          uuid: "e-raci",
          edgeType: "raciresponsible",
          fromVertex: "v-dual",
          toVertex: "v-act",
        },
        {
          uuid: "e-ctrl",
          edgeType: "controls",
          fromVertex: "v-orphan",
          toVertex: "v-doc",
        },
      ],
    };
    const result = reviewProcessCanvas({ steps, canvas, modelKind: "process" });
    const ids = result.findings.map((f) => f.id);
    expect(ids).toContain("compound-performer-title");
    expect(ids).toContain("orphan-performer-vertex");
    expect(ids).toContain("role-controls-document");
  });

  it("flags wide overview gaps and three-band approved exceptions", () => {
    const steps: FlowStep[] = [
      {
        vertexId: "v-in",
        objectType: "businessObject",
        title: "Lead",
        x: 50,
        y: 191,
        width: 75,
        height: 18,
        outputs: [{ vertexId: "v-p", objectType: "process", title: "Sell" }],
      },
      {
        vertexId: "v-p",
        objectType: "process",
        title: "Sell",
        x: 250,
        y: 175,
        width: 75,
        height: 50,
        inputs: [{ vertexId: "v-in", objectType: "businessObject", title: "Lead" }],
        outputs: [{ vertexId: "v-out", objectType: "businessObject", title: "Package" }],
      },
      {
        vertexId: "v-out",
        objectType: "businessObject",
        title: "Package",
        x: 450,
        y: 191,
        width: 75,
        height: 18,
        inputs: [{ vertexId: "v-p", objectType: "process", title: "Sell" }],
      },
      {
        vertexId: "v-mgmt",
        objectType: "process",
        title: "Audit",
        x: 100,
        y: 40,
        width: 75,
        height: 50,
        inputs: [],
        outputs: [],
      },
    ];
    const canvas: CanvasDto = {
      vertices: [
        vertex("v-in", "businessObject", 50, 191, "Lead"),
        vertex("v-p", "process", 250, 175, "Sell"),
        vertex("v-out", "businessObject", 450, 191, "Package"),
        vertex("v-mgmt", "process", 100, 40, "Audit"),
      ],
      edges: [
        { uuid: "e1", edgeType: "flow", fromVertex: "v-in", toVertex: "v-p" },
        { uuid: "e2", edgeType: "flow", fromVertex: "v-p", toVertex: "v-out" },
      ],
    };
    // gap in→p = 250-(50+75)=125; with gapX=40 map threshold=80 → spacing-too-wide
    const wide = reviewProcessCanvas({
      steps,
      canvas,
      modelKind: "process-map",
      distance: { top: 40, left: 40, bottom: 40, right: 40 },
      layoutMode: "threeBand",
    });
    expect(wide.findings.some((f) => f.id === "spacing-too-wide")).toBe(true);
    const approved = wide.findings.find((f) => f.id === "process-missing-input-bo-approved");
    expect(approved?.severity).toBe("info");
    expect(wide.findings.some((f) => f.id === "process-missing-input-bo")).toBe(false);
  });

  it("does not flag coordinated X- och Y… performer titles as compound", () => {
    const steps: FlowStep[] = [
      {
        vertexId: "v-act",
        objectType: "activity",
        title: "Leder vården",
        x: 200,
        y: 120,
        inputs: [{ vertexId: "v-in", objectType: "businessObject", title: "Behov" }],
        outputs: [{ vertexId: "v-out", objectType: "businessObject", title: "Beslut" }],
        responsible: [
          { vertexId: "v-role", objectType: "position", title: "Hälso- och sjukvårdschef" },
        ],
      },
      {
        vertexId: "v-in",
        objectType: "businessObject",
        title: "Behov",
        x: 80,
        y: 135,
      },
      {
        vertexId: "v-out",
        objectType: "businessObject",
        title: "Beslut",
        x: 320,
        y: 135,
      },
      {
        vertexId: "v-role",
        objectType: "position",
        title: "Hälso- och sjukvårdschef",
        x: 200,
        y: 220,
      },
    ];
    const canvas: CanvasDto = {
      vertices: [
        vertex("v-in", "businessObject", 80, 135, "Behov"),
        vertex("v-act", "activity", 200, 120, "Leder vården"),
        vertex("v-out", "businessObject", 320, 135, "Beslut"),
        vertex("v-role", "position", 200, 220, "Hälso- och sjukvårdschef"),
      ],
      edges: [
        { uuid: "e1", edgeType: "flow", fromVertex: "v-in", toVertex: "v-act" },
        { uuid: "e2", edgeType: "flow", fromVertex: "v-act", toVertex: "v-out" },
        {
          uuid: "e3",
          edgeType: "raciresponsible",
          fromVertex: "v-role",
          toVertex: "v-act",
        },
      ],
    };
    const result = reviewProcessCanvas({ steps, canvas, modelKind: "process" });
    expect(result.findings.map((f) => f.id)).not.toContain("compound-performer-title");
    expect(result.findings.map((f) => f.id)).not.toContain("orphan-performer-vertex");
  });
});
