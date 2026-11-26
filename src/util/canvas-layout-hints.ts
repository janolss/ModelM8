/** Detect 2c8 canvas validation that blocks move/edge patches. */
export function isControlPointBoundsError(message: string): boolean {
  return /Control point (end|start) must lie within the (to|from)-vertex bounds/i.test(message);
}

/**
 * Append agent-facing recovery hints when canvas layout validation fails.
 * Safe to call on any error string — returns original if not a control-point case.
 */
export function withControlPointBoundsHint(
  message: string,
  context: "move" | "update_edges" | "generic" = "generic",
): string {
  if (!isControlPointBoundsError(message) && !/Control point/i.test(message)) {
    return message;
  }

  const lines = [message.trim(), "", "Hint (2c8 canvas validation):"];

  if (context === "update_edges") {
    lines.push(
      "- Do not update_canvas_edges to a *future* vertex position before the vertex has moved (or vice versa).",
      "- Prefer move_canvas_vertices alone — it patches vertices + attached edges in one request.",
      "- If still stuck: delete_canvas_edge(edgeIds) → move_canvas_vertices → create_canvas_edge (recreate FLOW/RACI).",
    );
  } else if (context === "move") {
    lines.push(
      "- move_canvas_vertices should patch vertices + attached edges together; a bare vertex PATCH fails this check.",
      "- Recovery if move still fails: delete_canvas_edge on attached edgeIds → move_canvas_vertices → create_canvas_edge to recreate routes.",
      "- Do not call update_canvas_edges before/after a separate move — that chicken-and-egg also 400s.",
    );
  } else {
    lines.push(
      "- Prefer move_canvas_vertices (vertices + edges in one PATCH).",
      "- Recovery: delete_canvas_edge → move_canvas_vertices → create_canvas_edge.",
      "- Never update_canvas_edges to targets that are not yet at the edge endpoints' vertex bounds.",
    );
  }

  lines.push("Then: review_process_model.");
  return lines.join("\n");
}
