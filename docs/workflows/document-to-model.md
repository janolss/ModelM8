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

1. `get_methodology` — `process`, `documents-on-process`, `naming`, `reuse-first`
2. `propose_model_from_document` (eller `propose_model_from_text` om texten redan är städad)
3. Presentera förslaget; skriv om status-lika BO till värde/artefakt
4. `search_symbols` + `validate_against_methodology`
5. `apply_model_proposal` — `businessObjectCount > 0`
6. `link_document` där det går (rätt `type`, `source: mt.documents`)
7. `describe_process` + **`review_process_model`** → fixa → om
8. `update_titles` / `confirm_translations` för sekundärspråk
9. `link_breakdown` om modellen har en översiktsförälder

## Definition of done

- Review OK
- Spårbarhet till källdokument (minst i modellbeskrivning)
- Inga påhittade steg som saknas i källan (logga antaganden)

## Vanliga fel

| Symptom | Åtgärd |
|---|---|
| `Document type must be provided` | Sätt `type: "URL"` eller `"file"`; ev. `create_document_type` |
| Processövergripande doc på varje aktivitet | Flytta till processymbolen |
| EMF/bilder svåra att tolka | Be om PNG/SVG eller textavsnitt |
