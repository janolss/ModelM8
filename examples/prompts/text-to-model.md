# Prompt: text → modell

```
Använd ModelM8 med writes. Målrepo: <repositoryId>. Språk: <languageId>.

Processbeskrivning:
<<<
<klistra in text: steg, I/O, roller, beslut>
>>>

1. get_methodology (process, naming, business-objects) vid behov
2. propose_model_from_text
3. Fixa businessObject namingChecks (inga status-eko-BO)
4. search_symbols i MÅLREPOT innan apply — återanvänd UUID
5. apply_model_proposal (draft om inte sandbox)
6. Kontrollera businessObjectCount > 0
7. describe_process + review_process_model — åtgärda fel
8. Vid vägval: resolve_branching_object_type först (objectType or)
9. Rapportera modelId och kvarvarande review-fynd
```
