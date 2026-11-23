# Consume processes

## When

Understand an existing process in 2c8: flow, roles, documents, breakdowns.

## Prerequisites

- modelM8 connected
- `repositoryId` known (`list_repositories`)

## Agent prompt

See [examples/prompts/consume.md](../../examples/prompts/consume.md)  
MCP prompt: `consume_process`

## Steps

1. (Optional) `get_methodology(topic: "process")`
2. `find_models` if you only have a title — otherwise continue with `modelId`
3. **`describe_process`** — primary answer (`summaryText`, activities, decisions)
4. As needed: `get_breakdowns` (on **detail**), `get_navigation_tree`, `get_process_flow`, `resolve_symbols`
5. Roles: `describe_role` / `describe_role_introduction` — separate RACI from HR intro

## Definition of done

- Purpose, steps with owner + system, I/O, and open questions are stated
- No invented RACI or document links

## Common mistakes

| Symptom | Action |
|---|---|
| Empty `get_breakdowns` on overview | Expected — use `get_navigation_tree` or ask the detail model |
| “Who does X?” without RACI | Say the performer is missing; do not invent one |
