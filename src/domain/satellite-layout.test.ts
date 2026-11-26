import { describe, expect, it } from "vitest";
import { layoutBottomSatellites } from "./satellite-layout.js";

describe("layoutBottomSatellites (side-branch packing)", () => {
  const activity = { x: 200, y: 300, width: 75, height: 50 };

  it("centers primary role under activity; nests app to the RIGHT (not stacked)", () => {
    const roles = [{ id: "role:1", title: "Servicedesk", width: 40, height: 40, packWidth: 80 }];
    const others = [{ id: "app:1", title: "ServiceNow", width: 40, height: 40, packWidth: 90 }];
    const pos = layoutBottomSatellites({ activity, roles, others, gap: 12 });
    const role = pos.get("role:1");
    const app = pos.get("app:1");
    expect(role).toBeDefined();
    expect(app).toBeDefined();
    const actCx = activity.x + Math.floor(activity.width / 2);
    expect(role!.x).toBe(actCx - Math.floor(roles[0]!.width / 2));
    expect(app!.x).toBeGreaterThan(role!.x + roles[0]!.width);
    expect(app!.x).not.toBe(role!.x);
  });

  it("places two apps nested further right of the role", () => {
    const roles = [
      { id: "role:im", title: "Incident Manager", width: 40, height: 40, packWidth: 100 },
    ];
    const others = [
      { id: "app:a", title: "App A", width: 40, height: 40, packWidth: 40 },
      { id: "app:b", title: "App B", width: 40, height: 40, packWidth: 40 },
    ];
    const pos = layoutBottomSatellites({ activity, roles, others, gap: 12 });
    const role = pos.get("role:im")!;
    const a = pos.get("app:a")!;
    const b = pos.get("app:b")!;
    expect(a.x).toBeGreaterThan(role.x + 40);
    expect(b.x).toBeGreaterThan(a.x + 40);
  });

  it("keeps distinct positions when two satellites share the same title", () => {
    const roles = [{ id: "role:dup-0", title: "Same", width: 40, height: 40, packWidth: 40 }];
    const others = [{ id: "app:dup-1", title: "Same", width: 40, height: 40, packWidth: 40 }];
    const pos = layoutBottomSatellites({ activity, roles, others, gap: 12 });
    expect(pos.size).toBe(2);
    expect(pos.get("role:dup-0")).toBeDefined();
    expect(pos.get("app:dup-1")).toBeDefined();
    expect(pos.get("role:dup-0")!.x).not.toBe(pos.get("app:dup-1")!.x);
  });
});
