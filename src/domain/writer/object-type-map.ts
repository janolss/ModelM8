/**
 * Map methodology/agent object types to 2c8 create API types.
 * Vägval (Regel Eller/Och) are both API objectType "decision";
 * exclusive vs parallel is selected via alternativeSymbol OR|AND.
 */
export function toApiObjectType(objectType: string): string {
  const key = objectType.trim().toLowerCase().replace(/[_\s]/g, "");
  const map: Record<string, string> = {
    businessobject: "BUSINESS_OBJECT",
    activity: "activity",
    role: "role",
    process: "process",
    application: "application",
    coredocument: "core_document",
    document: "core_document",
    position: "position",
    organization: "organization",
    organisation: "organization",
    // Exclusive vägval → DECISION (alternativeSymbol OR, API default)
    gateway: "decision",
    decision: "decision",
    vägval: "decision",
    vagval: "decision",
    regel: "decision",
    eller: "decision",
    or: "decision",
    xor: "decision",
    beslut: "decision",
    // Parallel Regel (Och) → same DECISION type, alternativeSymbol AND
    and: "decision",
    och: "decision",
    parallel: "decision",
  };
  // Join / Förbinda is forbidden in this MCP
  if (key === "join" || key.includes("forbind") || key.includes("förbind")) {
    throw new Error(
      'objectType join/förbinda is forbidden. For vägval use objectType "or"/"decision" (Regel Eller). Call resolve_branching_object_type.',
    );
  }
  if (map[key]) return map[key];
  if (objectType.includes("_")) return objectType.toLowerCase();
  return objectType.toLowerCase();
}

/** Parallel Regel (Och) needs alternativeSymbol AND on DECISION create. */
export function alternativeSymbolFor(objectType: string): "AND" | undefined {
  const key = objectType.trim().toLowerCase().replace(/[_\s]/g, "");
  if (key === "and" || key === "och" || key === "parallel" || key === "parallell") {
    return "AND";
  }
  return undefined;
}

/** Map methodology modelType hints to API model type ids (UPPER_SNAKE). */
export function toApiModelType(modelType: string | undefined): string {
  const key = (modelType ?? "process")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]/g, "");
  const map: Record<string, string> = {
    process: "PROCESS_MODEL",
    processmodel: "PROCESS_MODEL",
    swimlane: "SWIMLANE_MODEL",
    swimlanemodel: "SWIMLANE_MODEL",
    general: "GENERAL_MODEL",
    generalmodel: "GENERAL_MODEL",
  };
  return map[key] ?? (modelType?.includes("_") ? modelType.toUpperCase() : "PROCESS_MODEL");
}
