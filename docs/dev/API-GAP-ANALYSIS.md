# API gap analysis: 2c8 OpenAPI vs the MCP server

Comparison between the OpenAPI schema from
`https://your-server.example/mt-backend/api/v1/openapi.json`
(MT backend REST API, version 1.0.0) and the endpoints
`modelM8` uses after the methodology-driven rebuild (v1.1).

Updated: 2026-11-22 (v1.2 quality tools).

## Summary

| Metric | Value |
|--------|-------|
| Operations in OpenAPI | **214** (128 paths) |
| Operations with MCP / domain support (v1.2) | **~75+** (direct or via domain tools) |
| Earlier (v1.1 / v1.0) | **~70** / **43** |
| MCP calls missing from OpenAPI | **0** |

The server is **methodology-driven**: domain tools for process consumption and
text/document-to-model, plus analysis tools. Admin / plugin / publishing remain
intentionally out of phase 1.

## Consume improvements (after agent feedback)

- `get_process_flow` returns **titles** (from canvas `labels`) + grouped
  `inputs` / `outputs` / `responsible` / `applications` / `controlledBy` (CONTROLS)
- `describe_process` — narrative `summaryText` + structured JSON
- `describe_role` / `find_symbol_usage` — role → processes/activities without manual N-model scanning
- `get_controlling_documents` — activity → controlling documents (e.g. onboarding checklist)
- `search_documents` / `resolve_documents` / `get_document_content` — resolve + PDF/text extract
- `resolve_symbols` — batch UUID → title/objectType/documents
- `find_models` server-side `filter`; `search_symbols` supports `modelId`
- Prompt `describe_role_onboarding`

## New coverage in v1.1 (vs gaps from v1.0)

| Area | Status |
|------|--------|
| Repository configuration | `list_allowed_types` → `GET …/configuration` |
| Breakdowns | `get_breakdowns`, `create_breakdown` |
| Documents / roots / types / sources | list + `link_document` + `create_document_root` / `create_document_type` |
| Matrices | `get_matrices`, `get_matrix`, `execute_matrix` |
| Relations execute | `execute_relation` |
| Lists get-by-id | `get_list` |
| Layers (read) | included in `get_process_overview` |
| Methodology pack | MCP resources `methodology://…` + `get_methodology` |

## Domain tools (map to multiple APIs)

| MCP tool | Underlying API |
|----------|----------------|
| `find_models` / `get_process_*` | models + canvas (+ layers) |
| `search_symbols` / `reuse_symbol` | symbols + canvas/vertices |
| `add_process_step` | symbols + vertices + edges |
| `set_activity_performer` / `set_step_io` | vertices + edges |
| `link_document` | mt-documents (+ optional `prefix`=root key) + PATCH symbol |
| `create_document_root` | `POST …/document-roots` (`key`, `value`, `titles`) |
| `propose_*` / `apply_model_proposal` | narrative propose + batch write (symbols/vertices/edges: flow, raciresponsible, controls, isusedby) |
| `create_repository` | `POST /api/v1/repositories` |
| `create_canvas_edge` | `POST …/canvas/edges` |
| `list_allowed_types` | configuration (+ knowledge pack) |

## Remaining gaps (phase 1+)

### Added in v1.2 (after TechSeed IMS delivery)
- `list_untranslated_symbols`, `verify_handoffs`, `get_navigation_tree`, `verify_process_coverage`
- `create_document_type`, `retarget_vertex_symbol`
- `move_canvas_vertices` auto-reorthogonalize; empty HTTP 200 → `{ ok: true }`
- `get_breakdowns` 404 → empty + points to navigation tree

### Added after S1 (P0 write helpers, 2026-11-22)
- `set_activity_used_by` (IS_USED_BY under activity)
- `set_activity_controls` (CONTROLS above activity)
- `retarget_vertex_symbol` sends label bounds via `placeVertex` (fixes 400 Label bounds)

### Added after S2 (P0 quality, 2026-11-22)
- `list_orphan_symbols` (canvas diff; `titlePrefix` e.g. ZZ_)
- `verify_handoffs` extended: `contract[]` + `autoDiscover.modelIds` (primary out ∩ in)

### Added after S3 (P1 traceability, 2026-11-22)
- `get_model_descriptions` / `get_symbol_descriptions`
- `create_description_type`
- `delete_breakdown` (link only; writes, not ALLOW_DELETES)
- `unlink_document` (symbol.documents subtract)

### Added after S4 (P2 production, 2026-11-22)
- Properties read: `get_symbol_properties`, `get_model_properties`, `get_vertex_properties` (GET only)
- Versions: `list_model_versions`, `get_model_version`, `create_model_version`, `update_model_version`, `list_symbol_versions`
- Layers: `list_layers`, `create_layer`, `delete_layer`
- `update_swimlane_settings` (PATCH canvas.swimlaneSettings)
- `create_process_map` layout `threeBand` (management / core / support)

### Relevant but incomplete
- Model/symbol/vertex **properties** (provider/key) — no dedicated tools
- Symbol **versions** list/get
- Model version **create/update** (beyond accept draft)
- Document sources **list keys** endpoint (sources + resolve exist partly via documents service)
- Layer types CRUD / create-delete layer (read-only via overview)
- Full swimlane geometry API (placement via coordinates)

### Intentionally out of phase 1
- API keys, users, groups, accessors, permission groups CRUD
- Plugins / plugin-data / plugin-relations
- Publications / publish profiles / templates
- Icons, images, reports, notifications, subscribers, settings, color schemes
- Directory write CRUD (repository *create* is supported via `create_repository`)
- Language / description-type write CRUD
- Pixel-perfect canvas layout / swimlane geometry

## Verification

| Check | Result |
|-------|--------|
| `npm run typecheck` | OK |
| `npm run build` | OK |
| Knowledge pack load | 14 object types, 13 model types, 17 resources |
| `propose_model_from_text` | Extracts process steps + naming validation |
| HTTP `GET /health` | OK (`writeMode=draft`) |
| Live MT-backend E2E | OK — repo `Utveckling MCP`, text→`Rekrytera och anställa` with FLOW/RACI/CONTROLS/IS_USED_BY |

For live verification: `TWO_C8_ALLOW_WRITES=true`, `TWO_C8_WRITE_MODE=direct`,
`create_repository` → `propose_model_from_text` → `apply_model_proposal` → `describe_process`.

## Phase 1 definition of done

- [x] Methodology pack with source references under `knowledge/`
- [x] HTTP MCP with instructions, resources, prompts
- [x] Consume + propose + draft-first write tools
- [x] Rules engine (pack + configuration API)
- [x] Text→model E2E in sandbox repo (Utveckling MCP)
