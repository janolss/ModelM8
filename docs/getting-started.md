# Getting started with modelM8

modelM8 is an **MCP server**. It gives AI agents tools to read and create process models in **2c8 Modeling Tool**.

- **modelM8** = the tool (MCP)
- **2c8** = where models are stored and methodology applies

## Requirements

- Node.js 26+
- Access to a 2c8 MT backend (`…/mt-backend`)
- API key (`x-api-key`)

## Install

```bash
git clone <this-repo-url>
cd modelM8   # or your local directory name
npm install
cp .env.example .env
```

Edit `.env` — at minimum:

```env
TWO_C8_BASE_URL=https://your-server.example/mt-backend
TWO_C8_API_KEY=...
TWO_C8_ALLOW_WRITES=true
TWO_C8_WRITE_MODE=direct
```

| Variable | Meaning |
|---|---|
| `TWO_C8_ALLOW_WRITES` | `true` to create/change models |
| `TWO_C8_WRITE_MODE` | `draft` (safer; still needs write-scope lock) or `direct` (sandbox/dev) |
| `TWO_C8_WRITE_REQUIRE_LOCK` | Default `true` — call `lock_write_repository` before writes |
| `TWO_C8_ALLOW_DELETES` | Leave `false` unless you truly need `delete_model` |
| `PORT` / `HOST` | HTTP listen address (default `127.0.0.1:3000`) |
| `MCP_HTTP_AUTH_TOKEN` | Optional. When set, `POST /mcp` requires `Authorization: Bearer <token>`. **Set this** if you bind `HOST` beyond loopback |
| `TWO_C8_DOCUMENT_READ_ROOTS` | Optional. Extra absolute dirs for `get_document_content` `file://` reads (in addition to repo document roots) |

## Build and start

```bash
npm run build

# HTTP (recommended for most MCP clients)
npm run start:http

# or stdio (the client starts the process)
npm start
```

Health check: `GET http://127.0.0.1:3000/health` → `{ "ok": true }` (no write-scope or policy fields).

## Next steps

1. [Connect your MCP client](connect.md)
2. [Concepts](concepts.md) — repo, languages, reuse-first
3. Pick a workflow: [consume](workflows/consume.md) · [text](workflows/text-to-model.md) · [document](workflows/document-to-model.md) · [speech](workflows/speech-to-model.md) · [full IMS](workflows/ims-from-plan.md)

### Docker (optional)

`POST /mcp` has **no auth unless** `MCP_HTTP_AUTH_TOKEN` is set. Default `HOST` is loopback. Set `HOST=0.0.0.0` only when you need port publishing, and always set a token (and/or a reverse proxy) on untrusted networks. The server logs a security warning if you bind beyond loopback without a token.

```bash
docker build -t modelm8 .   # base: node:26-alpine
docker run --rm -p 3000:3000 \
  -e HOST=0.0.0.0 \
  -e MCP_HTTP_AUTH_TOKEN=change-me \
  -e TWO_C8_BASE_URL=https://host/mt-backend \
  -e TWO_C8_API_KEY=... \
  -e TWO_C8_ALLOW_WRITES=true \
  -e TWO_C8_WRITE_MODE=direct \
  modelm8
```
