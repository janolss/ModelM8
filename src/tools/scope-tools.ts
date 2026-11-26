import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { WriteScopeError } from "../domain/write-scope.js";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";
import { repositoryId } from "./schemas.js";

async function fetchRepositoryName(ctx: ToolContext, id: string): Promise<string | undefined> {
  try {
    const repo = await ctx.client.request<{ name?: string }>({
      path: "/api/v1/repositories/{repositoryId}",
      pathParams: { repositoryId: id },
    });
    return typeof repo?.name === "string" ? repo.name : undefined;
  } catch {
    return undefined;
  }
}

export function registerScopeTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_write_scope",
    {
      description:
        "Return the current write-scope lock (target repositoryId), deny lists, and unlock policy. " +
        "Call before writes when unsure. Read tools are never scoped.",
      inputSchema: {},
    },
    async () => runTool(async () => ctx.writeScope.snapshot()),
  );

  server.registerTool(
    "lock_write_repository",
    {
      description:
        "Lock mutating MCP tools to one repositoryId for this modelM8 process. " +
        "Required before writes when requireLockBeforeWrite is enabled (default). " +
        "create_repository auto-locks when unlocked. To switch repos, unlock first (operator policy).",
      inputSchema: {
        repositoryId,
        repositoryName: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Optional expected name; verified against get_repository when possible (mismatch → error)",
          ),
      },
    },
    async (args) =>
      runTool(async () => {
        const apiName = await fetchRepositoryName(ctx, args.repositoryId);
        if (args.repositoryName && apiName && args.repositoryName.trim() !== apiName) {
          throw new WriteScopeError(
            "name_mismatch",
            `repositoryName "${args.repositoryName}" does not match repository ${args.repositoryId} ("${apiName}").`,
          );
        }
        // Prefer API name; fall back to caller-provided name when lookup fails
        const name = apiName ?? args.repositoryName?.trim();
        if (args.repositoryName && ctx.writeScope.isDeniedName(args.repositoryName)) {
          throw new WriteScopeError(
            "denied",
            `Cannot lock write scope to denied repository name "${args.repositoryName}".`,
          );
        }
        if (name && ctx.writeScope.isDeniedName(name)) {
          throw new WriteScopeError(
            "denied",
            `Cannot lock write scope to denied repository name "${name}".`,
          );
        }
        const snapshot = ctx.writeScope.lock({
          repositoryId: args.repositoryId,
          repositoryName: name,
          source: "explicit",
        });
        return {
          data: snapshot,
          methodologyNotes: [
            "Write scope locked. Mutating tools will reject other repositoryIds until unlock/restart.",
          ],
          nextSuggestedTools: ["get_write_scope", "list_languages", "find_models"],
        };
      }),
  );

  server.registerTool(
    "unlock_write_repository",
    {
      description:
        "Clear the write-scope lock so a different repository can be locked. " +
        "Subject to server unlock policy (confirm phrase, restart-only, or open). " +
        "Operators supply confirm when required; agents must not guess or retry unlock.",
      inputSchema: {
        confirm: z
          .string()
          .optional()
          .describe("Operator confirmation value when unlock policy requires it"),
      },
    },
    async (args) =>
      runTool(async () => {
        const snapshot = ctx.writeScope.unlock(args.confirm);
        return {
          data: snapshot,
          methodologyNotes: [
            snapshot.locked
              ? "Write scope still locked."
              : "Write scope unlocked. Call lock_write_repository before further writes.",
          ],
          nextSuggestedTools: snapshot.locked
            ? ["get_write_scope"]
            : ["lock_write_repository", "get_write_scope"],
        };
      }),
  );
}
