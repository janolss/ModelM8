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
| Absolute URL repeated on many docs | Create a document root; still store **full** absolute URLs; match to root in 2c8 UI after create |
| Relative / `file://folder/…` link | Recreate with full `file:///…` (use `documentRootKey` + `relativePath` so MCP joins root.value) |
| Rejected: relative content | `languages.*.content` must be absolute `https://` / `file:///…` — API `prefix` does not make relative paths valid |
| Doc visible in 2c8 but click does nothing | Bare relative path. Run `verify_document_links`; recreate absolute URLs; then UI-match to document root |
| Duplicate / orphan MT document | `unlink_document` then `delete_mt_document` (`TWO_C8_ALLOW_DELETES=true`). Confirm with `search_documents` / `verify_document_links` |
| Empty `DOC_BASE_URL` in IMS plan | Do **not** skip roots — use `SOURCE_DIR` (or inventoried library) as root `value` |
| `verify_document_links` `relative-without-absolute-url` | Stored path is not absolute; recreate with full URL (`documentRootKey` + `relativePath` joins root.value) |
| Empty URL in secondary language (SV) while EN works | `content` is per language. Re-link with `titles` map or `updateDocumentBody` setting `languages.<svId>.content` to the same absolute URL. Re-run `verify_document_links` **without** `languageId` |
| `verify_document_links` allPass but GUI empty on SV | You verified only EN. Omit `languageId` (checks all languages) |

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
