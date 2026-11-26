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
Ja: Prepare proposal — Performer: Case Manager
Output: Proposal pack
Nej: Close declined opportunity
Activity: Package handover
Output: Handover Package
`.trim();
    const proposal = proposeModelFromText(pack, text, "process");
    const altFails = (proposal.namingChecks ?? []).filter(
      (c) => !c.pass && /Consecutive|Output:/i.test(c.hint ?? ""),
    );
    expect(altFails).toEqual([]);
    const kinds = (proposal.chain ?? []).map((n) => n.kind);
    expect(kinds.includes("businessObject")).toBe(true);
    expect(kinds.includes("activity")).toBe(true);
    expect(proposal.branches?.map((b) => b.label).sort()).toEqual(["Ja", "Nej"]);
    expect(proposal.chain?.some((n) => /Close declined/i.test(n.title))).toBe(false);
    const prepare = proposal.activities?.find((a) => /Prepare proposal/i.test(a.title));
    expect(prepare?.performers).toContain("Case Manager");
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
    // Side-branch target must not re-enter the spine after Ja path BOs
    expect(proposal.chain?.some((n) => n.title === "Close declined opportunity")).toBe(false);
    expect(proposal.chain?.filter((n) => n.title === "Prepare proposal")).toHaveLength(1);
  });

  it("Nej: after Ja-path Output still attaches to last vägval (SAL-MSP dialect)", () => {
    const text = `
Process: Sell managed service
Activity: Qualify opportunity
Output: Go/No-Go Decision Record
Vägval: Go decision?
Ja: Prepare proposal — Performer: Case Manager
Output: Proposal pack
Activity: Prepare for handover
Output: Handover Package
Nej: Close declined opportunity — Performer: Sales Manager
`.trim();
    const proposal = proposeModelFromText(pack, text, "process");
    expect(proposal.branches?.map((b) => `${b.label}:${b.toTitle}`).sort()).toEqual([
      "Ja:Prepare proposal",
      "Nej:Close declined opportunity",
    ]);
    expect(proposal.chain?.some((n) => n.title === "Close declined opportunity")).toBe(false);
    const close = proposal.activities?.find((a) => a.title === "Close declined opportunity");
    expect(close?.performers).toContain("Sales Manager");
    const prepare = proposal.activities?.find((a) => a.title === "Prepare proposal");
    expect(prepare?.performers).toContain("Case Manager");
    const altFails = (proposal.namingChecks ?? []).filter(
      (c) => !c.pass && /Consecutive/i.test(c.hint ?? ""),
    );
    expect(altFails).toEqual([]);
  });

  it("repairHints when vägval has Ja but missing Nej", () => {
    const text = `
Process: Gate
Activity: Decide
Output: Decision Record
Vägval: Approved?
Ja: Continue work
Output: Done
`.trim();
    const proposal = proposeModelFromText(pack, text, "process");
    expect(proposal.repairHints?.some((h) => /Nej:/i.test(h))).toBe(true);
  });

  it("Inera incident dialect: Nej side Output does not flatten onto spine after Ja terminal", () => {
    const text = `
Process: Hantera incident
Input: Incidentanmälan
Activity: Registrera incident — Performer: Servicedesk
Output: Incidentrecord
Activity: Klassificera allvarlighetsgrad — Performer: Incident Manager
Output: Klassificerad incident
Vägval: Krävs eskalering?
Ja: Eskalera till 2nd line — Performer: Incident Manager
Output: Eskalerad incident
Activity: Åtgärda och återställa — Performer: 2nd line
Output: Återställd tjänst
Nej: Åtgärda på 1st line — Performer: Servicedesk
Output: Stängd incident
`.trim();
    const proposal = proposeModelFromText(pack, text, "process");
    expect(proposal.branches?.map((b) => `${b.label}:${b.toTitle}`).sort()).toEqual([
      "Ja:Eskalera till 2nd line",
      "Nej:Åtgärda på 1st line",
    ]);
    expect(proposal.chain?.some((n) => n.title === "Åtgärda på 1st line")).toBe(false);
    expect(proposal.chain?.some((n) => n.title === "Stängd incident")).toBe(false);
    expect(proposal.chain?.map((n) => n.title)).toContain("Återställd tjänst");
    const altFails = (proposal.namingChecks ?? []).filter(
      (c) => !c.pass && /Consecutive/i.test(c.hint ?? ""),
    );
    expect(altFails).toEqual([]);
    const side = proposal.activities?.find((a) => a.title === "Åtgärda på 1st line");
    expect(side?.performers).toContain("Servicedesk");
  });

  it("RACI_RESPONSIBLE: standalone line becomes performer, not Activity", () => {
    const text = `
Process: Hantera test
Activity: Planera test
RACI_RESPONSIBLE: Avdelning Test och utveckling
Output: Testplan
Activity: Utföra test
Output: Testrapport
`.trim();
    const proposal = proposeModelFromText(pack, text, "process");
    expect(
      proposal.chain?.some((n) => n.kind === "activity" && /RACI|Avdelning Test/i.test(n.title)),
    ).toBe(false);
    const plan = proposal.activities?.find((a) => a.title === "Planera test");
    expect(plan?.performers.some((p) => /Test och utveckling/i.test(p))).toBe(true);
    const altFails = (proposal.namingChecks ?? []).filter(
      (c) => !c.pass && /Consecutive/i.test(c.hint ?? ""),
    );
    expect(altFails).toEqual([]);
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
