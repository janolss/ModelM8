# Contributing to modelM8

Thanks for contributing. This project is a methodology-driven MCP server for [2c8 Modeling Tool](https://www.2c8.com).

## Prerequisites

- **Node.js 26+** (see `engines` in `package.json` and `.nvmrc`)
- A 2c8 MT backend URL + API key for integration testing (optional for unit tests)

```bash
npm ci
cp .env.example .env   # fill TWO_C8_BASE_URL / TWO_C8_API_KEY locally
npm run ci             # typecheck + lint + test
```

## Development

| Command | Purpose |
|---------|---------|
| `npm run dev:http` | HTTP MCP on `127.0.0.1:3000` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Biome |
| `npm run test` | Vitest |
| `npm run ci` | Same as PR CI |

Do not commit `.env`, credentials, or customer/process content under local folders such as `TechSeed-IMS/` or `Inera/`.

## Pull requests

1. Branch from `main`.
2. Keep changes focused; ask before large refactors.
3. Run `npm run ci` locally.
4. Open a PR against `main` (required by branch ruleset). Squash merge is the repo default.
5. Fill in the PR template.

CI must pass before merge.

## Write / delete tools

Destructive or mutating MCP tools are gated:

- `TWO_C8_ALLOW_WRITES=true` — create/update tools
- `TWO_C8_ALLOW_DELETES=true` — `delete_model`
- `TWO_C8_WRITE_MODE=draft|direct` — prefer `draft` unless you own a sandbox repo

Do not enable deletes in shared environments.

## Code style

- TypeScript, ESM (`"type": "module"`)
- Formatting/lint: Biome (`biome.json`)
- Comments in English, aimed at experienced developers

## Security

See [SECURITY.md](SECURITY.md). Never commit secrets.

## License

Contributions are accepted under the [Apache License 2.0](LICENSE).
