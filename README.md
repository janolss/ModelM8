# ModelM8

Methodology-driven MCP server for AI agents that **consume** and **create/edit**
business processes in [2c8 Modeling Tool](https://www.2c8.com)
(flows, roles/responsibilities, document links, breakdowns) via text-to-model,
talk-to-model, and document-to-model.

OpenAPI: `https://<host>/mt-backend/api/v1/openapi.json`  
Methodology: curated pack under [`knowledge/`](knowledge/) (based on
[2c8 Help Center](https://support.2c8.com/hc/sv/categories/4906383560093-2c8-Modeling-Tool)).

## Features

- TypeScript MCP with `@modelcontextprotocol/sdk`
- **Streamable HTTP** (primary) and stdio
- Domain tools (process flow, reuse-first, propose/apply) + analysis (list/query/matrix/relation)
- MCP **resources** (`methodology://…`), **prompts**, and server **instructions**
- Rules from knowledge pack + repository `configuration`
- Writes behind `TWO_C8_ALLOW_WRITES` with `TWO_C8_WRITE_MODE=draft|direct`
- Deletes behind `TWO_C8_ALLOW_DELETES` (`delete_model`)

## Requirements

- Node.js 20+

## Setup

```bash
npm install
cp .env.example .env
# edit .env
npm run build
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TWO_C8_BASE_URL` | *(required)* | MT backend base URL |
| `TWO_C8_API_KEY` | *(required)* | API key (`x-api-key`) |
| `TWO_C8_ALLOW_WRITES` | `false` | Register write tools |
| `TWO_C8_ALLOW_DELETES` | `false` | Register `delete_model` |
| `TWO_C8_WRITE_MODE` | `draft` | `draft` or `direct` |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | HTTP host |
| `KNOWLEDGE_DIR` | *(auto)* | Override path to `knowledge/` |

## Run

```bash
# HTTP (AI tools point at http://host:port/mcp)
npm run start:http

# stdio (Cursor / Claude Desktop)
npm start
```

Health: `GET /health`

### Docker

```bash
docker build -t modelm8 .
docker run --rm -p 3000:3000 \
  -e TWO_C8_BASE_URL=https://host/mt-backend \
  -e TWO_C8_API_KEY=... \
  -e TWO_C8_ALLOW_WRITES=false \
  modelm8
```

## Agent workflows

| Prompt | Purpose |
|--------|---------|
| `consume_process` | Understand an existing process |
| `text_to_process_model` | Text/talk → model |
| `document_to_process_model` | Document → model |

Policy (server instructions): reuse-first, draft-first, input/output on process,
performer on activity, naming verb+noun.

## Tool surface (phase 1)

**Orientation:** `get_methodology`, `list_allowed_types`, `validate_against_methodology`  
**Consume:** `describe_process`, `describe_role`, `describe_role_introduction`
(operational RACI vs formal HR intro vs support hints), `find_symbol_usage` (`enrich`),
`get_controlling_documents`, `find_models`, `get_process_flow` (incl. CONTROLS),
`resolve_symbols`, `search_documents`, `resolve_documents`, `get_document_content`,
`search_symbols` (`modelId`), other read tools  
**Analysis:** `execute_query`, `execute_list`, `execute_matrix`, `execute_relation`, …  
**Propose:** `propose_model_from_text` (narrative + prefixed), `propose_model_from_document`  
**Write (if enabled):** `create_repository`, `create_process_model`,
`apply_model_proposal` (FLOW + RACI + CONTROLS + IS_USED_BY), `create_canvas_edge`,
`add_process_step`, `reuse_symbol`, `set_activity_performer` (`raciresponsible`),
`set_step_io`, `link_document`, `create_breakdown`, `place_in_swimlane`, …

See [API-GAP-ANALYSIS.md](API-GAP-ANALYSIS.md) for API coverage.

## Development

```bash
npm run dev:http
npm run typecheck
```
