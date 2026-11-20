import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTool } from "../util/tool-result.js";
import type { ToolContext } from "./context.js";
import { jsonBody, pagination, repositoryId, uuid } from "./schemas.js";

export function registerAnalysisTools(
  server: McpServer,
  ctx: ToolContext,
): void {
  server.registerTool(
    "execute_query",
    {
      description:
        "Execute a repository query (analysis). Allowed in read-only mode.",
      inputSchema: {
        repositoryId,
        body: jsonBody,
      },
    },
    async ({ repositoryId: id, body }) =>
      runTool(() =>
        ctx.client.request({
          method: "POST",
          path: "/api/v1/repositories/{repositoryId}/queries/execute",
          pathParams: { repositoryId: id },
          body,
        }),
      ),
  );

  server.registerTool(
    "get_lists",
    {
      description: "List saved lists in a repository",
      inputSchema: {
        repositoryId,
        ...pagination,
      },
    },
    async ({ repositoryId: id, ...query }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/lists",
          pathParams: { repositoryId: id },
          query,
        }),
      ),
  );

  server.registerTool(
    "get_list",
    {
      description: "Get a saved list definition by UUID",
      inputSchema: {
        repositoryId,
        listId: uuid.describe("List UUID"),
      },
    },
    async ({ repositoryId: id, listId }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/lists/{listId}",
          pathParams: { repositoryId: id, listId },
        }),
      ),
  );

  server.registerTool(
    "execute_list",
    {
      description:
        "Execute a list definition (analysis). Provide listId for a saved list, or body for an ad-hoc list.",
      inputSchema: {
        repositoryId,
        listId: uuid.optional().describe("Saved list UUID"),
        body: jsonBody.optional(),
      },
    },
    async ({ repositoryId: id, listId, body }) =>
      runTool(async () => {
        if (listId) {
          return ctx.client.request({
            method: "POST",
            path: "/api/v1/repositories/{repositoryId}/lists/{listId}/execute",
            pathParams: { repositoryId: id, listId },
            body: body ?? {},
          });
        }
        if (!body) {
          throw new Error("Either listId or body is required for execute_list");
        }
        return ctx.client.request({
          method: "POST",
          path: "/api/v1/repositories/{repositoryId}/lists/execute",
          pathParams: { repositoryId: id },
          body,
        });
      }),
  );

  server.registerTool(
    "get_matrices",
    {
      description: "List matrices in a repository (e.g. responsibility matrices)",
      inputSchema: {
        repositoryId,
        ...pagination,
      },
    },
    async ({ repositoryId: id, ...query }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/matrices",
          pathParams: { repositoryId: id },
          query,
        }),
      ),
  );

  server.registerTool(
    "get_matrix",
    {
      description: "Get a matrix by UUID",
      inputSchema: {
        repositoryId,
        matrixId: uuid.describe("Matrix UUID"),
      },
    },
    async ({ repositoryId: id, matrixId }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/matrices/{matrixId}",
          pathParams: { repositoryId: id, matrixId },
        }),
      ),
  );

  server.registerTool(
    "execute_matrix",
    {
      description:
        "Execute a matrix (analysis), e.g. for responsibility/coupling views. Allowed in read-only mode.",
      inputSchema: {
        repositoryId,
        matrixId: uuid.describe("Matrix UUID"),
        body: jsonBody.optional(),
      },
    },
    async ({ repositoryId: id, matrixId, body }) =>
      runTool(() =>
        ctx.client.request({
          method: "POST",
          path: "/api/v1/repositories/{repositoryId}/matrices/{matrixId}/execute",
          pathParams: { repositoryId: id, matrixId },
          body: body ?? {},
        }),
      ),
  );

  server.registerTool(
    "list_relations",
    {
      description: "List custom relations in a repository",
      inputSchema: {
        repositoryId,
        ...pagination,
      },
    },
    async ({ repositoryId: id, ...query }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/relations",
          pathParams: { repositoryId: id },
          query,
        }),
      ),
  );

  server.registerTool(
    "get_relation",
    {
      description: "Get a custom relation by UUID",
      inputSchema: {
        repositoryId,
        relationId: uuid.describe("Relation UUID"),
        fields: pagination.fields,
        projection: pagination.projection,
      },
    },
    async ({ repositoryId: id, relationId, ...query }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/relations/{relationId}",
          pathParams: { repositoryId: id, relationId },
          query,
        }),
      ),
  );

  server.registerTool(
    "get_relation_script",
    {
      description: "Get the script for a custom relation",
      inputSchema: {
        repositoryId,
        relationId: uuid.describe("Relation UUID"),
      },
    },
    async ({ repositoryId: id, relationId }) =>
      runTool(() =>
        ctx.client.request({
          path: "/api/v1/repositories/{repositoryId}/relations/{relationId}/script",
          pathParams: { repositoryId: id, relationId },
        }),
      ),
  );

  server.registerTool(
    "execute_relation",
    {
      description:
        "Execute a custom relation script (saved relationId or ad-hoc body). Allowed in read-only mode.",
      inputSchema: {
        repositoryId,
        relationId: uuid.optional().describe("Saved relation UUID"),
        body: jsonBody.optional(),
      },
    },
    async ({ repositoryId: id, relationId, body }) =>
      runTool(async () => {
        if (relationId) {
          return ctx.client.request({
            method: "POST",
            path: "/api/v1/repositories/{repositoryId}/relations/{relationId}/execute",
            pathParams: { repositoryId: id, relationId },
            body: body ?? {},
          });
        }
        if (!body) {
          throw new Error(
            "Either relationId or body is required for execute_relation",
          );
        }
        return ctx.client.request({
          method: "POST",
          path: "/api/v1/repositories/{repositoryId}/relations/execute",
          pathParams: { repositoryId: id },
          body,
        });
      }),
  );
}
