# Text-to-model

## When

You have a process description in text and want a detail model in 2c8.

## Prerequisites

- Writes on (`TWO_C8_ALLOW_WRITES=true`)
- `repositoryId` + `languageId` (`list_languages`)
- Methodology: infinitive + noun; BO = value/artefact (not a status echo)

## Agent prompt

[examples/prompts/text-to-model.md](../../examples/prompts/text-to-model.md)  
MCP prompt: `text_to_process_model`

## Steps

1. `get_methodology` — `process`, `activity` (read `descriptionGuidance`), `naming`, `business-objects`, `reuse-first`
2. `propose_model_from_text` (prefer **prefixed** text: `Process:`, `Activity:`, `Decision:`, `Yes:`/`No:`)
3. Fix `namingChecks` for business objects
4. Branching: `resolve_branching_object_type` → `or` (never gateway/join)
5. `search_symbols` in the target repo — reuse UUIDs
6. `apply_model_proposal` — require `businessObjectCount > 0`
7. `describe_process`
8. Gaps: `set_activity_performer`, `set_step_io`, `create_canvas_edge` (Yes/No)
9. **`review_process_model`** → fix → repeat until OK
10. Activity descriptions: `update_symbol_description` **only** where source text gives purpose/why/considerations — complement the canvas (not RACI/documents/BOs). No source → leave empty. See `activity.descriptionGuidance`.
11. Translation: `update_titles` (sets `translated: true`) for the secondary language
12. If the model has a parent: `link_breakdown` **immediately**

## Definition of done

- Review without errors (or a logged exception)
- Every activity has input, output, and responsible
- Branching is `or` with Yes/No
- Activity descriptions are source-based (or intentionally empty)

## Common mistakes

| Symptom | Action |
|---|---|
| `businessObjectCount = 0` | Chain must alternate BO ↔ activity |
| Globe still on for EN | `confirm_translations` or `update_titles` with the right flag |
| Join/gateway | Use `or` |
