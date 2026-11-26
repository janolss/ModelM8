# IMS-FROM-PLAN — Skapa ledningssystem med modelM8

**Level:** L1 (översikt) + 4× L2  
**Source:** `docs/workflows/ims-from-plan.md` + `templates/Create-2c8-IMS-Plan-Template.md` (+ presentationssammanfattning `2c8-IMS-arbetsflode-presentation.md`)  
**SV:** Skapa ledningssystem med modelM8  
**2c8:** repo `modelM8` · L1-modell *Skapa ledningssystem med modelM8*

## Scope

Omvandla ett dokumentbaserat ledningssystem (policies, direktiv, practices, processregister) till ett **navigerbart** visuellt IMS i **2c8 Modeling Tool**, styrt av en ifylld IMS-plan. Arbetet går via mellanstegsfiler i `WORK_DIR` och skrivningar till 2c8 **via modelM8** — modeller “ligger” aldrig i MCP-servern.

Omfattar G0 → analys/design → handoff-kontrakt → repo → pilot (stopp) → övriga områden → L0 → konsolidering → Q4/Q5. Inkluderar inte löpande förvaltning efter acceptans.

## Roles (RACI_RESPONSIBLE)

| Roll | Ansvar |
|---|---|
| **Konsult** | Människa som riggar förutsättningar: plan/parametrar, G0-förberedelse, G3-överlämning efter godkänd pilot, matcha dokumentrötter i 2c8 UI. |
| **AI-agent** | Autonom bearbetning via agent + **modelM8** MCP: processkort/katalog, handoff-UUID, repo-setup, modellering, review/verify, L0, konsolidering. |
| **Verksamhetsspecialist** | Verksamhetskunskap: validerar design/flöden/RACI, granskar pilot, accepterar leverans i 2c8 UI. |

**Värdering (kort):** Konsult = mänsklig setup/grind. AI-agent = autonom körning mot modelM8. Verksamhetsspecialist = “stämmer detta med hur vi arbetar?”.

## Applications (IS_USED_BY)

| Applikation | Typ | Används främst i |
|---|---|---|
| **modelM8** | application | Förberedelse, repo, modellering, review/verify, översättning, dokumentlänkar |
| **2c8 Modeling Tool** | application | Klientgranskning (panel, språk, breakdown), matcha dokumentrötter i UI |
| Fil-/shell-verktyg (extrakt) | application | Extrahera docx/pdf/xlsx → `extract/` |

## FLOW

**Input:** Dokumentbaserat ledningssystem (källmapp + uppdrag/planmall)

1. **Förbereda IMS-leverans** — **Konsult** — usedBy: modelM8  
   Extrakt → `extract/`; kopiera `STATE.md`, `GAPS.md`, ev. `TOOL-FRICTION.md`; läs metodik; inventera repon; föreslå och bekräfta parametrar med verksamheten.  
   → **Förberedd arbetsyta**  
   *(Gate G0 — evidence i STATE)*

2. **Utforma processdesign** — **AI-agent** — usedBy: modelM8  
   Läs register/practices; skriv processkort `cards/<ID>.md`; bygg `CATALOG.md`, `SOURCE-MAP.md`-skelett; föreslå dokumentrötter; skissa handoff-titlar.  
   → **Processdesignunderlag**

3. **Validera processdesign** — **Verksamhetsspecialist** — usedBy: 2c8 *(läsning av kort/katalog, ej modellskrivning)*  
   Bekräfta steg, roller, överlämningar och luckor; stäng öppna `QUESTION` i GAPS eller beslut.  
   → **Överenskommen processdesign**  
   *(Gate G1 — kort + katalog + föreslagna rötter)*

4. **Fastställa handoff-kontrakt** — **AI-agent** — usedBy: modelM8  
   Tabell producent/konsument → kanonisk BO-titel; efter repo: samma UUID (`search_symbols` / skapa). Alias → kanon i CATALOG.  
   → **Handoff-kontrakt**

5. **Etablera målrepository** *(aktivitet: Sätta upp 2c8-målrepo)* — **AI-agent** — usedBy: modelM8  
   `create_repository` (språk), dok-typer, `create_document_root`, smoke `link_document` + `verify_document_links` (alla språk), write scope låst.  
   → **Driftklart målrepo**  
   *(Gate G2)*

6. **Modellera pilotområde** — **AI-agent** — usedBy: modelM8  
   Detaljer först (propose → apply → review → fix → breakdown → översätt → länk dok); därefter L1-översikt från scopes; `verify_handoffs` för pilot.  
   → **Pilotleverans**

7. **Granska pilotleverans** — **Verksamhetsspecialist** — usedBy: 2c8  
   Öppna i Modeling Tool: dokumentpanel, sekundärspråk, breakdown-klick; källtrohet (steg, RACI, vägval) — grön review räcker inte.  
   → **Pilotacceptbeslut**

8. **Vägval: Är pilot godkänd?** *(objectType `or`)*  
   - **Ja:** → **Överlämna godkänd pilot** — **Konsult** → **Godkänd pilotleverans**  
   - **Nej:** → **Åtgärda pilotmodell** — **AI-agent** — usedBy: modelM8 → åter till **Pilotleverans** (sidoloop; ingen fejk-“dokumentera beslut”-aktivitet)

9. **Modellera övriga områden** — **AI-agent** — usedBy: modelM8  
   Kärna → stöd → ledning (anpassa); per område: kort → L2 → L1 → Q1–Q3.  
   → **Områdesmodeller**

10. **Validera områdesflöden** — **Verksamhetsspecialist** — usedBy: 2c8  
    Stickprov/riskbaserad källtrohet per område (särskilt handoffs och vägval).  
    → **Verksamhetsförankrat IMS**

11. **Bygga huvudprocesskarta** — **AI-agent** — usedBy: modelM8  
    L0 three-band; samma BO-UUID som detaljernas primära I/O; `link_breakdown`; `get_navigation_tree`.  
    → **Navigerbart IMS**

12. **Konsolidera och kvalitetssäkra IMS** — **AI-agent** — usedBy: modelM8  
    `verify_handoffs`, dubbletter/`retarget`, `list_untranslated_symbols`, `verify_process_coverage`, `verify_document_links` (alla språk), Q4/Q5, slutrapport.  
    → **Kvalitetssäkrat IMS**

13. **Matcha dokumentrötter** — **Konsult** — usedBy: 2c8  
    Efter masslänk: matcha sökvägar till dokumentrötter i 2c8 UI (API `prefix` ≠ root-FK).  
    → **Leveransklart IMS**

14. **Acceptera IMS-leverans** — **Verksamhetsspecialist** — usedBy: 2c8  
    → **Accepterat visuellt ledningssystem**

**Primary output:** Accepterat visuellt ledningssystem  

**Secondary / branch:** Åtgärdsbehov från Nej på pilot (stays in sidoloop tills Ja).

## Intermediate deliverables (filer = business objects i praktiken)

| BO (värde/artefakt) | Typiska filer / artefakter | Fas |
|---|---|---|
| Förberedd arbetsyta | `extract/`, `STATE.md`, `GAPS.md`, ev. `TOOL-FRICTION.md`, bekräftade parametrar | 0 / G0 |
| Processdesignunderlag | `cards/*.md`, `CATALOG.md`, `SOURCE-MAP.md` (skelett), föreslagna dok-rötter | 1 |
| Överenskommen processdesign | Samma + stängda frågor/beslut i GAPS | G1 |
| Handoff-kontrakt | Tabell 6.4 + UUID i CATALOG/STATE | 1b |
| Driftklart målrepo | `repositoryId`, språk-ID, document-root `key`, smoke-evidence | 2 / G2 |
| Pilotleverans | L2+L1 i 2c8 + STATE gate evidence | 3 |
| Pilotacceptbeslut | Klient-OK / åtgärdslista | G3 |
| Områdesmodeller | Övriga L2/L1 | 4 |
| Navigerbart IMS | L0 + breakdown-träd | 5 |
| Kvalitetssäkrat IMS | Verify-resultat + `SLUTRAPPORT.md` | 6–7 |
| Leveransklart IMS | Klickbara dokumentlänkar efter UI-match | 7 |
| Accepterat visuellt ledningssystem | Godkänd leverans till verksamheten | Klart |

## Process-level docs (CONTROLS på processymbol — inte fan-out på varje steg)

- `templates/Create-2c8-IMS-Plan-Template.md`
- `docs/workflows/ims-from-plan.md`
- `docs/quality-gates.md`
- modelM8 methodology resources (`get_methodology` …) — styrning via verktyg, inte MT-dokument om ej länkat

## Step-specific docs / mallar (IS_USED_BY exempel)

| Steg | Mall / blankett |
|---|---|
| Förbereda | `templates/STATE.md`, `templates/TOOL-FRICTION.md` |
| Utforma processdesign | Processkort-mönster (t.ex. detta kort); plan §6 inventering |
| Modellera pilot/områden | Prefixed text (plan Appendix B); recept 9.1 / 9.2 |
| Konsolidera | Plan §12 slutrapportmall |

## Modelling notes (för senare text-to-model)

- Aktivitetstitlar: infinitiv + substantiv (redan ovan).
- BO-namn = värde/artefakt, inte statuseko av aktiviteten (undvik “Validerad X” som enda namn — här: *Överenskommen processdesign*, *Pilotacceptbeslut*, *Accepterat visuellt ledningssystem*).
- Vägval efter **Pilotacceptbeslut**; Ja → “Modellera övriga områden”; Nej → “Åtgärda pilotmodell” under diamanten.
- RACI: roll under **varje** aktivitet med egen edge — återanvänd symbol-UUID för Konsult, AI-agent respektive Verksamhetsspecialist.
- Skriv aldrig till annat repo; stopp ×3 samma felklass; G3 stannar tills verksamhetsspecialist sagt Ja.

## Build order (när detta kort blir 2c8-modell)

1. Bekräfta målrepo för *denna* meta-process (sandbox / metodrepo — **inte** kundens IMS-målrepo under aktiv skrivning).  
2. `search_symbols` för roller, system (modelM8, 2c8), BO-titlar.  
3. Prefixed text → `propose_model_from_text` → apply → `review_process_model` → fix.  
4. Länka processdokument; översätt SV/EN i samma batch.

## Definition of done (denna process)

- Kundens målrepo uppfyller plan §1 / §12 (coverage, navigation, review, spårbarhet, GAPS).  
- Grindar G0–G3 och Q4/Q5 dokumenterade i STATE.  
- Verksamhetsspecialist har accepterat leveransen.
