/**
 * Translate agent jargon (gateway, vägval, decision, xor, …) into the real
 * 2c8 methodology object types: Regel (Eller)=or, Regel (Och)=and.
 *
 * There is NO "gateway" object type in 2c8 methodology for create.
 */

function fold(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[_\s-]/g, "");
}

export type BranchingResolveResult = {
  /** What the agent asked (gateway / vägval / …). */
  agentAsked: string;
  /** Canonical intent after methodology mapping. */
  intent: "exclusive" | "parallel" | "forbidden" | "unknown";
  /** Object type to pass to create / propose / add_process_step. */
  useObjectType: string | null;
  /** Swedish methodology name in 2c8. */
  methodologyNameSv: string | null;
  /** English gloss. */
  methodologyNameEn: string | null;
  /** One-line order for the agent. */
  answer: string;
  /** How to name the symbol. */
  naming: string | null;
  /** How to label outgoing FLOW edges. */
  edgeLabels: string | null;
  /** Types that must never be created for this ask. */
  neverUse: string[];
  /** Related alternative when exclusive vs parallel. */
  related?: {
    useObjectType: string;
    methodologyNameSv: string;
    when: string;
  };
  nextSuggestedTools: string[];
};

/**
 * Resolve "I want a gateway / vägval / decision / and-split" → create type.
 */
export function resolveBranchingObjectType(ask: string): BranchingResolveResult {
  const k = fold(ask);
  const neverBase = ["gateway", "join", "förbinda", "forbinda"];

  // Forbidden
  if (k === "join" || k.includes("forbind")) {
    return {
      agentAsked: ask,
      intent: "forbidden",
      useObjectType: null,
      methodologyNameSv: null,
      methodologyNameEn: null,
      answer:
        "Använd INTE Join/Förbinda. Det symbolen ska aldrig skapas. För vägval (exklusivt val) använd objectType \"or\" (Regel Eller). För parallell split använd objectType \"and\" (Regel Och).",
      naming: null,
      edgeLabels: null,
      neverUse: ["join", "förbinda", "forbinda", "gateway"],
      nextSuggestedTools: [
        "resolve_branching_object_type",
        "propose_model_from_text",
        "add_process_step",
      ],
    };
  }

  // Parallel — Regel (Och)
  if (
    k === "and" ||
    k === "och" ||
    k === "parallel" ||
    k === "parallell" ||
    k.includes("ochregel") ||
    k === "andsplit" ||
    k === "parallelgateway"
  ) {
    return {
      agentAsked: ask,
      intent: "parallel",
      useObjectType: "and",
      methodologyNameSv: "Regel (Och)",
      methodologyNameEn: "And rule / parallel split",
      answer:
        'I 2c8-metoden finns ingen "gateway". För parallell förgrening (alla grenar kan köras) använd objectType "and" = Regel (Och). Skapa ALDRIG objectType gateway eller join.',
      naming: "Valfri kort etikett; typen bär betydelsen parallell split",
      edgeLabels: "Inga Ja/Nej — flera utgående FLOW samtidigt",
      neverUse: neverBase,
      related: {
        useObjectType: "or",
        methodologyNameSv: "Regel (Eller)",
        when: "När exakt en gren ska fortsätta (vägval / exclusive choice)",
      },
      nextSuggestedTools: [
        "add_process_step",
        "propose_model_from_text",
        "create_canvas_edge",
      ],
    };
  }

  // Exclusive — Regel (Eller) / vägval
  // Agents say: gateway, decision, xor, vägval, regel, eller, beslut, …
  if (
    k === "or" ||
    k === "eller" ||
    k === "vagval" ||
    k === "gateway" ||
    k === "decision" ||
    k === "xor" ||
    k === "beslut" ||
    k === "regel" ||
    k === "exclusive" ||
    k === "exclusivegateway" ||
    k === "exclusivechoice" ||
    k === "branch" ||
    k === "branching" ||
    k === "choice" ||
    k.includes("vagval") ||
    k.includes("gateway") ||
    k.includes("decision")
  ) {
    return {
      agentAsked: ask,
      intent: "exclusive",
      useObjectType: "or",
      methodologyNameSv: "Regel (Eller)",
      methodologyNameEn: "Or rule / exclusive choice (vägval)",
      answer:
        'I 2c8-metoden finns ingen objekttyp "gateway". Det du menar med gateway/vägval/decision är Regel (Eller). Använd objectType "or" vid create/propose/add_process_step. Titel som fråga med "?". Sätt Ja/Nej på FLOW-etiketter. Skapa ALDRIG gateway eller join.',
      naming: "Fråga som slutar med '?', t.ex. 'Är leveransen stage-gated?'",
      edgeLabels: "Ja / Nej (eller liknande) på utgående FLOW-kanter",
      neverUse: neverBase,
      related: {
        useObjectType: "and",
        methodologyNameSv: "Regel (Och)",
        when: "När flera grenar ska kunna köras parallellt",
      },
      nextSuggestedTools: [
        "add_process_step",
        "propose_model_from_text",
        "create_canvas_edge",
        "apply_model_proposal",
      ],
    };
  }

  return {
    agentAsked: ask,
    intent: "unknown",
    useObjectType: null,
    methodologyNameSv: null,
    methodologyNameEn: null,
    answer:
      'Okänt begrepp. För exklusivt vägval (det agenter kallar gateway/decision) använd objectType "or" (Regel Eller). För parallell split använd objectType "and" (Regel Och). Det finns ingen gateway-typ i 2c8-metoden. Join är förbjuden.',
    naming: null,
    edgeLabels: null,
    neverUse: neverBase,
    nextSuggestedTools: ["resolve_branching_object_type", "get_methodology"],
  };
}
