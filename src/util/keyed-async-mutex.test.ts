import { describe, expect, it } from "vitest";
import { KeyedAsyncMutex } from "./keyed-async-mutex.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("KeyedAsyncMutex", () => {
  it("serializes work for the same key", async () => {
    const m = new KeyedAsyncMutex();
    const order: string[] = [];

    const a = m.runExclusive("sym-a", async () => {
      order.push("a-start");
      await delay(30);
      order.push("a-end");
      return 1;
    });
    const b = m.runExclusive("sym-a", async () => {
      order.push("b-start");
      await delay(5);
      order.push("b-end");
      return 2;
    });

    expect(await Promise.all([a, b])).toEqual([1, 2]);
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("allows different keys in parallel", async () => {
    const m = new KeyedAsyncMutex();
    let concurrent = 0;
    let maxConcurrent = 0;

    const run = (key: string) =>
      m.runExclusive(key, async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await delay(25);
        concurrent -= 1;
      });

    await Promise.all([run("a"), run("b"), run("c")]);
    expect(maxConcurrent).toBeGreaterThanOrEqual(2);
  });

  it("releases the key after failure so the next caller can run", async () => {
    const m = new KeyedAsyncMutex();
    await expect(
      m.runExclusive("x", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const value = await m.runExclusive("x", async () => "ok");
    expect(value).toBe("ok");
    expect(m.pendingKeyCount()).toBe(0);
  });
});
