import { describe, expect, it } from "vitest";
import {
  filesystemPathsFromDocumentRootValues,
  isBlockedHostnameLiteral,
  isNonLoopbackBindHost,
  isPathInsideRoots,
  isPrivateOrLoopbackIp,
  parseDocumentReadRootsEnv,
} from "./document-fetch-guard.js";

describe("document-fetch-guard", () => {
  it("detects private and loopback IPv4", () => {
    expect(isPrivateOrLoopbackIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("10.1.2.3")).toBe(true);
    expect(isPrivateOrLoopbackIp("192.168.0.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("172.16.5.5")).toBe(true);
    expect(isPrivateOrLoopbackIp("169.254.169.254")).toBe(true);
    expect(isPrivateOrLoopbackIp("8.8.8.8")).toBe(false);
  });

  it("blocks localhost hostname literals", () => {
    expect(isBlockedHostnameLiteral("localhost")).toBe(true);
    expect(isBlockedHostnameLiteral("127.0.0.1")).toBe(true);
    expect(isBlockedHostnameLiteral("example.com")).toBe(false);
  });

  it("checks path under roots", () => {
    expect(isPathInsideRoots("/docs/a/b.pdf", ["/docs"])).toBe(true);
    expect(isPathInsideRoots("/docs/a/b.pdf", ["/other"])).toBe(false);
    expect(isPathInsideRoots("/docs-evil/x", ["/docs"])).toBe(false);
  });

  it("parses file roots from document root values and env", () => {
    const paths = filesystemPathsFromDocumentRootValues([
      "file:///Users/jan/library/",
      "https://example.com/docs/",
    ]);
    expect(paths.some((p) => p.includes("library"))).toBe(true);
    expect(parseDocumentReadRootsEnv("/a,/b")).toEqual(["/a", "/b"]);
  });

  it("flags non-loopback bind hosts", () => {
    expect(isNonLoopbackBindHost("127.0.0.1")).toBe(false);
    expect(isNonLoopbackBindHost("0.0.0.0")).toBe(true);
    expect(isNonLoopbackBindHost("192.168.1.10")).toBe(true);
  });
});
