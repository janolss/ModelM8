# modelM8

[![CI](https://github.com/janolss/modelM8/actions/workflows/ci.yml/badge.svg)](https://github.com/janolss/modelM8/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/janolss/modelM8)](LICENSE)
[![Release](https://img.shields.io/github/v/release/janolss/modelM8)](https://github.com/janolss/modelM8/releases)

MCP server for AI agents that **read** and **create/edit** process models in [2c8 Modeling Tool](https://www.2c8.com).

- **modelM8** = the MCP tool  
- **2c8** = Modeling Tool (repositories, models, methodology)

Documentation: **[docs/README.md](docs/README.md)**

| Step | Link |
|---|---|
| Install | [docs/getting-started.md](docs/getting-started.md) |
| Connect a client | [docs/connect.md](docs/connect.md) |
| VS Code + Copilot | [docs/clients/vscode-copilot.md](docs/clients/vscode-copilot.md) |
| Workflows | [docs/workflows/](docs/workflows/) |
| IMS plan template | [templates/Create-2c8-IMS-Plan-Template.md](templates/Create-2c8-IMS-Plan-Template.md) |
| Example prompts | [examples/prompts/](examples/prompts/) |

## Quick start (developers)

```bash
npm install
cp .env.example .env   # TWO_C8_BASE_URL, TWO_C8_API_KEY, …
npm run build
npm run start:http     # http://127.0.0.1:3000/mcp
```

| Variable | Default | Description |
|----------|---------|-------------|
| `TWO_C8_BASE_URL` | *(required)* | MT backend |
| `TWO_C8_API_KEY` | *(required)* | `x-api-key` |
| `TWO_C8_ALLOW_WRITES` | `false` | Write tools |
| `TWO_C8_ALLOW_DELETES` | `false` | `delete_model`, `delete_symbol`, `delete_mt_document` |
| `TWO_C8_WRITE_MODE` | `draft` | `draft` \| `direct` |
| `TWO_C8_WRITE_REQUIRE_LOCK` | `true` | Require `lock_write_repository` (or auto-lock) before mutating repo calls |
| `TWO_C8_WRITE_AUTO_LOCK_ON_CREATE` | `true` | Auto-lock scope after `create_repository` when unlocked |
| `TWO_C8_WRITE_UNLOCK_MODE` | `confirm_phrase` | `confirm_phrase` \| `restart` \| `open` |
| `TWO_C8_WRITE_UNLOCK_PHRASE` | *(empty)* | Operator phrase for unlock when mode is `confirm_phrase` |
| `TWO_C8_WRITE_DENY_REPOSITORY_IDS` | *(empty)* | Comma-separated UUIDs that can never be written |
| `TWO_C8_WRITE_DENY_REPOSITORY_NAMES` | *(empty)* | Comma-separated repo names that can never be locked/created |
| `MCP_TRANSPORT` | `stdio` | `stdio` \| `http` |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | HTTP |

```bash
npm start              # stdio
npm run start:http     # Streamable HTTP
```

Health: `GET /health`

### Docker

Base image: `node:26-alpine`. CI builds and pushes to GHCR on `v*` tags (e.g. `v1.2.0`).

HTTP `/mcp` has **no authentication**. The image defaults to `HOST=127.0.0.1`; for port publishing you must set `HOST=0.0.0.0` deliberately — do not expose it on untrusted networks.

```bash
docker build -t modelm8 .
docker run --rm -p 3000:3000 \
  -e HOST=0.0.0.0 \
  -e TWO_C8_BASE_URL=https://host/mt-backend \
  -e TWO_C8_API_KEY=... \
  -e TWO_C8_ALLOW_WRITES=false \
  modelm8
```

GHCR (after a tag push):

```bash
docker pull ghcr.io/<owner>/modelm8:1.2.0
```

## Features

- TypeScript MCP (`@modelcontextprotocol/sdk`), HTTP + stdio  
- Domain tools (consume, propose/apply, quality gates) + analysis  
- Resources `methodology://…`, prompts, server instructions  
- Writes gated by `TWO_C8_ALLOW_WRITES`; deletes by `TWO_C8_ALLOW_DELETES`
- Runtime **write scope** (`lock_write_repository` / `get_write_scope` / `unlock_write_repository`) — one target repo per process without rebuilding the container

## Development

```bash
npm run dev:http
npm run typecheck
npm run lint            # Biome
npm run test            # Vitest
npm run ci              # typecheck + lint + test (same as PR CI)
```

API coverage: [docs/dev/API-GAP-ANALYSIS.md](docs/dev/API-GAP-ANALYSIS.md)  
MCP error notes: [docs/dev/mcp-errors.md](docs/dev/mcp-errors.md)  
Changelog: [CHANGELOG.md](CHANGELOG.md)

Requires Node.js 26+. Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md).

PRs / pushes to `main` run `.github/workflows/ci.yml`.

## License

Licensed under the [Apache License 2.0](LICENSE).  
Code of Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

The name **modelM8** and related branding may not be used without permission (see Apache 2.0 §6 Trademarks).
