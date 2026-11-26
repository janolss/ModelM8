import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency.js";

describe("mapWithConcurrency", () => {
  it("preserves order and respects concurrency", async () => {
    let live = 0;
    let peak = 0;
    const items = [1, 2, 3, 4, 5, 6];
    const out = await mapWithConcurrency(items, 2, async (n) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("handles empty input", async () => {
    expect(await mapWithConcurrency([], 4, async (x) => x)).toEqual([]);
  });
});
