import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the knowledge pack directory (project-root/knowledge).
 */
export function resolveKnowledgeDir(override?: string): string {
  if (override && fs.existsSync(override)) {
    return path.resolve(override);
  }

  const candidates = [
    path.resolve(process.cwd(), "knowledge"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../knowledge"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../knowledge"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Knowledge directory not found. Checked: ${candidates.join(", ")}`,
  );
}
