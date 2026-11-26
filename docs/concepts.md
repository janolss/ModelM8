# Concepts

## modelM8 vs 2c8

| | |
|---|---|
| **modelM8** | MCP server: tools, instructions, prompts, knowledge pack |
| **2c8** | Modeling Tool: repositories, models, symbols, canvas, methodology |

Do not say “the model lives in modelM8”. modelM8 *writes to* and *reads from* 2c8.

## Repository

All content belongs to a **repository** in 2c8. Create with `create_repository` or use an existing one. Symbol UUIDs are **repo-local** — never copy UUIDs across repositories.

## Languages

- `list_languages` returns a UUID per language (not only `sv_SE`/`en_GB`).
- The default language often omits the `translated` field.
- Other languages: `translated: true` = confirmed translation (globe off in UI); `false` = not translated (globe on).
- `update_titles` sets `translated: true`. Bulk confirm without new text: `confirm_translations` (includes edge labels).

## Draft vs direct

| `TWO_C8_WRITE_MODE` | Behaviour |
|---|---|
| `draft` | Models are created via the draft API; `accept_draft_model` brings them into the target repo. Draft creates still require an active write-scope lock (same as other writes). Failed populate rolls back via `DELETE …/repositories/draft/models/{id}`. |
| `direct` | Writes directly into the target repo (good for sandboxes) |

Write scope: every mutating tool (including deletes) asserts the locked `repositoryId` before running. `create_repository` is only allowed while unlocked (then auto-lock may apply).

## Reuse-first

Before creating a symbol: `search_symbols` in the **same** repo. Reuse the UUID when the business concept matches.

## Process vs process map

- **Detail process:** activities + business objects on FLOW, RACI per activity.
- **Overview / process map:** process chevrons + business objects (no activities). I/O must be the same symbols as in the detail models.

## Branching (vägval)

2c8 has no “gateway” type for exclusive choice. Call `resolve_branching_object_type` → use **`or`**. Never Join/Förbinda.

Pattern: `activity → BO → or → next activity`.

## Documents on activities

- **CONTROLS / IS_USED_BY** = step-specific.
- Process-wide policies: on the process symbol / documents panel, not fan-out onto every step.
- MT documents: `type: URL|file`; link via `{ id, source: "mt.documents" }`.
- `showInPanel`: omit by default (new tab). `true` = open in web-2c8 panel/iframe.
- Document roots: `create_document_root` (`key` + folder/`file:///`/`https` value — MCP normalizes/encodes). Links store **full absolute URLs** (`link_document(documentRootKey, relativePath, …)` joins `root.value` + encoded relative path; relative paths may not contain `.` / `..`). API `prefix` is **not** a root FK. After mass create, the user matches paths to the root in the 2c8 UI. Empty plan `DOC_BASE_URL` → still create a root from the source folder. `get_document_content` reads `file://` only under those roots (plus optional `TWO_C8_DOCUMENT_READ_ROOTS`) and blocks private/loopback HTTP fetches.
- **`languages.<languageId>.content` (URL) is language-specific**, same as titles. Creating with only the default language leaves secondary languages with empty/non-clickable links. Prefer `link_document(…, titles: { [enId]: "…", [svId]: "…" })` so the same absolute URL is written to every language. `verify_document_links` without `languageId` checks all repo languages.

## Activity descriptions

The description **complements** the canvas. The user already sees:

- **Roles** → who is responsible  
- **Documents** (CONTROLS / IS_USED_BY) → what governs or supports  
- **Business objects** in/out → what triggers/is refined vs what is handed on  

Write a **short** note on purpose/why and important considerations — **only** if that can be read from the source material. Do not repeat RACI/documents/BOs. If there is no source → leave empty (do not invent). Tool: `update_symbol_description`. Methodology: `get_methodology` topic `activity` → `descriptionGuidance`.

## Quality

No model is done without `review_process_model`. See [quality-gates.md](quality-gates.md).
