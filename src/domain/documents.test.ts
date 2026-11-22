import { describe, expect, it, vi } from "vitest";
import type { TwoC8Client } from "../api/twoc8-client.js";
import { DocumentsService } from "./documents.js";

function mockClient(handler: (opts: Record<string, unknown>) => unknown): TwoC8Client {
  return {
    request: vi.fn(async (opts: Record<string, unknown>) => handler(opts)),
  } as unknown as TwoC8Client;
}

describe("DocumentsService", () => {
  it("createMtDocument defaults showInPanel to false when omitted", async () => {
    let posted: unknown;
    const client = mockClient((opts) => {
      posted = opts.body;
      return { uuid: "doc-1" };
    });
    const docs = new DocumentsService(client);
    await docs.createMtDocument("repo-1", {
      type: "URL",
      languages: { lang: { title: "Policy", content: "https://example.com/p" } },
    });
    expect(posted).toMatchObject({ showInPanel: false, type: "URL" });
  });

  it("createMtDocument keeps explicit showInPanel true", async () => {
    let posted: unknown;
    const client = mockClient((opts) => {
      posted = opts.body;
      return { uuid: "doc-2" };
    });
    const docs = new DocumentsService(client);
    await docs.createMtDocument("repo-1", {
      type: "URL",
      showInPanel: true,
      languages: { lang: { title: "X", content: "https://example.com/x" } },
    });
    expect(posted).toMatchObject({ showInPanel: true });
  });

  it("createDocumentRoot posts key/value/titles", async () => {
    let posted: unknown;
    const client = mockClient((opts) => {
      posted = opts.body;
      return {
        uuid: "root-1",
        key: "ims-docs",
        value: "https://example.com/docs/",
        titles: { lang: { title: "IMS Docs" } },
        type: "mtDocumentRoot",
      };
    });
    const docs = new DocumentsService(client);
    const result = await docs.createDocumentRoot("repo-1", {
      key: "ims-docs",
      value: "https://example.com/docs/",
      titles: { lang: { title: "IMS Docs" } },
    });
    expect(posted).toMatchObject({
      key: "ims-docs",
      value: "https://example.com/docs/",
    });
    expect(result.data.key).toBe("ims-docs");
    expect(result.data.uuid).toBe("root-1");
  });

  it("linkDocumentsToSymbol merges existing refs as MtbDocumentIdDto", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client = mockClient((opts) => {
      calls.push(opts);
      if (opts.method === undefined || opts.method === "GET") {
        return {
          documents: [{ id: "existing", source: "mt.documents" }],
        };
      }
      return { ok: true };
    });
    const docs = new DocumentsService(client);
    const linked = await docs.linkDocumentsToSymbol({
      repositoryId: "repo-1",
      symbolId: "sym-1",
      documentIds: ["new-doc"],
    });
    expect(linked.ok).toBe(true);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({
      documents: [
        { id: "existing", source: "mt.documents" },
        { id: "new-doc", source: "mt.documents" },
      ],
    });
  });
});
