# Prompt: text → model

```
Use modelM8 with writes. Target repo: <repositoryId>. Language: <languageId>.

Process description:
<<<
<paste text: steps, I/O, roles, decisions>
>>>

1. get_write_scope → lock_write_repository to the target repositoryId if unlocked
2. get_methodology (process, activity→descriptionGuidance, naming, business-objects) as needed
3. propose_model_from_text
4. Fix businessObject namingChecks (no status-echo BOs)
5. search_symbols in the TARGET REPO before apply — reuse UUIDs
6. apply_model_proposal (draft unless sandbox; draft still requires write-scope lock)
7. apply hard-fails if no BOs placed — fix chain / namingChecks and re-apply
8. describe_process + review_process_model — fix findings
9. For branching: resolve_branching_object_type first (objectType or)
10. Activity descriptions: update_symbol_description only if source text gives purpose/why/considerations —
   complement the canvas (not RACI/documents/BOs). No source → leave empty.
11. Report modelId and remaining review findings
```
