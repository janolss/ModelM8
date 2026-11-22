/**
 * Object-type helpers for vägval / Regel (Eller=or, Och=and).
 * 2c8 methodology has no create type "gateway".
 */

function key(objectType: string): string {
  return objectType
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[_\s-]/g, "");
}

/** Join / Förbinda — never create or propose in this MCP. */
export function isForbiddenJoinType(objectType: string): boolean {
  const k = key(objectType);
  return k === "join" || k.includes("forbind");
}

/**
 * Agent jargon + real types for exclusive choice (Regel Eller).
 * API create type is DECISION (alternativeSymbol OR). Agents may say or/vägval/gateway.
 */
export function isExclusiveBranchAlias(objectType: string): boolean {
  const k = key(objectType);
  return (
    k === "or" ||
    k === "eller" ||
    k === "gateway" ||
    k === "decision" ||
    k === "vagval" ||
    k === "regel" ||
    k === "xor" ||
    k === "beslut"
  );
}

/** @deprecated use isExclusiveBranchAlias */
export const isGatewayAlias = isExclusiveBranchAlias;

/** Parallel Regel (Och) aliases. */
export function isAndAlias(objectType: string): boolean {
  const k = key(objectType);
  return k === "and" || k === "och" || k === "parallel" || k === "parallell";
}

/**
 * True when a stored symbol objectType matches a search/filter type.
 * Exclusive: or / decision / legacy DECISION; parallel: and.
 */
export function matchesObjectTypeFilter(
  symbolObjectType: string | undefined,
  filterType: string,
): boolean {
  const sym = key(symbolObjectType ?? "");
  const filter = key(filterType);
  if (!filter) return true;
  if (isForbiddenJoinType(filter)) {
    return false;
  }
  if (isExclusiveBranchAlias(filter)) {
    return (
      sym === "or" ||
      sym === "eller" ||
      sym === "decision" ||
      sym === "gateway"
    );
  }
  if (isAndAlias(filter)) {
    return sym === "and" || sym === "och";
  }
  return sym.includes(filter) || filter.includes(sym);
}

export const GATEWAY_SEARCH_HINT =
  'Vägval = Regel (Eller) = objectType "or". Call resolve_branching_object_type("gateway"|"vägval") first. search_symbols objectType=or|vägval|decision. NEVER create gateway or join.';
