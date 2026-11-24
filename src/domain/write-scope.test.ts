import { describe, expect, it } from "vitest";
import {
  assertClientWriteScope,
  extractCreatedRepositoryId,
  WriteScope,
  WriteScopeError,
} from "./write-scope.js";

function scope(overrides: Partial<ConstructorParameters<typeof WriteScope>[0]> = {}): WriteScope {
  return new WriteScope({
    requireLockBeforeWrite: true,
    autoLockOnCreate: true,
    unlockMode: "confirm_phrase",
    unlockPhrase: "UNLOCK-TEST",
    denyRepositoryIds: ["denied-id"],
    denyRepositoryNames: ["Inera IMS"],
    ...overrides,
  });
}

describe("WriteScope", () => {
  it("blocks writes when unlocked and requireLockBeforeWrite", () => {
    const s = scope();
    expect(() => s.assertWritable("repo-a")).toThrow(WriteScopeError);
    expect(() => s.assertWritable("repo-a")).toThrow(/unlocked/);
  });

  it("allows any non-denied repo when unlocked and requireLockBeforeWrite=false", () => {
    const s = scope({ requireLockBeforeWrite: false });
    expect(() => s.assertWritable("repo-a")).not.toThrow();
    expect(() => s.assertWritable("denied-id")).toThrow(/deny list/);
  });

  it("locks and enforces matching repositoryId", () => {
    const s = scope();
    s.lock({ repositoryId: "repo-a", repositoryName: "TechSeed-IMS" });
    expect(() => s.assertWritable("repo-a")).not.toThrow();
    expect(() => s.assertWritable("repo-b")).toThrow(/outside write scope/);
  });

  it("refuses lock to denied id or name", () => {
    const s = scope();
    expect(() => s.lock({ repositoryId: "denied-id" })).toThrow(/denied/);
    expect(() => s.lock({ repositoryId: "repo-x", repositoryName: "Inera IMS" })).toThrow(/denied/);
  });

  it("refuses lock switch without unlock", () => {
    const s = scope();
    s.lock({ repositoryId: "repo-a" });
    expect(() => s.lock({ repositoryId: "repo-b" })).toThrow(/already locked/);
  });

  it("auto-locks on create when unlocked", () => {
    const s = scope();
    const snap = s.tryAutoLockOnCreate({
      repositoryId: "new-repo",
      repositoryName: "TechSeed-IMS",
    });
    expect(snap?.locked).toBe(true);
    expect(snap?.lockSource).toBe("create_repository");
    expect(s.snapshot().repositoryId).toBe("new-repo");
  });

  it("does not auto-lock when already locked", () => {
    const s = scope();
    s.lock({ repositoryId: "repo-a" });
    expect(s.tryAutoLockOnCreate({ repositoryId: "new-repo", repositoryName: "X" })).toBeNull();
    expect(s.snapshot().repositoryId).toBe("repo-a");
  });

  it("unlocks with confirm_phrase", () => {
    const s = scope();
    s.lock({ repositoryId: "repo-a" });
    expect(() => s.unlock("wrong")).toThrow(/does not match/);
    const snap = s.unlock("UNLOCK-TEST");
    expect(snap.locked).toBe(false);
  });

  it("rejects unlock when phrase not configured", () => {
    const s = scope({ unlockPhrase: undefined });
    s.lock({ repositoryId: "repo-a" });
    expect(() => s.unlock("anything")).toThrow(/no unlock phrase/);
  });

  it("rejects unlock in restart mode", () => {
    const s = scope({ unlockMode: "restart" });
    s.lock({ repositoryId: "repo-a" });
    expect(() => s.unlock()).toThrow(/unlockMode=restart/);
  });

  it("unlocks freely in open mode", () => {
    const s = scope({ unlockMode: "open" });
    s.lock({ repositoryId: "repo-a" });
    expect(s.unlock().locked).toBe(false);
  });
});

describe("extractCreatedRepositoryId", () => {
  it("reads id/uuid/repositoryId", () => {
    expect(extractCreatedRepositoryId({ id: "a" })).toBe("a");
    expect(extractCreatedRepositoryId({ uuid: "b" })).toBe("b");
    expect(extractCreatedRepositoryId({ repositoryId: "c" })).toBe("c");
    expect(extractCreatedRepositoryId(null)).toBeUndefined();
  });
});

describe("assertClientWriteScope", () => {
  it("checks mutating pathParams and ignores GET", () => {
    const s = scope();
    s.lock({ repositoryId: "repo-a" });
    expect(() =>
      assertClientWriteScope(s, { method: "GET", pathParams: { repositoryId: "repo-b" } }),
    ).not.toThrow();
    expect(() =>
      assertClientWriteScope(s, { method: "POST", pathParams: { repositoryId: "repo-b" } }),
    ).toThrow(/outside write scope/);
  });

  it("checks body target repository fields", () => {
    const s = scope();
    s.lock({ repositoryId: "repo-a" });
    expect(() =>
      assertClientWriteScope(s, {
        method: "POST",
        body: { targetRepositoryId: "repo-b" },
      }),
    ).toThrow(/outside write scope/);
  });
});
