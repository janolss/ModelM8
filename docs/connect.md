# Connect an MCP client to modelM8

modelM8 speaks **MCP**. Any agent or IDE that can call an MCP server works.

## Two transport modes

| Mode | When | Endpoint / start |
|---|---|---|
| **HTTP** | Client points at a URL | `http://127.0.0.1:3000/mcp` (or your host/port) |
| **stdio** | Client starts `node dist/index.js` | Process reads env from `.env` / environment variables |

Start HTTP mode:

```bash
npm run start:http
```

If `.env` has `MCP_HTTP_AUTH_TOKEN`, the MCP client must send `Authorization: Bearer <token>` on `POST /mcp`. Loopback without a token is fine for local use; beyond loopback, set the token (see [getting-started](getting-started.md)).

## Checklist after connecting

Ask the agent (or run the tools) in this order:

1. `list_repositories` — at least one repo is visible  
2. `get_api_versions` — backend responds  
3. `list_languages` on the chosen repo — keep the language UUIDs  
4. If you will write: confirm write tools are registered (`create_repository`, `propose_model_from_text`, …)

If steps 1–2 fail: check `TWO_C8_BASE_URL`, API key, Bearer token (if configured), and that the server is running (`GET /health` → `{ "ok": true }`).

## Naming in the client

Register the server as **modelM8** (or an equivalent display name). Models still live in **2c8** — do not mix up the names in instructions to the agent.

## Client-specific notes

- [VS Code + GitHub Copilot](clients/vscode-copilot.md)

Other clients: use the same HTTP URL or stdio command per the client’s MCP documentation.
