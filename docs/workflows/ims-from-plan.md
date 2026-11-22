# Helt IMS / ledningssystem via plan

## När

Du har en dokumentmapp (policies, direktiv, practices, processregister) och vill bygga ett **navigerbart** visuellt ledningssystem i 2c8: L0 → områdeskartor → detaljer.

## Förutsättningar

- modelM8 med writes
- Källmapp lokalt (eller motsvarande extrakt)
- Planmall ifylld: [templates/Create-2c8-IMS-Plan-Template.md](../../templates/Create-2c8-IMS-Plan-Template.md)

## Agentprompt

[examples/prompts/run-ims-plan.md](../../examples/prompts/run-ims-plan.md)

## Steg (översikt)

1. Kopiera mallen, fyll `{{PLACEHOLDERS}}`, bekräfta parametrar med användaren  
2. Agenten följer faserna i planen (G0 → … → G3 pilot → utbyggnad → L0 → Q4/Q5)  
3. Allt skrivs till **2c8**-repot via modelM8 — inte “till modelM8”

Nyckelpunkter från leveranser:

- **Handoff-kontrakt** (samma BO-UUID) *före* mass-text-to-model  
- I analysfasen: identifiera gemensamma dokumentbaser (`DOC_BASE_URL`, biblioteksmapp) och **föreslå dokumentrötter** i planen; skapa med `create_document_root` i fas 2 innan mass-`link_document`  
- **Aktivitetsbeskrivningar:** efter review, `update_symbol_description` endast när underlag ger syfte/varför/hänsyn — komplettera canvas (inte RACI/dokument/BO). Mall §7 + `get_methodology` topic `activity` → `descriptionGuidance`. Tomt > gissning.  
- Översätt och sätt `translated: true` tidigt (`update_titles` / `confirm_translations`, inkl. edge-labels)  
- `link_breakdown` direkt efter varje icke-rot-modell  
- `get_navigation_tree` + `verify_handoffs` + `verify_process_coverage` i slutkontroll  
- Första områdesöversikten ofta **manuell**; `create_process_map` när scope delar UUID  

## Definition of done

Enligt mallens avsnitt 1 och 12: coverage, navigation, review, spårbarhet, gap-logg.

## Vanliga fel

| Symptom | Åtgärd |
|---|---|
| L0 tre band ger review-fel | Godkänt undantag för ledning/stöd utan FLOW — se mallen |
| `get_breakdowns(L0)` tom | Använd `get_navigation_tree` |
| Glober kvar på Ja/Nej | `confirm_translations` (edge-labels) |
