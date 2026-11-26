import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const ORIGINAL = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL);
});

function withBaseEnv() {
  process.env.TWO_C8_BASE_URL = "https://example.com/mt-backend/";
  process.env.TWO_C8_API_KEY = "test-key";
  delete process.env.TWO_C8_ALLOW_WRITES;
  delete process.env.TWO_C8_ALLOW_DELETES;
  delete process.env.TWO_C8_WRITE_MODE;
  delete process.env.TWO_C8_WRITE_REQUIRE_LOCK;
  delete process.env.TWO_C8_WRITE_AUTO_LOCK_ON_CREATE;
  delete process.env.TWO_C8_WRITE_UNLOCK_MODE;
  delete process.env.TWO_C8_WRITE_UNLOCK_PHRASE;
  delete process.env.TWO_C8_WRITE_DENY_REPOSITORY_IDS;
  delete process.env.TWO_C8_WRITE_DENY_REPOSITORY_NAMES;
  delete process.env.MCP_TRANSPORT;
  delete process.env.PORT;
  delete process.env.HOST;
  delete process.env.MCP_HTTP_AUTH_TOKEN;
  delete process.env.TWO_C8_DOCUMENT_READ_ROOTS;
}

describe("loadConfig", () => {
  it("loads defaults and strips trailing slash from baseUrl", () => {
    withBaseEnv();
    const cfg = loadConfig([]);
    expect(cfg.baseUrl).toBe("https://example.com/mt-backend");
    expect(cfg.allowWrites).toBe(false);
    expect(cfg.allowDeletes).toBe(false);
    expect(cfg.writeMode).toBe("draft");
    expect(cfg.transport).toBe("stdio");
    expect(cfg.port).toBe(3000);
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.httpAuthToken).toBeUndefined();
  });

  it("loads MCP_HTTP_AUTH_TOKEN", () => {
    withBaseEnv();
    process.env.MCP_HTTP_AUTH_TOKEN = " secret-token ";
    const cfg = loadConfig(["--http"]);
    expect(cfg.httpAuthToken).toBe("secret-token");
  });

  it("enables http via --http and bool env flags", () => {
    withBaseEnv();
    process.env.TWO_C8_ALLOW_WRITES = "true";
    process.env.TWO_C8_ALLOW_DELETES = "1";
    process.env.TWO_C8_WRITE_MODE = "direct";
    const cfg = loadConfig(["--http"]);
    expect(cfg.transport).toBe("http");
    expect(cfg.allowWrites).toBe(true);
    expect(cfg.allowDeletes).toBe(true);
    expect(cfg.writeMode).toBe("direct");
    expect(cfg.requireLockBeforeWrite).toBe(true);
    expect(cfg.autoLockOnCreate).toBe(true);
    expect(cfg.unlockMode).toBe("confirm_phrase");
  });

  it("parses write-scope policy env", () => {
    withBaseEnv();
    process.env.TWO_C8_WRITE_REQUIRE_LOCK = "false";
    process.env.TWO_C8_WRITE_AUTO_LOCK_ON_CREATE = "0";
    process.env.TWO_C8_WRITE_UNLOCK_MODE = "restart";
    process.env.TWO_C8_WRITE_UNLOCK_PHRASE = "SECRET";
    process.env.TWO_C8_WRITE_DENY_REPOSITORY_IDS = "id-a, id-b";
    process.env.TWO_C8_WRITE_DENY_REPOSITORY_NAMES = "Inera IMS, Lättkrängt IMS";
    const cfg = loadConfig([]);
    expect(cfg.requireLockBeforeWrite).toBe(false);
    expect(cfg.autoLockOnCreate).toBe(false);
    expect(cfg.unlockMode).toBe("restart");
    expect(cfg.unlockPhrase).toBe("SECRET");
    expect(cfg.denyRepositoryIds).toEqual(["id-a", "id-b"]);
    expect(cfg.denyRepositoryNames).toEqual(["Inera IMS", "Lättkrängt IMS"]);
  });

  it("throws when required env is missing", () => {
    delete process.env.TWO_C8_BASE_URL;
    delete process.env.TWO_C8_API_KEY;
    expect(() => loadConfig([])).toThrow(/TWO_C8_BASE_URL/);
  });
});
