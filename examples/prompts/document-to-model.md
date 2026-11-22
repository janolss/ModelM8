# Prompt: dokument → modell

```
Använd ModelM8. Repo: <repositoryId>. Språk: <languageId>.

Källa: <sökväg / documentId / bifogad fil>
Typ: <URL | file | innehåll i chatten>

1. Vid behov: list_document_types / create_document_type; link_document med { id, source }
2. propose_model_from_document (eller extrahera text → propose_model_from_text)
3. Fixa BO namingChecks; search_symbols i målrepo; apply
4. businessObjectCount > 0; describe_process; review_process_model; fixa
5. Dokument på aktiviteter: CONTROLS/IS_USED_BY endast steg-specifikt —
   processövergripande styrning på modellnivå, inte fan-out på alla steg
```
