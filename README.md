# 2c8 MCP Server

Metodikdriven MCP-server för AI-agenter som ska **konsumera** och **skapa/redigera**
verksamhetens processer i [2c8 Modeling Tool](https://www.2c8.com)
(flöden, roller/ansvar, dokumentlänkar, nedbrytningar) enligt text-to-model,
talk-to-model och document-to-model.

OpenAPI: `https://<host>/mt-backend/api/v1/openapi.json`  
Metodik: kuraterat pack under [`knowledge/`](knowledge/) (baserat på
[2c8 Help Center](https://support.2c8.com/hc/sv/categories/4906383560093-2c8-Modeling-Tool)).

## Features

- TypeScript MCP med `@modelcontextprotocol/sdk`
- **Streamable HTTP** (primärt) och stdio
- Domain-verktyg (process flow, reuse-first, propose/apply) + analys (list/query/matrix/relation)
- MCP **resources** (`methodology://…`), **prompts** och server **instructions**
- Regler från knowledge-pack + repository `configuration`
- Write bakom `TWO_C8_ALLOW_WRITES` med `TWO_C8_WRITE_MODE=draft|direct`

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
docker build -t 2c8-mcp-server .
docker run --rm -p 3000:3000 \
  -e TWO_C8_BASE_URL=https://host/mt-backend \
  -e TWO_C8_API_KEY=... \
  -e TWO_C8_ALLOW_WRITES=false \
  2c8-mcp-server
```

## Agent workflows

| Prompt | Purpose |
|--------|---------|
| `consume_process` | Förstå befintlig process |
| `text_to_process_model` | Text/talk → modell |
| `document_to_process_model` | Dokument → modell |

Policy (server instructions): reuse-first, draft-first, input/output på process,
utförare på aktivitet, namngivning verb+substantiv.

## Tool surface (fas 1)

**Orientering:** `get_methodology`, `list_allowed_types`, `validate_against_methodology`  
**Konsumera:** `describe_process`, `describe_role`, `describe_role_introduction`
(operativ RACI vs formell HR-intro vs stödhintar), `find_symbol_usage` (`enrich`),
`get_controlling_documents`, `find_models`, `get_process_flow` (inkl. CONTROLS),
`resolve_symbols`, `search_documents`, `resolve_documents`, `get_document_content`,
`search_symbols` (`modelId`), övriga läsverktyg  
**Analys:** `execute_query`, `execute_list`, `execute_matrix`, `execute_relation`, …  
**Propose:** `propose_model_from_text`, `propose_model_from_document`  
**Write (om aktiverat):** `create_process_model`, `add_process_step`, `reuse_symbol`,
`set_activity_performer`, `set_step_io`, `link_document`, `create_breakdown`,
`place_in_swimlane`, `apply_model_proposal`, …

Se [API-GAP-ANALYSIS.md](API-GAP-ANALYSIS.md) för API-täckning.

## Development

```bash
npm run dev:http
npm run typecheck
```
