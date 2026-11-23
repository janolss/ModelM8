# modelM8

MCP-server för AI-agenter som **läser** och **skapar/redigerar** processmodeller i [2c8 Modeling Tool](https://www.2c8.com).

- **modelM8** = MCP-verktyget  
- **2c8** = Modeling Tool (repon, modeller, metodik)

## Användardokumentation

Börja här: **[docs/README.md](docs/README.md)**

| Steg | Länk |
|---|---|
| Installera | [docs/getting-started.md](docs/getting-started.md) |
| Anslut klient | [docs/connect.md](docs/connect.md) |
| VS Code + Copilot | [docs/clients/vscode-copilot.md](docs/clients/vscode-copilot.md) |
| Workflows | [docs/workflows/](docs/workflows/) |
| IMS-planmall | [templates/Create-2c8-IMS-Plan-Template.md](templates/Create-2c8-IMS-Plan-Template.md) |
| Exempelprompts | [examples/prompts/](examples/prompts/) |

## Snabbstart (utvecklare)

```bash
npm install
cp .env.example .env   # TWO_C8_BASE_URL, TWO_C8_API_KEY, …
npm run build
npm run start:http     # http://127.0.0.1:3000/mcp
```

| Variabel | Default | Beskrivning |
|----------|---------|-------------|
| `TWO_C8_BASE_URL` | *(krävs)* | MT-backend |
| `TWO_C8_API_KEY` | *(krävs)* | `x-api-key` |
| `TWO_C8_ALLOW_WRITES` | `false` | Skrivverktyg |
| `TWO_C8_ALLOW_DELETES` | `false` | `delete_model` |
| `TWO_C8_WRITE_MODE` | `draft` | `draft` \| `direct` |
| `MCP_TRANSPORT` | `stdio` | `stdio` \| `http` |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | HTTP |

```bash
npm start              # stdio
npm run start:http     # Streamable HTTP
```

Health: `GET /health`

### Docker

Basimage: `node:26-alpine`. CI bygger och pushar till GHCR vid tag `v*` (t.ex. `v1.2.0`).

HTTP `/mcp` har **ingen autentisering**. Image defaultar till `HOST=127.0.0.1`; för port-mappning måste du sätta `HOST=0.0.0.0` medvetet — exponera inte mot otillförlitliga nät.

```bash
docker build -t modelm8 .
docker run --rm -p 3000:3000 \
  -e HOST=0.0.0.0 \
  -e TWO_C8_BASE_URL=https://host/mt-backend \
  -e TWO_C8_API_KEY=... \
  -e TWO_C8_ALLOW_WRITES=false \
  modelm8
```

GHCR (efter tag-push):

```bash
docker pull ghcr.io/<owner>/modelm8:1.2.0
```

## Funktioner

- TypeScript MCP (`@modelcontextprotocol/sdk`), HTTP + stdio  
- Domain tools (consume, propose/apply, quality gates) + analysis  
- Resources `methodology://…`, prompts, server instructions  
- Writes bakom `TWO_C8_ALLOW_WRITES`; deletes bakom `TWO_C8_ALLOW_DELETES`

## Utveckling

```bash
npm run dev:http
npm run typecheck
npm run lint            # Biome
npm run test            # Vitest
npm run ci              # typecheck + lint + test (samma som PR-CI)
```

API-täckning: [docs/dev/API-GAP-ANALYSIS.md](docs/dev/API-GAP-ANALYSIS.md)  
Felkoder: [docs/dev/mcp-errors.md](docs/dev/mcp-errors.md)

Kräver Node.js 26+. PR/push till `main` kör `.github/workflows/ci.yml`.

## Licens

Licensierad under [Apache License 2.0](LICENSE).

Namnet **modelM8** och tillhörande branding får inte användas utan tillstånd (se Apache 2.0 §6 Trademarks).
