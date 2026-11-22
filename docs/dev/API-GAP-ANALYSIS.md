# API-gapanalys: 2c8 OpenAPI vs MCP-servern

Jämförelse mellan OpenAPI-schemat från
`https://406olsson.2c8.com/mt-backend/api/v1/openapi.json`
(MT backend REST API, version 1.0.0) och de endpoints som
`modelM8` använder efter metodikdriven ombyggnad (v1.1).

Uppdaterad: 2026-11-22 (v1.2 quality tools).

## Sammanfattning

| Mått | Värde |
|------|-------|
| Operationer i OpenAPI | **214** (128 paths) |
| Operationer med MCP-/domain-stöd (v1.2) | **~75+** (direkt eller via domain tools) |
| Tidigare (v1.1 / v1.0) | **~70** / **43** |
| MCP-anrop som saknas i OpenAPI | **0** |

Servern är **metodikdriven**: domain-verktyg för processkonsumtion och
text/document-to-model, plus analysverktyg. Admin/plugin/publicering är
fortfarande medvetet utanför fas 1.

## Consume-förbättringar (efter agentfeedback)

- `get_process_flow` returnerar **titlar** (från canvas `labels`) + grupperade
  `inputs` / `outputs` / `responsible` / `applications` / `controlledBy` (CONTROLS)
- `describe_process` — narrativ `summaryText` + strukturerad JSON
- `describe_role` / `find_symbol_usage` — roll → processer/aktiviteter utan N modellskanning manuellt
- `get_controlling_documents` — aktivitet → styrdokument (t.ex. Checklista onboarding)
- `search_documents` / `resolve_documents` / `get_document_content` — resolve + PDF/textutdrag
- `resolve_symbols` — batch UUID → titel/objectType/documents
- `find_models` server-side `filter`; `search_symbols` stöder `modelId`
- Prompt `describe_role_onboarding`

## Ny täckning i v1.1 (mot gap från v1.0)

| Område | Status |
|--------|--------|
| Repository configuration | `list_allowed_types` → `GET …/configuration` |
| Breakdowns | `get_breakdowns`, `create_breakdown` |
| Documents / roots / types / sources | list + `link_document` (mt-documents + symbol.documents) |
| Matrices | `get_matrices`, `get_matrix`, `execute_matrix` |
| Relations execute | `execute_relation` |
| Lists get-by-id | `get_list` |
| Layers (läs) | ingår i `get_process_overview` |
| Methodology pack | MCP resources `methodology://…` + `get_methodology` |

## Domain-verktyg (mappar till flera API:er)

| MCP-verktyg | Underliggande API |
|-------------|-------------------|
| `find_models` / `get_process_*` | models + canvas (+ layers) |
| `search_symbols` / `reuse_symbol` | symbols + canvas/vertices |
| `add_process_step` | symbols + vertices + edges |
| `set_activity_performer` / `set_step_io` | vertices + edges |
| `link_document` | mt-documents + PATCH symbol |
| `propose_*` / `apply_model_proposal` | narrativ propose + batch write (symbols/vertices/edges: flow, raciresponsible, controls, isusedby) |
| `create_repository` | `POST /api/v1/repositories` |
| `create_canvas_edge` | `POST …/canvas/edges` |
| `list_allowed_types` | configuration (+ knowledge pack) |

## Kvarvarande luckor (fas 1+)

### Tillagt i v1.2 (efter TechSeed IMS-leverans)
- `list_untranslated_symbols`, `verify_handoffs`, `get_navigation_tree`, `verify_process_coverage`
- `create_document_type`, `retarget_vertex_symbol`
- `move_canvas_vertices` auto-reorthogonalize; empty HTTP 200 → `{ ok: true }`
- `get_breakdowns` 404→tom + pekar på navigation tree

### Relevanta men ofullständiga
- Model/symbol/vertex **properties** (provider/key) — ej egna verktyg
- Symbol **versions** list/get
- Model version **create/update** (utöver accept draft)
- Document sources **list keys** endpoint (sources + resolve finns delvis via documents service)
- Layer types CRUD / create-delete layer (endast läsning via overview)
- Full swimlane geometry API (placement via koordinater)

### Medvetet utanför fas 1
- API keys, users, groups, accessors, permission groups CRUD
- Plugins / plugin-data / plugin-relations
- Publications / publish profiles / templates
- Icons, images, reports, notifications, subscribers, settings, color schemes
- Directory write CRUD (repository *create* is supported via `create_repository`)
- Language / description-type write CRUD
- Pixel-perfect canvas layout / swimlane geometry

## Verifiering

| Check | Resultat |
|-------|----------|
| `npm run typecheck` | OK |
| `npm run build` | OK |
| Knowledge pack load | 14 object types, 13 model types, 17 resources |
| `propose_model_from_text` | Extraherar process-steg + naming validation |
| HTTP `GET /health` | OK (`writeMode=draft`) |
| Live MT-backend E2E | OK — repo `Utveckling MCP`, text→`Rekrytera och anställa` med FLOW/RACI/CONTROLS/IS_USED_BY |

För live-verifiering: `TWO_C8_ALLOW_WRITES=true`, `TWO_C8_WRITE_MODE=direct`,
`create_repository` → `propose_model_from_text` → `apply_model_proposal` → `describe_process`.

## Fas 1 definition of done

- [x] Metodikpack med källhänvisningar under `knowledge/`
- [x] HTTP MCP med instructions, resources, prompts
- [x] Consume + propose + draft-first write tools
- [x] Rules-engine (pack + configuration API)
- [x] Text→modell E2E i sandbox-repo (Utveckling MCP)
