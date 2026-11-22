# Kvalitetsgrindar

Använd dessa efter varje modell och inför stängning av område / IMS.

## Alltid efter write

1. `describe_process` eller `describe_process_map`  
2. **`review_process_model`** — åtgärda fel (saknad BO, aktivitet→aktivitet, performers, layout)  
3. Kör om review tills OK eller loggat undantag  
4. **Aktivitetsbeskrivningar** (detaljmodeller): om underlag ger syfte/varför/hänsyn → `update_symbol_description` enligt `activity.descriptionGuidance` (komplettera canvas; ingen gissning). Annars tomt.

## Översättningar

1. `update_titles` med sekundärspråk → sätter `translated: true`  
2. Eller `confirm_translations(languageId)` för befintlig text (symboler, modeller, **edge-labels**)  
3. `list_untranslated_symbols` — ska vara tomt (eller bara medvetna undantag)

## Navigering

- `link_breakdown` direkt efter skapad detalj/översikt under förälder  
- `get_navigation_tree(rootModelId)` — `missingUpwardLinks` ska vara tom  
- `get_breakdowns` gäller **detaljmodeller**, inte L0

## Handoffs och coverage

- `verify_handoffs` — samma BO-UUID på producent och konsument (`handoffs[]`, `contract[]`, och/eller `autoDiscover.modelIds`)  
- `list_orphan_symbols` — canvas-orphans (t.ex. `titlePrefix: "ZZ_"`) inför stängning  
- `verify_process_coverage` — processregisterrader → modeller (+ reachability från L0)

## Område / IMS

| Grind | Krav |
|---|---|
| Modell | Review OK |
| Område | scopeOk på karta, breakdowns, handoffs för området, översättningar |
| Helhet | Navigationsträd, coverage, alla handoffs, slutrapport |

Se även planmallens Q1–Q5 i [templates/Create-2c8-IMS-Plan-Template.md](../templates/Create-2c8-IMS-Plan-Template.md).
