# Prompt: run IMS plan

```
Build / continue an IMS according to the plan template.

Plan file: templates/Create-2c8-IMS-Plan-Template.md
(or my filled copy: <path>)

modelM8 = MCP tool. 2c8 = Modeling Tool / target repo.
STT happens in the client if speech is used; modelM8 creates models.

1. Read the plan. Confirm all {{PLACEHOLDERS}} and section 0 before writes.
2. Follow phases in order (G0 → …). Do not skip handoff contracts or Q-gates.
3. In phase 1: identify shared document bases and propose document roots (key/value) in CATALOG/STATE; create them in phase 2 with create_document_root before mass link_document.
4. Reuse-first: search_symbols only in the target repo.
5. After each model: review_process_model + activity descriptions (source-based, descriptionGuidance) + translation (translated:true / confirm_translations incl. edges).
6. link_breakdown immediately; use get_navigation_tree for L0/navigation.
7. Finish with verify_handoffs, verify_process_coverage, get_navigation_tree and the final report per the template.
Do not write to other repos. Do not inventory gold models unless I ask.
```
