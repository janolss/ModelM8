# Prompt: document → model

```
Use modelM8. Repo: <repositoryId>. Language: <languageId>.

Source: <path / documentId / attached file>
Type: <URL | file | content in the chat>

1. Do the documents share a base URL/folder? list_document_roots → create_document_root (key+value). Later: store full absolute URLs on docs; user matches roots in 2c8 UI.
2. As needed: list_document_types / create_document_type
3. propose_model_from_document (or extract text → propose_model_from_text)
4. Fix BO namingChecks; search_symbols in target repo; apply
5. businessObjectCount > 0; describe_process; review_process_model; fix
6. link_document: documentRootKey + relativePath + titles for ALL languages (same full absolute URL per language).
   content/URL is language-specific like titles — one language alone leaves others empty.
   Then verify_document_links (omit languageId). User matches roots in 2c8 UI. Symbol link: { id, source: mt.documents }
7. Documents on activities: CONTROLS/IS_USED_BY only step-specific —
   process-wide governance on the model, not fan-out onto every step
8. Activity descriptions from the source: update_symbol_description (purpose/why/considerations) —
   complement the canvas; do not repeat RACI/documents/BOs. Not in the source → do not write
   (get_methodology activity.descriptionGuidance).
```
