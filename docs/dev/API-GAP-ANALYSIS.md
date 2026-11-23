# API gap analysis: 2c8 OpenAPI vs the MCP server

Comparison between the OpenAPI schema from
`https://your-server.example/mt-backend/api/v1/openapi.json`
(MT backend REST API) and the MCP tools exposed by **modelM8**.

Updated: **2026-11-23** against modelM8 **v1.3.2** (tool/knowledge inventory) and a **live re-fetch** of OpenAPI 3.0.1 (`info.version` **1.0.0**).

## Summary

| Metric | Value |
|--------|-------|
| OpenAPI (live, 2026-11-23) | **214** operations / **128** paths (`GET` 109, `POST` 45, `DELETE` 30, `PATCH` 29, `PUT` 1) |
| MCP tools registered in code | **99** (gated: writes / deletes) |
| MCP prompts | **5** |
| Methodology resources (`methodology://…`) | **21** |
| Knowledge object types / model types / rules | **19** / **14** / **7** |
| MCP calls with no OpenAPI counterpart | **0** (still true for shipped HTTP paths) |

The server is **methodology-driven**: domain tools for process consumption and
text/document-to-model, plus analysis and quality gates. Admin / plugin / publishing remain
intentionally out of scope.

Tool registration gates:

| Gate | Tools |
|------|--------|
| Always on | methodology, consume, analysis, quality, propose |
| `TWO_C8_ALLOW_WRITES=true` | write tools (~34) |
| `TWO_C8_ALLOW_DELETES=true` | `delete_model`, `delete_symbol`, `delete_mt_document` |

## Tool inventory (v1.3.2)

### Methodology (5)

`get_api_versions`, `get_methodology`, `list_allowed_types`, `resolve_branching_object_type`, `validate_against_methodology`

### Consume / describe (37)

| Group | Tools |
|-------|--------|
| Repos / nav | `list_repositories`, `get_repository`, `list_languages`, `list_directories`, `get_directory` |
| Models / flow | `find_models`, `get_process_overview`, `get_process_flow`, `get_detail_process_scope`, `describe_process`, `describe_process_map`, `review_process_model` |
| Symbols / roles | `search_symbols`, `resolve_symbols`, `find_symbol_usage`, `describe_role`, `describe_role_introduction`, `get_roles_and_responsibilities`, `get_object_documents` |
| Documents | `list_document_types`, `list_document_roots`, `list_document_sources`, `search_documents`, `resolve_documents`, `get_document_content`, `get_controlling_documents` |
| Descriptions | `list_description_types`, `get_model_descriptions`, `get_symbol_descriptions` |
| Properties (GET) | `get_symbol_properties`, `get_model_properties`, `get_vertex_properties` |
| Versions / layers (read) | `list_model_versions`, `get_model_version`, `list_symbol_versions`, `list_layers` |
| Breakdowns | `get_breakdowns` |

### Analysis (11)

`list_relations`, `get_relation`, `get_relation_script`, `execute_relation`, `get_lists`, `get_list`, `execute_list`, `get_matrices`, `get_matrix`, `execute_matrix`, `execute_query`

### Quality (6)

`list_untranslated_symbols`, `list_orphan_symbols`, `verify_handoffs`, `get_navigation_tree`, `verify_process_coverage`, `verify_document_links`

### Propose (5)

`propose_model_from_text`, `propose_model_from_document`, `propose_process_map_from_models`, `validate_process_map_bridges`, `apply_model_proposal`

### Write — when `ALLOW_WRITES` (34)

| Group | Tools |
|-------|--------|
| Repo / model shell | `create_repository`, `create_process_model`, `create_process_map`, `accept_draft_model` |
| Canvas / steps | `add_process_step`, `reuse_symbol`, `create_canvas_edge`, `update_canvas_edges`, `delete_canvas_edge`, `delete_canvas_vertex`, `move_canvas_vertices`, `retarget_vertex_symbol`, `place_in_swimlane` |
| Activity satellites | `set_activity_performer`, `set_activity_used_by`, `set_activity_controls`, `set_step_io` |
| Documents / types | `link_document`, `unlink_document`, `create_document_root`, `create_document_type`, `create_description_type` |
| Breakdowns | `create_breakdown`, `link_breakdown`, `delete_breakdown` |
| Versions / layers | `create_model_version`, `update_model_version`, `create_layer`, `delete_layer`, `update_swimlane_settings` |
| Titles / descriptions | `update_titles`, `confirm_translations`, `update_model_description`, `update_symbol_description` |

### Delete — when `ALLOW_DELETES` (3)

`delete_model`, `delete_symbol`, `delete_mt_document`

### Prompts (5)

`consume_process`, `text_to_process_model`, `document_to_process_model`, `describe_role_onboarding`, `create_process_map_overview`

## Domain mapping (high level)

| MCP surface | Underlying MT API areas |
|-------------|-------------------------|
| `find_models` / `get_process_*` / `describe_*` | models + canvas (+ layers, labels) |
| `search_symbols` / `reuse_symbol` / canvas edits | symbols + canvas/vertices/edges |
| `set_activity_*` / `set_step_io` | vertices + edges (RACI / FLOW / CONTROLS / IS_USED_BY) |
| `link_document` / roots / types | mt-documents + PATCH symbol |
| `propose_*` / `apply_model_proposal` | narrative propose + batch symbols/vertices/edges |
| `create_process_map` / bridges / detail scope | models + canvas + breakdowns; I/O from detail scopes |
| `list_allowed_types` / `get_methodology` | configuration + knowledge pack |
| Analysis execute_* | lists / matrices / relations / query |
| Quality verify_* / navigation | models + symbols + canvas + languages |

## Consume highlights (still accurate)

- `get_process_flow` returns **titles** (canvas `labels`) + grouped `inputs` / `outputs` / `responsible` / `applications` / `controlledBy`
- `describe_process` — narrative `summaryText` + structured JSON; decisions/vägval under decisions
- `describe_role` / `describe_role_introduction` / `find_symbol_usage`
- Document resolve + `get_document_content` (PDF/text extract)
- `review_process_model` after writes (methodology + layout)
- `get_detail_process_scope` for overview I/O contracts

## Remaining gaps

### Partially covered / incomplete

- **Properties write** — OpenAPI appears GET-only for provider bags; MCP exposes GET tools only (`get_*_properties`)
- **Symbol version get-by-id** — `list_symbol_versions` exists; no dedicated `get_symbol_version` if OpenAPI has one
- **Layer types CRUD** — layer instances: `list/create/delete_layer`; layer-*type* admin still uncovered
- **Swimlane geometry** — `place_in_swimlane` + `update_swimlane_settings`; not a full geometry API
- **Language write CRUD** — `list_languages` only; title translation via `update_titles` / `confirm_translations`
- **Directory write CRUD** — `list_directories` / `get_directory` read; repo *create* via `create_repository`
- Stub model types in knowledge (`organisation`, `bpmn`, …) — listed for awareness; dedicated domain tools are process / process-map oriented

### Intentionally out of scope

- API keys, users, groups, accessors, permission-groups CRUD
- Plugins / plugin-data / plugin-relations
- Publications / publish profiles / templates
- Icons, images, reports, notifications, subscribers, settings, color schemes
- Pixel-perfect canvas layout engines beyond current move/reorthogonalize helpers

## Knowledge pack (loaded)

| Item | Count |
|------|-------|
| Object types | 19 (`process`, `activity`, `businessObject`, `role`, `or`/`vägval`, `and`, …) |
| Model types | 14 (`process`, `process-map`, `swimlane`, + stubs) |
| Rule topics | 7 |
| MCP resources | 21 (`methodology://…` over yaml/json under `knowledge/`) |

## Verification notes

| Check | Notes |
|-------|--------|
| Tool inventory | Derived from `src/tools/*-tools.ts` `registerTool` names |
| Knowledge counts | `loadMethodologyPack()` at doc update |
| OpenAPI | Live `GET …/api/v1/openapi.json` on 2026-11-23 → 214 ops / 128 paths (unchanged vs prior count) |
| Live E2E | Historical OK on sandbox repo `Utveckling MCP` (text→process with FLOW/RACI/CONTROLS/IS_USED_BY) |

For live smoke: `TWO_C8_ALLOW_WRITES=true`, preferred `TWO_C8_WRITE_MODE=direct` in a sandbox,
`create_repository` → `propose_model_from_text` → `apply_model_proposal` → `describe_process` → `review_process_model`.

## Phase 1 definition of done

- [x] Methodology pack with sources under `knowledge/`
- [x] HTTP MCP with instructions, resources, prompts
- [x] Consume + propose + draft-first write tools
- [x] Rules engine (pack + configuration API)
- [x] Text→model E2E in sandbox repo
- [x] Quality gates, process maps / threeBand, translations, canvas fix-up tools (v1.2–v1.3)
