# Prompt: kör IMS-plan

```
Bygg / fortsätt IMS enligt planmallen.

Planfil: templates/Create-2c8-IMS-Plan-Template.md
(eller min ifyllda kopia: <sökväg>)

modelM8 = MCP-verktyg. 2c8 = Modeling Tool / målrepo.
STT sker i klienten om tal används; modelM8 skapar modeller.

1. Läs planen. Bekräfta alla {{PLACEHOLDERS}} och avsnitt 0 innan writes.
2. Följ faserna i ordning (G0 → …). Hoppa inte över handoff-kontrakt eller Q-grindar.
3. I fas 1: identifiera gemensamma dokumentbaser och föreslå dokumentrötter (key/value) i CATALOG/STATE; skapa dem i fas 2 med create_document_root innan mass-link_document.
4. Reuse-first: search_symbols endast i målrepot.
5. Efter varje modell: review_process_model + översättning (translated:true / confirm_translations inkl. edges).
6. link_breakdown direkt; använd get_navigation_tree för L0/navigering.
7. Avsluta med verify_handoffs, verify_process_coverage, get_navigation_tree och slutrapport enligt mallen.
Skriv inte till andra repon. Inventera inte guldmodeller om jag inte ber om det.
```
