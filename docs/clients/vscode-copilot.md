# VS Code + GitHub Copilot with modelM8

This note shows how to connect modelM8 to **Visual Studio Code** with **GitHub Copilot** (agent / MCP support). Other clients: see [connect.md](../connect.md).

## Prerequisites

- modelM8 running (recommended: `npm run start:http`)
- VS Code with GitHub Copilot and MCP support enabled per Microsoft’s current docs
- `.env` filled in (`TWO_C8_*`, writes if you will create models)

## HTTP connection (recommended)

1. Start modelM8: `npm run start:http`  
2. In VS Code / Copilot: add an MCP server pointing at  
   `http://127.0.0.1:3000/mcp`  
   (change port if you changed `PORT`)  
3. Name the server **modelM8**  
4. Verify with the checklist in [connect.md](../connect.md)

Exact menu paths and JSON shape can change between Copilot/VS Code versions — follow the built-in help for “MCP servers” and use the URL above.

## stdio (alternative)

If the client starts the process itself, point at:

```text
node /absolute/path/to/modelM8/dist/index.js
```

Set environment variables (`TWO_C8_BASE_URL`, `TWO_C8_API_KEY`, …) in the client’s MCP config or via `.env` that the process loads at start.

## Tips

- Start with **read tools** before enabling `TWO_C8_ALLOW_WRITES=true` in production.
- For sandboxes: `TWO_C8_WRITE_MODE=direct`.
- Agent prompts: [examples/prompts/](../../examples/prompts/).
