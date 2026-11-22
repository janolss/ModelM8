# Document-to-model

## När

Du har en practice, rutin eller liknande text och vill extrahera en processmodell till 2c8.

## Förutsättningar

- Writes på
- `repositoryId` + `languageId`
- Dokumenttext tillgänglig (inklistrad, fil som agenten kan läsa, eller via `get_document_content` om dokumentet redan finns i 2c8)

## Agentprompt

[examples/prompts/document-to-model.md](../../examples/prompts/document-to-model.md)  
MCP-prompt: `document_to_process_model`

## Steg

1. `get_methodology` — `process`, `activity` (`descriptionGuidance`), `documents-on-process`, `document-roots`, `naming`, `reuse-first`
2. Om källdokument delar bas-URL/mapp: `list_document_roots` → föreslå/skapa rot med `create_document_root` (`key` + `value`)
3. `propose_model_from_document` (eller `propose_model_from_text` om texten redan är städad)
4. Presentera förslaget; skriv om status-lika BO till värde/artefakt
5. `search_symbols` + `validate_against_methodology`
6. `apply_model_proposal` — `businessObjectCount > 0`
7. `link_document` där det går (`type`, ev. `prefix`=rot-`key` + relativ `content`; symbol-länk `{ id, source: mt.documents }`)
8. `describe_process` + **`review_process_model`** → fixa → om
9. Aktivitetsbeskrivningar från källan: `update_symbol_description` — syfte/varför/hänsyn som **kompletterar** canvas; upprepa inte RACI/dokument/BO. Finns det inte i underlaget → skriv inte. Se `activity.descriptionGuidance`.
10. `update_titles` / `confirm_translations` för sekundärspråk
11. `link_breakdown` om modellen har en översiktsförälder

## Definition of done

- Review OK
- Spårbarhet till källdokument (minst i modellbeskrivning; aktivitetsbeskrivningar när källan räcker)
- Inga påhittade steg **eller** påhittade aktivitetsbeskrivningar (logga antaganden)

## Vanliga fel

| Symptom | Åtgärd |
|---|---|
| `Document type must be provided` | Sätt `type: "URL"` eller `"file"`; ev. `create_document_type` |
| Processövergripande doc på varje aktivitet | Flytta till processymbolen |
| EMF/bilder svåra att tolka | Be om PNG/SVG eller textavsnitt |
