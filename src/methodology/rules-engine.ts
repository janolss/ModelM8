import type { TwoC8Client } from "../api/twoc8-client.js";
import type { MethodologyPack, ObjectTypeDef } from "./loader.js";

export interface NamingCheck {
  pass: boolean;
  hint?: string;
  objectTypeId?: string;
}

export interface ValidationResult {
  ok: boolean;
  methodologyNotes: string[];
  namingCheck?: NamingCheck;
  configViolations: string[];
  reuseAdvice?: string;
}

function normalize(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function findObjectType(
  pack: MethodologyPack,
  objectType: string,
): ObjectTypeDef | undefined {
  const needle = normalize(objectType);
  return pack.objectTypes.find(
    (ot) =>
      normalize(ot.id) === needle ||
      (ot.apiObjectTypeHints ?? []).some((h) => normalize(h) === needle),
  );
}

export function checkNaming(
  pack: MethodologyPack,
  objectType: string,
  title: string,
): NamingCheck {
  const def = findObjectType(pack, objectType);
  const patternKey = def?.id ?? normalize(objectType);
  const pattern = pack.naming?.patterns?.[patternKey];
  if (!pattern?.regex) {
    return {
      pass: title.trim().length > 0,
      hint: pattern?.hint ?? def?.naming,
      objectTypeId: def?.id,
    };
  }
  try {
    const re = new RegExp(pattern.regex, "u");
    return {
      pass: re.test(title.trim()),
      hint: pattern.hint ?? def?.naming,
      objectTypeId: def?.id,
    };
  } catch {
    return { pass: true, hint: pattern.hint, objectTypeId: def?.id };
  }
}

export function methodologyNotesForObject(
  pack: MethodologyPack,
  objectType: string,
): string[] {
  const def = findObjectType(pack, objectType);
  if (!def) {
    return [`No methodology entry for objectType '${objectType}'.`];
  }
  const notes = [
    `${def.title?.sv ?? def.id}: ${def.usage ?? ""}`.trim(),
  ];
  if (def.naming) {
    notes.push(`Naming: ${def.naming}`);
  }
  if (def.requiresPerformer) {
    notes.push("Activity requires a performer (role, position or organisation).");
  }
  return notes.filter(Boolean);
}

export async function loadRepoConfiguration(
  client: TwoC8Client,
  repositoryId: string,
): Promise<unknown | null> {
  try {
    return await client.request({
      path: "/api/v1/repositories/{repositoryId}/configuration",
      pathParams: { repositoryId },
    });
  } catch {
    return null;
  }
}

/**
 * Best-effort extraction of allowed type strings from opaque configuration JSON.
 */
export function extractAllowedTypes(config: unknown): {
  modelTypes: string[];
  objectTypes: string[];
} {
  const modelTypes = new Set<string>();
  const objectTypes = new Set<string>();

  const visit = (node: unknown, keyHint = ""): void => {
    if (node == null) {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, keyHint);
      }
      return;
    }
    if (typeof node !== "object") {
      if (typeof node === "string") {
        const key = normalize(keyHint);
        if (key.includes("modeltype") || key === "modeltypes") {
          modelTypes.add(node);
        }
        if (
          key.includes("objecttype") ||
          key === "objecttypes" ||
          key.includes("symboltype")
        ) {
          objectTypes.add(node);
        }
      }
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (
        typeof v === "string" &&
        (normalize(k) === "modeltype" || normalize(k) === "objecttype")
      ) {
        if (normalize(k) === "modeltype") {
          modelTypes.add(v);
        } else {
          objectTypes.add(v);
        }
      }
      visit(v, k);
    }
  };

  visit(config);
  return {
    modelTypes: [...modelTypes],
    objectTypes: [...objectTypes],
  };
}

export function validateProposedSymbol(
  pack: MethodologyPack,
  args: {
    objectType: string;
    title: string;
    repoConfig?: unknown | null;
  },
): ValidationResult {
  const notes = methodologyNotesForObject(pack, args.objectType);
  const namingCheck = checkNaming(pack, args.objectType, args.title);
  const configViolations: string[] = [];

  if (args.repoConfig) {
    const allowed = extractAllowedTypes(args.repoConfig);
    if (
      allowed.objectTypes.length > 0 &&
      !allowed.objectTypes.some(
        (t) => normalize(t) === normalize(args.objectType),
      )
    ) {
      // Only flag when we found an allow-list that looks intentional
      const def = findObjectType(pack, args.objectType);
      const hints = def?.apiObjectTypeHints ?? [args.objectType];
      const match = hints.some((h) =>
        allowed.objectTypes.some((t) => normalize(t) === normalize(h)),
      );
      if (!match) {
        configViolations.push(
          `objectType '${args.objectType}' may not be allowed by repository configuration`,
        );
      }
    }
  }

  return {
    ok: namingCheck.pass && configViolations.length === 0,
    methodologyNotes: notes,
    namingCheck,
    configViolations,
    reuseAdvice:
      "Call search_symbols before creating; reuse existing UUID when the concept matches.",
  };
}

export function getMethodologyTopic(
  pack: MethodologyPack,
  topic: string,
): unknown {
  const t = normalize(topic);

  if (t === "sources") {
    return pack.sources;
  }

  const object = pack.objectTypes.find(
    (ot) =>
      normalize(ot.id) === t ||
      (ot.apiObjectTypeHints ?? []).some((h) => normalize(h) === t),
  );
  const model = pack.modelTypes.find(
    (mt) =>
      normalize(mt.id) === t ||
      (mt.apiModelTypeHints ?? []).some((h) => normalize(h) === t),
  );
  if (object && model) {
    return { kind: "modelAndObjectType", modelType: model, objectType: object };
  }
  if (model) {
    return { kind: "modelType", ...model };
  }
  if (object) {
    return { kind: "objectType", ...object };
  }

  if (pack.rules[t]) {
    return { kind: "rule", ...(pack.rules[t] as object) };
  }
  if (pack.documents[t]) {
    return { kind: "documents", ...(pack.documents[t] as object) };
  }
  if (pack.structure[t]) {
    return { kind: "structure", ...(pack.structure[t] as object) };
  }
  if (pack.relations[t]) {
    return { kind: "relations", ...(pack.relations[t] as object) };
  }

  return {
    kind: "index",
    availableTopics: [
      ...pack.objectTypes.map((o) => o.id),
      ...pack.modelTypes.map((m) => m.id),
      ...Object.keys(pack.rules),
      ...Object.keys(pack.documents),
      ...Object.keys(pack.structure),
      ...Object.keys(pack.relations),
      "sources",
    ],
  };
}
