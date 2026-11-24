export type UnlockMode = "confirm_phrase" | "restart" | "open";
export type LockSource = "explicit" | "create_repository";

export interface WriteScopePolicy {
  requireLockBeforeWrite: boolean;
  autoLockOnCreate: boolean;
  unlockMode: UnlockMode;
  /** Required when unlockMode is confirm_phrase. Not exposed in tool descriptions. */
  unlockPhrase?: string;
  denyRepositoryIds: string[];
  /** Case-insensitive exact name match (trimmed). */
  denyRepositoryNames: string[];
}

export interface WriteScopeSnapshot {
  locked: boolean;
  repositoryId: string | null;
  repositoryName: string | null;
  lockedAt: string | null;
  lockSource: LockSource | null;
  denyRepositoryIds: string[];
  denyRepositoryNames: string[];
  policy: {
    unlockMode: UnlockMode;
    autoLockOnCreate: boolean;
    requireLockBeforeWrite: boolean;
    unlockPhraseConfigured: boolean;
  };
}

export class WriteScopeError extends Error {
  readonly code:
    | "not_locked"
    | "repo_mismatch"
    | "denied"
    | "already_locked"
    | "unlock_rejected"
    | "name_mismatch"
    | "invalid";

  constructor(code: WriteScopeError["code"], message: string) {
    super(message);
    this.name = "WriteScopeError";
    this.code = code;
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export class WriteScope {
  private repositoryId: string | null = null;
  private repositoryName: string | null = null;
  private lockedAt: string | null = null;
  private lockSource: LockSource | null = null;

  constructor(private readonly policy: WriteScopePolicy) {}

  getPolicy(): WriteScopePolicy {
    return this.policy;
  }

  snapshot(): WriteScopeSnapshot {
    return {
      locked: this.repositoryId !== null,
      repositoryId: this.repositoryId,
      repositoryName: this.repositoryName,
      lockedAt: this.lockedAt,
      lockSource: this.lockSource,
      denyRepositoryIds: [...this.policy.denyRepositoryIds],
      denyRepositoryNames: [...this.policy.denyRepositoryNames],
      policy: {
        unlockMode: this.policy.unlockMode,
        autoLockOnCreate: this.policy.autoLockOnCreate,
        requireLockBeforeWrite: this.policy.requireLockBeforeWrite,
        unlockPhraseConfigured: Boolean(this.policy.unlockPhrase),
      },
    };
  }

  isDeniedId(repositoryId: string): boolean {
    return this.policy.denyRepositoryIds.includes(repositoryId);
  }

  isDeniedName(repositoryName: string): boolean {
    const n = normalizeName(repositoryName);
    return this.policy.denyRepositoryNames.some((d) => normalizeName(d) === n);
  }

  /**
   * Enforce write scope for a mutating call targeting repositoryId.
   * No-op when writes are unrestricted and unlocked with requireLockBeforeWrite=false.
   */
  assertWritable(repositoryId: string): void {
    if (!repositoryId?.trim()) {
      throw new WriteScopeError("invalid", "Write blocked: repositoryId is missing or empty.");
    }

    if (this.isDeniedId(repositoryId)) {
      throw new WriteScopeError(
        "denied",
        `Write blocked: repositoryId ${repositoryId} is on the write deny list. ` +
          "Call get_write_scope. Do not retry other repositories.",
      );
    }

    if (this.repositoryId === null) {
      if (this.policy.requireLockBeforeWrite) {
        throw new WriteScopeError(
          "not_locked",
          "Write blocked: write scope is unlocked. " +
            "Call lock_write_repository with the confirmed target repositoryId first " +
            "(or create_repository, which auto-locks when enabled). " +
            "Call get_write_scope. Do not retry other repositories.",
        );
      }
      return;
    }

    if (repositoryId !== this.repositoryId) {
      throw new WriteScopeError(
        "repo_mismatch",
        `Write blocked: repositoryId ${repositoryId} is outside write scope ` +
          `(locked to ${this.repositoryId}` +
          `${this.repositoryName ? ` ${this.repositoryName}` : ""}). ` +
          "Call get_write_scope. Do not retry other repositories.",
      );
    }
  }

  lock(args: {
    repositoryId: string;
    repositoryName?: string;
    source?: LockSource;
  }): WriteScopeSnapshot {
    const id = args.repositoryId.trim();
    if (!id) {
      throw new WriteScopeError("invalid", "repositoryId is required to lock write scope.");
    }

    if (this.isDeniedId(id)) {
      throw new WriteScopeError("denied", `Cannot lock write scope to denied repositoryId ${id}.`);
    }

    if (args.repositoryName && this.isDeniedName(args.repositoryName)) {
      throw new WriteScopeError(
        "denied",
        `Cannot lock write scope to denied repository name "${args.repositoryName}".`,
      );
    }

    if (this.repositoryId !== null && this.repositoryId !== id) {
      throw new WriteScopeError(
        "already_locked",
        `Write scope is already locked to ${this.repositoryId}` +
          `${this.repositoryName ? ` (${this.repositoryName})` : ""}. ` +
          "Unlock first (per server unlock policy), then lock the new repository.",
      );
    }

    if (this.repositoryId === id) {
      // Refresh optional name if provided
      if (args.repositoryName) {
        this.repositoryName = args.repositoryName;
      }
      return this.snapshot();
    }

    this.repositoryId = id;
    this.repositoryName = args.repositoryName ?? null;
    this.lockedAt = new Date().toISOString();
    this.lockSource = args.source ?? "explicit";
    return this.snapshot();
  }

  /**
   * Auto-lock after create_repository when policy allows and scope is unlocked.
   * Returns null when no lock change was made.
   */
  tryAutoLockOnCreate(args: {
    repositoryId: string;
    repositoryName?: string;
  }): WriteScopeSnapshot | null {
    if (!this.policy.autoLockOnCreate) {
      return null;
    }
    if (this.repositoryId !== null) {
      return null;
    }
    return this.lock({
      repositoryId: args.repositoryId,
      repositoryName: args.repositoryName,
      source: "create_repository",
    });
  }

  unlock(confirm?: string): WriteScopeSnapshot {
    if (this.repositoryId === null) {
      return this.snapshot();
    }

    switch (this.policy.unlockMode) {
      case "restart":
        throw new WriteScopeError(
          "unlock_rejected",
          "Unlock rejected: unlockMode=restart. Restart the modelM8 process/container to clear write scope.",
        );
      case "open":
        break;
      case "confirm_phrase": {
        const phrase = this.policy.unlockPhrase;
        if (!phrase) {
          throw new WriteScopeError(
            "unlock_rejected",
            "Unlock rejected: unlockMode=confirm_phrase but no unlock phrase is configured. " +
              "Set TWO_C8_WRITE_UNLOCK_PHRASE or restart modelM8 to clear write scope.",
          );
        }
        if (confirm !== phrase) {
          throw new WriteScopeError(
            "unlock_rejected",
            "Unlock rejected: confirm phrase does not match. " +
              "Operator must supply the configured phrase, or restart modelM8.",
          );
        }
        break;
      }
      default:
        throw new WriteScopeError("unlock_rejected", `Unlock rejected: unknown unlockMode.`);
    }

    this.repositoryId = null;
    this.repositoryName = null;
    this.lockedAt = null;
    this.lockSource = null;
    return this.snapshot();
  }
}

/** Extract repository UUID from create_repository API payloads. */
export function extractCreatedRepositoryId(created: unknown): string | undefined {
  if (!created || typeof created !== "object") {
    return undefined;
  }
  const o = created as Record<string, unknown>;
  for (const key of ["id", "uuid", "repositoryId"] as const) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  return undefined;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Safetynet for TwoC8Client: assert pathParams.repositoryId on mutating calls.
 * Also checks common body target fields when present.
 */
export function assertClientWriteScope(
  scope: WriteScope,
  options: {
    method?: string;
    pathParams?: Record<string, string>;
    body?: unknown;
  },
): void {
  const method = (options.method ?? "GET").toUpperCase();
  if (!MUTATING.has(method)) {
    return;
  }

  const fromPath = options.pathParams?.repositoryId;
  if (fromPath) {
    scope.assertWritable(fromPath);
  }

  if (options.body && typeof options.body === "object" && !Array.isArray(options.body)) {
    const body = options.body as Record<string, unknown>;
    for (const key of [
      "targetRepositoryId",
      "targetRepository",
      "destinationRepositoryId",
      "repository",
    ] as const) {
      const v = body[key];
      if (typeof v === "string" && v.trim()) {
        scope.assertWritable(v.trim());
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        const id = (v as Record<string, unknown>).id;
        if (typeof id === "string" && id.trim()) {
          scope.assertWritable(id.trim());
        }
      }
    }
  }
}
