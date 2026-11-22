import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { resolveKnowledgeDir } from "./paths.js";

export interface ObjectTypeDef {
  id: string;
  apiObjectTypeHints?: string[];
  title?: { sv?: string; en?: string };
  naming?: string;
  usage?: string;
  requiresPerformer?: boolean;
  specializations?: string[];
  phase1?: boolean;
}

export interface ModelTypeDef {
  id: string;
  apiModelTypeHints?: string[];
  title?: { sv?: string; en?: string };
  summary?: string;
  principles?: string[];
  modelingGuidance?: string[];
  phase1?: boolean;
  sources?: string[];
}

export interface NamingRules {
  id: string;
  patterns?: Record<string, { regex?: string; hint?: string }>;
  swedishInfinitiveExamples?: string[];
  sources?: string[];
}

export interface MethodologyPack {
  root: string;
  objectTypes: ObjectTypeDef[];
  modelTypes: ModelTypeDef[];
  naming: NamingRules | null;
  rules: Record<string, unknown>;
  documents: Record<string, unknown>;
  structure: Record<string, unknown>;
  relations: Record<string, unknown>;
  sources: unknown;
  resourceIndex: Array<{ uri: string; name: string; relativePath: string }>;
}

function readYamlFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8");
  return parseYaml(raw);
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listYamlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => path.join(dir, f));
}

export function loadMethodologyPack(knowledgeDir?: string): MethodologyPack {
  const root = resolveKnowledgeDir(knowledgeDir);

  const objectIndex = readYamlFile(
    path.join(root, "object-types", "index.yaml"),
  ) as { objectTypes?: ObjectTypeDef[] };

  const processModel = readYamlFile(
    path.join(root, "model-types", "process.yaml"),
  ) as ModelTypeDef;
  const processMapModel = fs.existsSync(
    path.join(root, "model-types", "process-map.yaml"),
  )
    ? (readYamlFile(
        path.join(root, "model-types", "process-map.yaml"),
      ) as ModelTypeDef)
    : null;
  const swimlaneModel = readYamlFile(
    path.join(root, "model-types", "swimlane.yaml"),
  ) as ModelTypeDef;
  const stubs = readYamlFile(
    path.join(root, "model-types", "stubs.yaml"),
  ) as { modelTypes?: ModelTypeDef[] };

  const naming = fs.existsSync(path.join(root, "rules", "naming.yaml"))
    ? (readYamlFile(path.join(root, "rules", "naming.yaml")) as NamingRules)
    : null;

  const rules: Record<string, unknown> = {};
  for (const file of listYamlFiles(path.join(root, "rules"))) {
    const id = path.basename(file, path.extname(file));
    rules[id] = readYamlFile(file);
  }

  const documents: Record<string, unknown> = {};
  for (const file of listYamlFiles(path.join(root, "documents"))) {
    documents[path.basename(file, path.extname(file))] = readYamlFile(file);
  }

  const structure: Record<string, unknown> = {};
  for (const file of listYamlFiles(path.join(root, "structure"))) {
    structure[path.basename(file, path.extname(file))] = readYamlFile(file);
  }

  const relations: Record<string, unknown> = {};
  for (const file of listYamlFiles(path.join(root, "relations"))) {
    relations[path.basename(file, path.extname(file))] = readYamlFile(file);
  }

  const sourcesPath = path.join(root, "sources.json");
  const sources = fs.existsSync(sourcesPath) ? readJsonFile(sourcesPath) : null;

  const resourceIndex: MethodologyPack["resourceIndex"] = [];
  const walk = (rel: string) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      return;
    }
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        walk(childRel);
      } else if (
        entry.name.endsWith(".yaml") ||
        entry.name.endsWith(".yml") ||
        entry.name.endsWith(".json")
      ) {
        const uriPath = childRel.replace(/\\/g, "/").replace(/\.(yaml|yml|json)$/i, "");
        resourceIndex.push({
          uri: `methodology://${uriPath}`,
          name: uriPath,
          relativePath: childRel,
        });
      }
    }
  };
  walk("");

  return {
    root,
    objectTypes: objectIndex.objectTypes ?? [],
    modelTypes: [
      processModel,
      ...(processMapModel ? [processMapModel] : []),
      swimlaneModel,
      ...((stubs.modelTypes ?? []).map((m) => ({
        ...m,
        phase1: m.phase1 ?? false,
      })) as ModelTypeDef[]),
    ],
    naming,
    rules,
    documents,
    structure,
    relations,
    sources,
    resourceIndex,
  };
}

export function readKnowledgeResource(
  pack: MethodologyPack,
  relativePath: string,
): string {
  const abs = path.join(pack.root, relativePath);
  if (!abs.startsWith(pack.root) || !fs.existsSync(abs)) {
    throw new Error(`Unknown methodology resource: ${relativePath}`);
  }
  return fs.readFileSync(abs, "utf8");
}
