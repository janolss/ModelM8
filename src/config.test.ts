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
  delete process.env.MCP_TRANSPORT;
  delete process.env.PORT;
  delete process.env.HOST;
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
  });

  it("throws when required env is missing", () => {
    delete process.env.TWO_C8_BASE_URL;
    delete process.env.TWO_C8_API_KEY;
    expect(() => loadConfig([])).toThrow(/TWO_C8_BASE_URL/);
  });
});
