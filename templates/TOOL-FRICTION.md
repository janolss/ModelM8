# modelM8 tool friction log

> Copy to `{{WORK_DIR}}/TOOL-FRICTION.md` in phase 0 when `MCP_DEBUG=Yes`.  
> **Purpose:** Capture when agents bypass, reject, or thrash modelM8 tools — fuel for improving propose/apply/review/docs.  
> **Not for:** Source assumptions (`GAPS.md`), raw API payloads (`MCP-FEEDBACK.md`), happy-path noise.  
> Append-only. One entry per event. Do not rewrite history.

## Status

| Key | Value |
|---|---|
| `MCP_DEBUG` | Yes |
| Entries since last rollup | 0 |

## Categories

| Category | Use when |
|---|---|
| `proposal-rejected` | `propose_model_from_text` output discarded; apply skipped or rebuilt |
| `bypass` | Preferred tool skipped for manual canvas / alternate recipe |
| `proposal-useless` | Apply ran but `businessObjectCount=0` or >~30% of chain rebuilt immediately |
| `tool-inadequate` | Tool exists but cannot express needed shape (e.g. free multi-row map) |
| `unclear-contract` | Agent misunderstood args/result; re-read methodology or guessed |
| `fix-loop` | Same review finding class twice+ after “fix”; or green review then full redraw |
| `hard-fail` | Stop rule ×3 (same tool + error class) before asking the user |
| `docs-friction` | `link_document` / roots / verify workaround or manual linking |
| `coverage-gap` | Review OK but source-fidelity (§10.4) forced large manual RACI/vägval/docs fix |

## Entry template

```markdown
## {{ISO-8601}} — {{category}}
- phase: {{phase}} / {{area}} / {{processId or model title}}
- tools: {{tool A}} → {{tool B or skip}} → {{workaround}}
- why: {{one sentence — what failed or felt wrong}}
- wanted: {{one sentence — what the tool should have done}}
- workaround: {{what you did instead}}
- severity: high | med | low
```

## Triggers (when `MCP_DEBUG=Yes`)

Log **before** the workaround when any of these fire:

1. Detail recipe 9.1 steps 3–5: reject propose, skip apply, or switch to manual spine.
2. After apply: `businessObjectCount = 0` or immediate major rebuild.
3. Overview 9.2: skip `create_process_map` despite shared scope UUIDs → manual template (unless known limitation #2 already accepted — still log once per area as `tool-inadequate` if useful).
4. Q1 / review: same finding class ×2+; or green review then redraw layout/RACI.
5. Stop rule ×3 → `hard-fail` entry, then ask the user.
6. Document mass-link workarounds → `docs-friction`.
7. §10.4: large post-review source fixes → `coverage-gap`.
8. Phase/gate close (G3, area close, SLUTRAPPORT): short rollup of top friction themes (not new raw events).

Do **not** log successful happy paths or pure source ASSUMPTIONs.

## Entries

<!-- Append below this line -->
