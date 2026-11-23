# Document-to-model

## When

You have a practice, procedure, or similar text and want to extract a process model into 2c8.

## Prerequisites

- Writes on
- `repositoryId` + `languageId`
- Document text available (pasted, a file the agent can read, or via `get_document_content` if the document already exists in 2c8)

## Agent prompt

[examples/prompts/document-to-model.md](../../examples/prompts/document-to-model.md)  
MCP prompt: `document_to_process_model`

## Steps

1. `get_methodology` — `process`, `activity` (`descriptionGuidance`), `documents-on-process`, `document-roots`, `naming`, `reuse-first`
2. If source documents share a base URL/folder: `list_document_roots` → propose/create a root with `create_document_root` (`key` + `value`)
3. `propose_model_from_document` (or `propose_model_from_text` if the text is already cleaned)
4. Present the proposal; rewrite status-like BOs into value/artefact titles
5. `search_symbols` + `validate_against_methodology`
6. `apply_model_proposal` — `businessObjectCount > 0`
7. `link_document` where possible (`documentRootKey` + `relativePath` + `titles` for **all** languages → same full absolute URL on each; or absolute `languages.*.content` per language; symbol link `{ id, source: mt.documents }`). Remind user to match roots in 2c8 UI after mass create. Then `verify_document_links` without `languageId`.
8. `describe_process` + **`review_process_model`** → fix → repeat
9. Activity descriptions from the source: `update_symbol_description` — purpose/why/considerations that **complement** the canvas; do not repeat RACI/documents/BOs. Not in the source → do not write. See `activity.descriptionGuidance`.
10. `update_titles` / `confirm_translations` for the secondary language
11. `link_breakdown` if the model has an overview parent

## Definition of done

- Review OK
- Traceability to source documents (at least in the model description; activity descriptions when the source supports it)
- No invented steps **or** invented activity descriptions (log assumptions)

## Common mistakes

| Symptom | Action |
|---|---|
| `Document type must be provided` | Set `type: "URL"` or `"file"`; optionally `create_document_type` |
| Process-wide doc on every activity | Move to the process symbol |
| EMF/images hard to parse | Ask for PNG/SVG or text excerpts |
