import { describe, expect, it } from "vitest";
import { layoutBottomSatellites } from "./satellite-layout.js";

describe("layoutBottomSatellites (side-branch packing)", () => {
  const activity = { x: 200, y: 300, width: 75, height: 50 };

  it("centers primary role under activity; nests app to the RIGHT (not stacked)", () => {
    const roles = [{ title: "Servicedesk", width: 40, height: 40, packWidth: 80 }];
    const others = [{ title: "ServiceNow", width: 40, height: 40, packWidth: 90 }];
    const pos = layoutBottomSatellites({ activity, roles, others, gap: 12 });
    const role = pos.get("Servicedesk");
    const app = pos.get("ServiceNow");
    expect(role).toBeDefined();
    expect(app).toBeDefined();
    const actCx = activity.x + Math.floor(activity.width / 2);
    expect(role!.x).toBe(actCx - Math.floor(roles[0]!.width / 2));
    expect(app!.x).toBeGreaterThan(role!.x + roles[0]!.width);
    // Not stacked on same x
    expect(app!.x).not.toBe(role!.x);
  });

  it("places two apps nested further right of the role", () => {
    const roles = [{ title: "Incident Manager", width: 40, height: 40, packWidth: 100 }];
    const others = [
      { title: "App A", width: 40, height: 40, packWidth: 40 },
      { title: "App B", width: 40, height: 40, packWidth: 40 },
    ];
    const pos = layoutBottomSatellites({ activity, roles, others, gap: 12 });
    const role = pos.get("Incident Manager")!;
    const a = pos.get("App A")!;
    const b = pos.get("App B")!;
    expect(a.x).toBeGreaterThan(role.x + 40);
    expect(b.x).toBeGreaterThan(a.x + 40);
  });
});
