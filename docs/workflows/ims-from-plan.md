# Full IMS / management system via plan

## When

You have a document folder (policies, directives, practices, process register) and want a **navigable** visual management system in 2c8: L0 → area maps → details.

## Prerequisites

- modelM8 with writes
- Source folder locally (or equivalent extract)
- Filled plan template: [templates/Create-2c8-IMS-Plan-Template.md](../../templates/Create-2c8-IMS-Plan-Template.md)

## Agent prompt

[examples/prompts/run-ims-plan.md](../../examples/prompts/run-ims-plan.md)

## Steps (overview)

1. Copy the template, fill `{{PLACEHOLDERS}}`, confirm parameters with the user  
2. The agent follows the plan phases (G0 → … → G3 pilot → expansion → L0 → Q4/Q5)  
3. Everything is written to the **2c8** repository via modelM8 — not “into modelM8”

Key lessons from deliveries:

- **Handoff contracts** (same BO UUID) *before* mass text-to-model  
- In analysis: identify shared document bases (`DOC_BASE_URL`, library folder) and **propose document roots** in the plan; create with `create_document_root` in phase 2 before mass `link_document`  
- **Activity descriptions:** after review, `update_symbol_description` only when source gives purpose/why/considerations — complement the canvas (not RACI/documents/BOs). Template §7 + `get_methodology` topic `activity` → `descriptionGuidance`. Empty > guessing.  
- Translate and set `translated: true` early (`update_titles` / `confirm_translations`, including edge labels)  
- `link_breakdown` immediately after each non-root model  
- `get_navigation_tree` + `verify_handoffs` + `verify_process_coverage` in final checks  
- First area overview is often **manual**; `create_process_map` when scopes share UUIDs  

## Definition of done

Per template sections 1 and 12: coverage, navigation, review, traceability, gap log.

## Common mistakes

| Symptom | Action |
|---|---|
| L0 three-band triggers review errors | Approved exception for management/support without FLOW — see the template |
| `get_breakdowns(L0)` empty | Use `get_navigation_tree` |
| Globes left on Yes/No | `confirm_translations` (edge labels) |
