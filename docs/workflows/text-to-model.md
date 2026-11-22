# Text-to-model

## När

Du har en processbeskrivning i text och vill skapa en detaljmodell i 2c8.

## Förutsättningar

- Writes på (`TWO_C8_ALLOW_WRITES=true`)
- `repositoryId` + `languageId` (`list_languages`)
- Metodik: infinitiv + substantiv; BO = värde/artefakt (inte status-eko)

## Agentprompt

[examples/prompts/text-to-model.md](../../examples/prompts/text-to-model.md)  
MCP-prompt: `text_to_process_model`

## Steg

1. `get_methodology` — `process`, `activity` (läs `descriptionGuidance`), `naming`, `business-objects`, `reuse-first`
2. `propose_model_from_text` (gärna **prefixad** text: `Process:`, `Aktivitet:`, `Vägval:`, `Ja:`/`Nej:`)
3. Fixa `namingChecks` för verksamhetsobjekt
4. Val/vägval: `resolve_branching_object_type` → `or` (aldrig gateway/join)
5. `search_symbols` i målrepot — återanvänd UUID
6. `apply_model_proposal` — kräv `businessObjectCount > 0`
7. `describe_process`
8. Luckor: `set_activity_performer`, `set_step_io`, `create_canvas_edge` (Ja/Nej)
9. **`review_process_model`** → åtgärda → om tills OK
10. Aktivitetsbeskrivningar: `update_symbol_description` **endast** där källtext ger syfte/varför/hänsyn — komplettera canvas (inte RACI/dokument/BO). Saknas underlag → lämna tomt. Se `activity.descriptionGuidance`.
11. Översättning: `update_titles` (sätter `translated: true`) för sekundärspråk
12. Om modell har förälder: `link_breakdown` **direkt**

## Definition of done

- Review utan fel (eller loggat undantag)
- Varje aktivitet har in, ut och ansvarig
- Vägval är `or` med Ja/Nej
- Aktivitetsbeskrivningar källbaserade (eller avsiktligt tomma)

## Vanliga fel

| Symptom | Åtgärd |
|---|---|
| `businessObjectCount = 0` | Kedjan måste växla BO ↔ aktivitet |
| Glob kvar på EN | `confirm_translations` eller `update_titles` med rätt flagga |
| Join/gateway | Använd `or` |
