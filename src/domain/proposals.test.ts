import { describe, expect, it } from "vitest";
import { loadMethodologyPack } from "../methodology/loader.js";
import { chainAlternationIssues, proposeModelFromText } from "./proposals.js";

describe("proposeModelFromText / chain alternation", () => {
  const pack = loadMethodologyPack();

  it("flags consecutive activities without a BO", () => {
    const issues = chainAlternationIssues([
      { kind: "businessObject", title: "Lead", objectType: "businessObject" },
      { kind: "activity", title: "Qualify lead", objectType: "activity" },
      { kind: "activity", title: "Prepare proposal", objectType: "activity" },
      { kind: "businessObject", title: "Proposal", objectType: "businessObject" },
    ]);
    expect(issues.some((m) => /Consecutive activities/i.test(m))).toBe(true);
  });

  it("flags Output: activity titles", () => {
    const issues = chainAlternationIssues([
      { kind: "activity", title: "Output: Declined opportunity", objectType: "activity" },
    ]);
    expect(issues.some((m) => /Output:/i.test(m))).toBe(true);
  });

  it("Sales-like prefixed text keeps BO↔activity alternation when well formed", () => {
    const text = `
Process: Sell managed service
Business object: Customer lead
Activity: Qualify opportunity
Business object: Go/No-Go Decision Record
Vägval: Go decision?
Ja: Prepare proposal
Nej: Close declined opportunity
Business object: Proposal pack
Activity: Prepare proposal
Business object: Handover Package
Activity: Close declined opportunity
Business object: Declined opportunity record
`.trim();
    const proposal = proposeModelFromText(pack, text, "process");
    const altFails = (proposal.namingChecks ?? []).filter(
      (c) => !c.pass && /Consecutive|Output:/i.test(c.hint ?? ""),
    );
    expect(altFails).toEqual([]);
    const kinds = (proposal.chain ?? []).map((n) => n.kind);
    expect(kinds.includes("businessObject")).toBe(true);
    expect(kinds.includes("activity")).toBe(true);
  });

  it("scrambled activity-only lines fail alternation namingChecks", () => {
    const text = `
Process: Broken
Activity: First step
Activity: Second step
Activity: Third step
`.trim();
    const proposal = proposeModelFromText(pack, text, "process");
    expect(
      proposal.namingChecks.some((c) => !c.pass && /Consecutive activities/i.test(c.hint ?? "")),
    ).toBe(true);
    expect(proposal.repairHints?.length).toBeGreaterThan(0);
    expect(proposal.suggestedPrefixedText).toMatch(/Process:/);
  });

  it("keeps Output: in document order after each Activity (FIN-INV regression)", () => {
    const text = `
Process: Invoice customer
Input: Delivery confirmation
Activity: Prepare invoice draft
Output: Invoice draft
Activity: Verify invoice
Output: Verified invoice
Activity: Send invoice
Output: Sent invoice
`.trim();
    const proposal = proposeModelFromText(pack, text, "process");
    const titles = (proposal.chain ?? []).map((n) => `${n.kind}:${n.title}`);
    expect(titles).toEqual([
      "businessObject:Delivery confirmation",
      "activity:Prepare invoice draft",
      "businessObject:Invoice draft",
      "activity:Verify invoice",
      "businessObject:Verified invoice",
      "activity:Send invoice",
      "businessObject:Sent invoice",
    ]);
    const altFails = (proposal.namingChecks ?? []).filter(
      (c) => !c.pass && /Consecutive/i.test(c.hint ?? ""),
    );
    expect(altFails).toEqual([]);
  });

  it("Sales Practice Go/No-Go: Output after Qualify stays before next activity", () => {
    const text = `
Process: Sell managed service
Activity: Qualify opportunity
Output: Lead record
Activity: Decide go/no-go
Output: Go/No-Go Decision Record
Vägval: Go?
Ja: Prepare proposal
Nej: Close declined opportunity
Activity: Prepare proposal
Output: Proposal pack
Activity: Close declined opportunity
Output: Declined opportunity record
`.trim();
    const proposal = proposeModelFromText(pack, text, "process");
    const titles = (proposal.chain ?? []).map((n) => n.title);
    const leadIdx = titles.indexOf("Lead record");
    const decideIdx = titles.indexOf("Decide go/no-go");
    const goIdx = titles.indexOf("Go/No-Go Decision Record");
    expect(leadIdx).toBeGreaterThan(-1);
    expect(decideIdx).toBeGreaterThan(leadIdx);
    expect(goIdx).toBeGreaterThan(decideIdx);
    // Nej must not invent Output:… as an activity
    expect(proposal.chain?.some((n) => n.kind === "activity" && /^Output:/i.test(n.title))).toBe(
      false,
    );
    const nej = proposal.branches?.find((b) => b.label === "Nej");
    expect(nej?.toTitle).toBe("Close declined opportunity");
    expect(nej?.toKind).not.toBe("businessObject");
  });

  it("skips free prose chain notes in strict prefix mode", () => {
    const text = `
Process: Finance close
Activity: Collect timesheets
Output: Timesheet pack
Then the controller reviews everything and prepares the pack for the board meeting notes
Activity: Present forecast
Output: Forecast pack
`.trim();
    const proposal = proposeModelFromText(pack, text, "process");
    const activityTitles = (proposal.chain ?? [])
      .filter((n) => n.kind === "activity")
      .map((n) => n.title);
    expect(activityTitles).toEqual(["Collect timesheets", "Present forecast"]);
    expect(activityTitles.some((t) => /controller reviews/i.test(t))).toBe(false);
  });

  it("Nej: Output: X becomes businessObject branch target (fails naming, not activity)", () => {
    const text = `
Process: Gate
Activity: Decide
Output: Decision Record
Vägval: Approved?
Ja: Continue work
Nej: Output: Declined opportunity
Activity: Continue work
Output: Done
`.trim();
    const proposal = proposeModelFromText(pack, text, "process");
    const nej = proposal.branches?.find((b) => b.label === "Nej");
    expect(nej?.toKind).toBe("businessObject");
    expect(proposal.namingChecks.some((c) => !c.pass && /Vägval branch/i.test(c.hint ?? ""))).toBe(
      true,
    );
    expect(proposal.chain?.some((n) => n.kind === "activity" && /Output:/i.test(n.title))).toBe(
      false,
    );
  });
});
