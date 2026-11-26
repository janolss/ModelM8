# Troubleshooting

## Connection

| Symptom | Action |
|---|---|
| No tools / auth errors | Restart modelM8; reconnect the MCP client |
| HTTP `401 Unauthorized` on `/mcp` | `MCP_HTTP_AUTH_TOKEN` is set — send `Authorization: Bearer <token>` from the client |
| `list_repositories` fails | Check `TWO_C8_BASE_URL`, API key, network |
| Write tools missing | `TWO_C8_ALLOW_WRITES=true` and restart |
| Security warning about non-loopback HOST | Set `MCP_HTTP_AUTH_TOKEN` or bind `HOST=127.0.0.1` |
| Write blocked: write scope is unlocked / draft requires a locked write scope | Call `lock_write_repository` (or `create_repository` when unlocked) then retry |
| Cannot create_repository while write scope is locked | Unlock first (`unlock_write_repository` per policy), then create |
| Write blocked: repositoryId … outside write scope | Wrong repo — use `get_write_scope`; do not invent other UUIDs |

## Empty HTTP 200

Many PATCH responses return an empty body. modelM8 treats that as `{ ok: true }`. That is **not** an error.

## Documents

| Error | Action |
|---|---|
| `Document type must be provided` | Field `type`: `"URL"` or `"file"` (not the same as `documentTypes`) |
| 400 on link | Use `{ id, source: "mt.documents" }` — not bare UUID strings |
| No document types in a new repo | `create_document_type` after `list_document_types` |
| `Key cannot be null or empty` (document-roots) | `create_document_root` requires `key` + `value` (+ titles) |
| Absolute URL repeated on many docs | Create a document root; still store **full** absolute URLs; match to root in 2c8 UI after create |
| Relative / `file://folder/…` link | Recreate with full `file:///…` (use `documentRootKey` + `relativePath` so MCP joins root.value) |
| Rejected: relative content | `languages.*.content` must be absolute `https://` / `file:///…` — API `prefix` does not make relative paths valid |
| Doc visible in 2c8 but click does nothing | Bare relative path. Run `verify_document_links`; recreate absolute URLs; then UI-match to document root |
| Duplicate / orphan MT document | `unlink_document` then `delete_mt_document` (`TWO_C8_ALLOW_DELETES=true`). Confirm with `search_documents` / `verify_document_links` |
| Empty `DOC_BASE_URL` in IMS plan | Do **not** skip roots — use `SOURCE_DIR` (or inventoried library) as root `value` |
| `verify_document_links` `relative-without-absolute-url` | Stored path is not absolute; recreate with full URL (`documentRootKey` + `relativePath` joins root.value) |
| Empty URL in secondary language (SV) while EN works | `content` is per language. Re-link with `titles` map or `updateDocumentBody` setting `languages.<svId>.content` to the same absolute URL. Re-run `verify_document_links` **without** `languageId` |
| `verify_document_links` allPass but GUI empty on SV | You verified only EN. Omit `languageId` (checks all languages) |
| `get_document_content` refuses `file://` / “outside allowed document roots” | Path must sit under a repo document root (`file:///…`) or `TWO_C8_DOCUMENT_READ_ROOTS`. Create/match roots first |
| `get_document_content` refuses private/loopback HTTP host | Expected SSRF guard — use a public URL or host the file under an allowed `file:///` root |
| `relativePath must not contain '.' or '..'` | Do not use `../` in `link_document` relative paths |

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
| 400 after moving symbols (`Control point end must lie within the to-vertex bounds`) | Use `move_canvas_vertices` only — it patches **vertices + attached edges together**. Do not `update_canvas_edges` before/after a separate move; that chicken-and-egg fails validation. |

## Developer docs

- [API-GAP-ANALYSIS.md](dev/API-GAP-ANALYSIS.md)  
- [mcp-errors.md](dev/mcp-errors.md)
