import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";

/** Early assert for tool handlers that take repositoryId (client safetynet is the backstop). */
export function requireWritableRepo(ctx: ToolContext, repositoryId: string): void {
  ctx.writeScope.assertWritable(repositoryId);
}

/**
 * Run a mutating tool after asserting write scope for repositoryId.
 * Prefer this over bare runTool for every write/delete handler with a target repo.
 */
export function runMutatingTool(
  ctx: ToolContext,
  repositoryId: string,
  action: () => Promise<unknown>,
): Promise<CallToolResult> {
  return runTool(async () => {
    requireWritableRepo(ctx, repositoryId);
    return await action();
  });
}
