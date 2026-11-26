export type TransportMode = "stdio" | "http";
export type WriteMode = "draft" | "direct";
export type UnlockMode = "confirm_phrase" | "restart" | "open";

export interface AppConfig {
  baseUrl: string;
  apiKey: string;
  allowWrites: boolean;
  /** Separate gate for destructive model delete tools. */
  allowDeletes: boolean;
  writeMode: WriteMode;
  transport: TransportMode;
  port: number;
  host: string;
  knowledgeDir?: string;
  /** Require lock_write_repository (or auto-lock) before mutating repo calls. */
  requireLockBeforeWrite: boolean;
  /** After create_repository, lock scope to the new repo when unlocked. */
  autoLockOnCreate: boolean;
  unlockMode: UnlockMode;
  /** Operator phrase for unlockMode=confirm_phrase. Not shown in tool schemas. */
  unlockPhrase?: string;
  denyRepositoryIds: string[];
  denyRepositoryNames: string[];
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseCsv(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseUnlockMode(value: string | undefined): UnlockMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "restart" || normalized === "open" || normalized === "confirm_phrase") {
    return normalized;
  }
  return "confirm_phrase";
}

export function loadConfig(argv: string[] = process.argv.slice(2)): AppConfig {
  const wantsHttp =
    argv.includes("--http") || process.env.MCP_TRANSPORT?.trim().toLowerCase() === "http";

  const baseUrl = requireEnv("TWO_C8_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnv("TWO_C8_API_KEY");
  const allowWrites = parseBool(process.env.TWO_C8_ALLOW_WRITES, false);
  const allowDeletes = parseBool(process.env.TWO_C8_ALLOW_DELETES, false);
  const writeModeRaw = process.env.TWO_C8_WRITE_MODE?.trim().toLowerCase();
  const writeMode: WriteMode = writeModeRaw === "direct" ? "direct" : "draft";
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST?.trim() || "127.0.0.1";
  const knowledgeDir = process.env.KNOWLEDGE_DIR?.trim() || undefined;
  // Default true when mutating tools may be on; explicit false still wins.
  const requireLockBeforeWrite = parseBool(process.env.TWO_C8_WRITE_REQUIRE_LOCK, true);
  const autoLockOnCreate = parseBool(process.env.TWO_C8_WRITE_AUTO_LOCK_ON_CREATE, true);
  const unlockMode = parseUnlockMode(process.env.TWO_C8_WRITE_UNLOCK_MODE);
  const unlockPhrase = process.env.TWO_C8_WRITE_UNLOCK_PHRASE?.trim() || undefined;
  const denyRepositoryIds = parseCsv(process.env.TWO_C8_WRITE_DENY_REPOSITORY_IDS);
  const denyRepositoryNames = parseCsv(process.env.TWO_C8_WRITE_DENY_REPOSITORY_NAMES);

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  return {
    baseUrl,
    apiKey,
    allowWrites,
    allowDeletes,
    writeMode,
    transport: wantsHttp ? "http" : "stdio",
    port,
    host,
    knowledgeDir,
    requireLockBeforeWrite,
    autoLockOnCreate,
    unlockMode,
    unlockPhrase,
    denyRepositoryIds,
    denyRepositoryNames,
  };
}
