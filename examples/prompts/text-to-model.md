# Prompt: text → modell

```
Använd modelM8 med writes. Målrepo: <repositoryId>. Språk: <languageId>.

Processbeskrivning:
<<<
<klistra in text: steg, I/O, roller, beslut>
>>>

1. get_methodology (process, activity→descriptionGuidance, naming, business-objects) vid behov
2. propose_model_from_text
3. Fixa businessObject namingChecks (inga status-eko-BO)
4. search_symbols i MÅLREPOT innan apply — återanvänd UUID
5. apply_model_proposal (draft om inte sandbox)
6. Kontrollera businessObjectCount > 0
7. describe_process + review_process_model — åtgärda fel
8. Vid vägval: resolve_branching_object_type först (objectType or)
9. Aktivitetsbeskrivningar: update_symbol_description endast om källtext ger syfte/varför/hänsyn —
   komplettera canvas (inte RACI/dokument/BO). Saknas underlag → lämna tomt.
10. Rapportera modelId och kvarvarande review-fynd
```
