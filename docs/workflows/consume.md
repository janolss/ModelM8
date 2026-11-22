# Läsa processer (consume)

## När

Förstå en befintlig process i 2c8: flöde, roller, dokument, nedbrytningar.

## Förutsättningar

- ModelM8 ansluten
- `repositoryId` känt (`list_repositories`)

## Agentprompt

Se [examples/prompts/consume.md](../../examples/prompts/consume.md)  
MCP-prompt: `consume_process`

## Steg

1. (Valfritt) `get_methodology(topic: "process")`
2. `find_models` om du bara har titel — annars gå vidare med `modelId`
3. **`describe_process`** — primärsvar (`summaryText`, aktiviteter, beslut)
4. Vid behov: `get_breakdowns` (på **detalj**), `get_navigation_tree`, `get_process_flow`, `resolve_symbols`
5. Roller: `describe_role` / `describe_role_introduction` — skilj RACI från HR-intro

## Definition of done

- Syfte, steg med ansvarig + system, in/ut och öppna frågor är redovisade
- Inga påhittade RACI- eller dokumentkopplingar

## Vanliga fel

| Symptom | Åtgärd |
|---|---|
| Tom `get_breakdowns` på översikt | Förväntat — använd `get_navigation_tree` eller fråga detaljmodellen |
| “Vem gör X?” utan RACI | Säg att utförare saknas; hitta inte på |
