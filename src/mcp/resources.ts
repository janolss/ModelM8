import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  readKnowledgeResource,
  type MethodologyPack,
} from "../methodology/loader.js";

export function registerMethodologyResources(
  server: McpServer,
  pack: MethodologyPack,
): void {
  for (const entry of pack.resourceIndex) {
    const safeName = entry.name.replace(/[^\w.-]+/g, "_");
    server.registerResource(
      safeName,
      entry.uri,
      {
        description: `2c8 methodology: ${entry.name}`,
        mimeType: entry.relativePath.endsWith(".json")
          ? "application/json"
          : "application/yaml",
      },
      async (uri) => {
        const text = readKnowledgeResource(pack, entry.relativePath);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: entry.relativePath.endsWith(".json")
                ? "application/json"
                : "text/yaml",
              text,
            },
          ],
        };
      },
    );
  }
}
