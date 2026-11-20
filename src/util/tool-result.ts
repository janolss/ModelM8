import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface AgentPayload {
  data?: unknown;
  methodologyNotes?: string[];
  namingCheck?: { pass: boolean; hint?: string; objectTypeId?: string };
  reuseCandidates?: unknown[];
  configViolations?: string[];
  nextSuggestedTools?: string[];
  [key: string]: unknown;
}

export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

export async function runTool(
  action: () => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    return jsonResult(await action());
  } catch (error) {
    return errorResult(error);
  }
}

export function agentResult(payload: AgentPayload): CallToolResult {
  return jsonResult(payload);
}
