import { describe, expect, it } from "vitest";
import {
  buildAbsoluteDocumentBody,
  classifyResolvedDocumentLink,
  encodeRelativeDocumentPath,
  expandRelativeLinkAgainstRoots,
  joinRootValueAndRelativePath,
  normalizeDocumentRootValue,
  normalizeMtDocumentBody,
} from "./document-paths.js";

describe("document-paths", () => {
  it("encodes relative path segments (%20 and non-ASCII)", () => {
    expect(encodeRelativeDocumentPath("2. Hantera behov/Anvisning gällande hantering.pdf")).toBe(
      "2.%20Hantera%20behov/Anvisning%20g%C3%A4llande%20hantering.pdf",
    );
  });

  it("does not double-encode already encoded segments", () => {
    expect(encodeRelativeDocumentPath("2.%20Hantera%20behov/a.pdf")).toBe(
      "2.%20Hantera%20behov/a.pdf",
    );
  });

  it("rejects .. and . path segments (including encoded)", () => {
    expect(() => encodeRelativeDocumentPath("../etc/passwd")).toThrow(/\.\./);
    expect(() => encodeRelativeDocumentPath("a/../../b")).toThrow(/\.\./);
    expect(() => encodeRelativeDocumentPath("%2e%2e/secret")).toThrow(/\.\./);
    expect(() => encodeRelativeDocumentPath("foo/./bar")).toThrow(/\./);
  });

  it("normalizes filesystem root to file:///…/", () => {
    const value = normalizeDocumentRootValue(
      "/Users/jan/github_repo/2c8-mcp-server-1/Inera/Dokumentbibliotek",
    );
    expect(value.startsWith("file:///Users/jan/")).toBe(true);
    expect(value.endsWith("/")).toBe(true);
    expect(value).toContain("Dokumentbibliotek");
  });

  it("rejects file:// relative root values", () => {
    expect(() => normalizeDocumentRootValue("file://Dokumentbibliotek")).toThrow(/absolute/);
  });

  it("joinRootValueAndRelativePath builds full absolute URL", () => {
    const link = joinRootValueAndRelativePath(
      "/Users/jan/github_repo/2c8-mcp-server-1/Inera/Dokumentbibliotek",
      "2. Hantera behov/doc.pdf",
    );
    expect(link.startsWith("file:///Users/jan/")).toBe(true);
    expect(link).toContain("Dokumentbibliotek/");
    expect(link.endsWith("2.%20Hantera%20behov/doc.pdf")).toBe(true);
  });

  it("normalizeMtDocumentBody accepts absolute file URL", () => {
    const body = normalizeMtDocumentBody({
      type: "file",
      languages: {
        lang: {
          title: "Needs",
          content: "file:///Users/jan/Inera/Dokumentbibliotek/2.%20Hantera%20behov/doc.pdf",
        },
      },
    });
    const langs = body.languages as Record<string, { content: string }>;
    expect(langs.lang.content.startsWith("file:///Users/jan/")).toBe(true);
    expect(langs.lang.content).toContain("2.%20Hantera%20behov");
  });

  it("normalizeMtDocumentBody rejects relative content (prefix is not a root FK)", () => {
    expect(() =>
      normalizeMtDocumentBody({
        type: "URL",
        prefix: "inera-docs",
        languages: {
          lang: { title: "X", content: "2. Hantera behov/doc.pdf" },
        },
      }),
    ).toThrow(/absolute/);
  });

  it("normalizeMtDocumentBody rejects top-level content", () => {
    expect(() =>
      normalizeMtDocumentBody({
        type: "URL",
        content: "Processes/Practices/Sales Practice.docx",
        languages: { lang: { title: "Sales Practice" } },
      }),
    ).toThrow(/top level/);
  });

  it("normalizeMtDocumentBody rejects type URL|file without languages", () => {
    expect(() =>
      normalizeMtDocumentBody({
        type: "URL",
        title: "Sales Practice",
      }),
    ).toThrow(/languages/);
  });

  it("normalizeMtDocumentBody rejects file:// relative", () => {
    expect(() =>
      normalizeMtDocumentBody({
        type: "URL",
        languages: {
          lang: {
            title: "X",
            content: "file://TechSeed-IMS/doc.docx",
          },
        },
      }),
    ).toThrow(/file:\/\/\//);
  });

  it("classifyResolvedDocumentLink accepts absolute URLs", () => {
    expect(classifyResolvedDocumentLink("https://example.com/a.docx").ok).toBe(true);
    expect(classifyResolvedDocumentLink("file:///Users/x/a.docx").ok).toBe(true);
  });

  it("classifyResolvedDocumentLink rejects relative and empty", () => {
    expect(classifyResolvedDocumentLink("Processes/Practices/Sales Practice.docx")).toMatchObject({
      ok: false,
      code: "relative-without-absolute-url",
    });
    expect(classifyResolvedDocumentLink("")).toMatchObject({
      ok: false,
      code: "missing-link",
    });
    expect(classifyResolvedDocumentLink("file://relative/doc.docx")).toMatchObject({
      ok: false,
      code: "invalid-file-url",
    });
  });

  it("expandRelativeLinkAgainstRoots joins relative to a root value", () => {
    expect(
      expandRelativeLinkAgainstRoots("Processes/Practices/Sales%20Practice.docx", [
        "file:///Users/jan/github_repo/2c8-mcp-server-1/TechSeed-IMS/",
      ]),
    ).toEqual({
      absoluteLink:
        "file:///Users/jan/github_repo/2c8-mcp-server-1/TechSeed-IMS/Processes/Practices/Sales%20Practice.docx",
    });
    expect(expandRelativeLinkAgainstRoots("https://example.com/a.docx", [])).toEqual({
      absoluteLink: "https://example.com/a.docx",
    });
  });

  it("buildAbsoluteDocumentBody stores full URL without API prefix", () => {
    const body = buildAbsoluteDocumentBody({
      documentRootValue: "/Users/jan/github_repo/2c8-mcp-server-1/Inera/Dokumentbibliotek",
      relativePath: "2. Hantera behov/Anvisning.pdf",
      title: "Needs management guideline v1.01",
      languageId: "lang-sv",
      documentTypes: ["type-1"],
    });
    expect(body.prefix).toBeUndefined();
    expect(body).toMatchObject({
      type: "file",
      documentTypes: ["type-1"],
    });
    const langs = body.languages as Record<string, { title: string; content: string }>;
    expect(langs["lang-sv"].title).toBe("Needs management guideline v1.01");
    expect(langs["lang-sv"].content.startsWith("file:///")).toBe(true);
    expect(langs["lang-sv"].content.endsWith("2.%20Hantera%20behov/Anvisning.pdf")).toBe(true);
  });

  it("buildAbsoluteDocumentBody copies same absolute URL to extraTitles languages", () => {
    const body = buildAbsoluteDocumentBody({
      documentRootValue: "/Users/jan/github_repo/2c8-mcp-server-1/TechSeed-IMS",
      relativePath: "Processes/Practices/Sales Practice.docx",
      title: "Sales Practice",
      languageId: "lang-en",
      extraTitles: {
        "lang-en": "Sales Practice",
        "lang-sv": "Säljpraktik",
      },
    });
    const langs = body.languages as Record<string, { title: string; content: string }>;
    expect(Object.keys(langs).sort()).toEqual(["lang-en", "lang-sv"]);
    expect(langs["lang-en"].title).toBe("Sales Practice");
    expect(langs["lang-sv"].title).toBe("Säljpraktik");
    expect(langs["lang-en"].content).toBe(langs["lang-sv"].content);
    expect(langs["lang-en"].content.startsWith("file:///")).toBe(true);
    expect(langs["lang-en"].content).toContain("Sales%20Practice.docx");
  });
});
