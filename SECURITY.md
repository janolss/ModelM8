# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.3.x   | Yes       |
| < 1.3   | No        |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Report privately via one of:

1. [GitHub Security Advisories](https://github.com/janolss/modelM8/security/advisories/new) (preferred)
2. Email the maintainer listed in `package.json` / GitHub profile

Include:

- Affected version / commit
- Impact (e.g. unauthenticated MCP HTTP exposure, API key leakage)
- Steps to reproduce (minimal, non-destructive)

You should receive an acknowledgement within a few days. We aim to ship a fix or mitigation for confirmed issues before any public disclosure.

## Deployment notes

- `TWO_C8_API_KEY` must never be committed; use `.env` (gitignored) or a secret store.
- HTTP transport (`/mcp`) has **no authentication**. Default `HOST` is `127.0.0.1`. Only set `HOST=0.0.0.0` when you intentionally publish the port, and never on untrusted networks without a reverse proxy / auth layer.
- Keep `TWO_C8_ALLOW_WRITES` and `TWO_C8_ALLOW_DELETES` off unless required.
