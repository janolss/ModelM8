import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { withControlPointBoundsHint } from "./canvas-layout-hints.js";

/** Soft cap for MCP tool text payloads (pretty JSON). Compact form used before truncate. */
export const MAX_JSON_RESULT_CHARS = 400_000;

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
  if (typeof data === "string") {
    const text =
      data.length <= MAX_JSON_RESULT_CHARS
        ? data
        : `${data.slice(0, MAX_JSON_RESULT_CHARS - 80)}\n…[truncated ${data.length} chars]`;
    return { content: [{ type: "text", text }] };
  }

  let text = JSON.stringify(data, null, 2);
  if (text.length > MAX_JSON_RESULT_CHARS) {
    const compact = JSON.stringify(data);
    if (compact.length <= MAX_JSON_RESULT_CHARS) {
      text = compact;
    } else {
      text = JSON.stringify(
        {
          truncated: true,
          originalChars: compact.length,
          maxChars: MAX_JSON_RESULT_CHARS,
          note: "Response truncated — narrow the query, lower maxResults, or paginate.",
          preview: compact.slice(0, Math.floor(MAX_JSON_RESULT_CHARS * 0.85)),
        },
        null,
        2,
      );
    }
  }

  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

export function errorResult(error: unknown): CallToolResult {
  const raw = error instanceof Error ? error.message : String(error);
  const message = withControlPointBoundsHint(raw, "generic");
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

export async function runTool(action: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return jsonResult(await action());
  } catch (error) {
    return errorResult(error);
  }
}

export function agentResult(payload: AgentPayload): CallToolResult {
  return jsonResult(payload);
}
