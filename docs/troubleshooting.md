# Troubleshooting

## Connection

| Symptom | Action |
|---|---|
| No tools / auth errors | Restart modelM8; reconnect the MCP client |
| `list_repositories` fails | Check `TWO_C8_BASE_URL`, API key, network |
| Write tools missing | `TWO_C8_ALLOW_WRITES=true` and restart |

## Empty HTTP 200

Many PATCH responses return an empty body. modelM8 treats that as `{ ok: true }`. That is **not** an error.

## Documents

| Error | Action |
|---|---|
| `Document type must be provided` | Field `type`: `"URL"` or `"file"` (not the same as `documentTypes`) |
| 400 on link | Use `{ id, source: "mt.documents" }` — not bare UUID strings |
| No document types in a new repo | `create_document_type` after `list_document_types` |
| `Key cannot be null or empty` (document-roots) | `create_document_root` requires `key` + `value` (+ titles) |
| Absolute URL repeated on many docs | Propose/create a document root; use `prefix` + relative path |

## Translations / globes in the 2c8 UI

- `translated: true` = confirmed (globe off)  
- `translated: false` = not translated (globe on)  
- Symbol titles: `update_titles` / `confirm_translations`  
- **Edge labels** (Yes/No): included in `confirm_translations` (not in symbol-only PATCH)

## Breakdowns

- Links are stored on the **detail** (`broken-down-from`)  
- `get_breakdowns(overview)` often empty/404 → `get_navigation_tree`

## Modelling

| Error | Action |
|---|---|
| gateway / join | `resolve_branching_object_type` → `or`; never Join |
| `businessObjectCount = 0` | Alternate BO ↔ activity in the chain |
| 400 after moving symbols | `move_canvas_vertices` reorthogonalizes edges by default |

## Developer docs

- [API-GAP-ANALYSIS.md](dev/API-GAP-ANALYSIS.md)  
- [mcp-errors.md](dev/mcp-errors.md)
