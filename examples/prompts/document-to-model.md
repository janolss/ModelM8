# Prompt: dokument → modell

```
Använd modelM8. Repo: <repositoryId>. Språk: <languageId>.

Källa: <sökväg / documentId / bifogad fil>
Typ: <URL | file | innehåll i chatten>

1. Delar dokumenten bas-URL/mapp? list_document_roots → create_document_root (key+value)
2. Vid behov: list_document_types / create_document_type
3. propose_model_from_document (eller extrahera text → propose_model_from_text)
4. Fixa BO namingChecks; search_symbols i målrepo; apply
5. businessObjectCount > 0; describe_process; review_process_model; fixa
6. link_document: med rot → prefix=key + relativ content; annars absolut URL/path.
   Symbol-länk: { id, source: mt.documents }
7. Dokument på aktiviteter: CONTROLS/IS_USED_BY endast steg-specifikt —
   processövergripande styrning på modellnivå, inte fan-out på alla steg
```
