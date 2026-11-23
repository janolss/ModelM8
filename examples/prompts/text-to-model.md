# Prompt: text → model

```
Use modelM8 with writes. Target repo: <repositoryId>. Language: <languageId>.

Process description:
<<<
<paste text: steps, I/O, roles, decisions>
>>>

1. get_methodology (process, activity→descriptionGuidance, naming, business-objects) as needed
2. propose_model_from_text
3. Fix businessObject namingChecks (no status-echo BOs)
4. search_symbols in the TARGET REPO before apply — reuse UUIDs
5. apply_model_proposal (draft unless sandbox)
6. Check businessObjectCount > 0
7. describe_process + review_process_model — fix findings
8. For branching: resolve_branching_object_type first (objectType or)
9. Activity descriptions: update_symbol_description only if source text gives purpose/why/considerations —
   complement the canvas (not RACI/documents/BOs). No source → leave empty.
10. Report modelId and remaining review findings
```
