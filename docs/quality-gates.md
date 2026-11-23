# Quality gates

Use these after every model and before closing an area / IMS.

## Always after a write

1. `describe_process` or `describe_process_map`  
2. **`review_process_model`** — fix errors (missing BO, activity→activity, performers, layout)  
3. Re-run review until OK or a logged exception  
4. **Activity descriptions** (detail models): if source material gives purpose/why/considerations → `update_symbol_description` per `activity.descriptionGuidance` (complement the canvas; no guessing). Otherwise leave empty.

## Translations

1. `update_titles` with the secondary language → sets `translated: true`  
2. Or `confirm_translations(languageId)` for existing text (symbols, models, **edge labels**)  
3. `list_untranslated_symbols` — should be empty (or only deliberate exceptions)

## Navigation

- `link_breakdown` immediately after creating a detail/overview under a parent  
- `get_navigation_tree(rootModelId)` — `missingUpwardLinks` should be empty  
- `get_breakdowns` applies to **detail models**, not L0

## Handoffs and coverage

- `verify_handoffs` — same BO UUID on producer and consumer (`handoffs[]`, `contract[]`, and/or `autoDiscover.modelIds`)  
- `list_orphan_symbols` — canvas orphans (e.g. `titlePrefix: "ZZ_"`) before close-out  
- `verify_process_coverage` — process-register rows → models (+ reachability from L0)

## Document links

- **`verify_document_links`** — after mass `link_document` / Q3–Q5: resolved links must be absolute `https://` or `file:///…`  
- **Omit `languageId`** to check **all** repo languages (default). Passing only the default language misses empty secondary-language URLs.  
- Flags bare relative / invalid `file://` / `missing-link` **per language**, and by default missing roots when documents exist (roots needed for later UI matching)  
- Optional `checkFileExists` for local `file:///` probes  
- Fix: `create_document_root` → `link_document(documentRootKey, relativePath, titles: { … })` (same absolute URL on every language) → user matches roots in 2c8 UI

## Area / IMS

| Gate | Requirement |
|---|---|
| Model | Review OK |
| Area | Map scopeOk, breakdowns, area handoffs, translations, `verify_document_links` |
| Whole | Navigation tree, coverage, all handoffs, document links, final report |

See also plan template Q1–Q5 in [templates/Create-2c8-IMS-Plan-Template.md](../templates/Create-2c8-IMS-Plan-Template.md).
