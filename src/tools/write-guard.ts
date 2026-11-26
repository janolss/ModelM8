import type { ToolContext } from "./context.js";

/** Early assert for tool handlers that take repositoryId (client safetynet is the backstop). */
export function requireWritableRepo(ctx: ToolContext, repositoryId: string): void {
  ctx.writeScope.assertWritable(repositoryId);
}
