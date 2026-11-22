# Begrepp

## ModelM8 vs 2c8

| | |
|---|---|
| **ModelM8** | MCP-server: verktyg, instructions, prompts, knowledge-pack |
| **2c8** | Modeling Tool: repon, modeller, symboler, canvas, metodik |

Säg inte att “modellen ligger i ModelM8”. ModelM8 *skriver till* och *läser från* 2c8.

## Repository

Allt innehåll hör till ett **repo** i 2c8. Skapa med `create_repository` eller använd befintligt. Symbol-UUID:n är **repo-lokala** — kopiera aldrig UUID mellan repon.

## Språk

- `list_languages` ger UUID per språk (inte bara `sv_SE`/`en_GB`).
- Default-språk utelämnar ofta fältet `translated`.
- Övriga språk: `translated: true` = bekräftad översättning (glob av i UI); `false` = ej översatt (glob på).
- `update_titles` sätter `translated: true`. Massfix utan ny text: `confirm_translations` (inkl. edge-labels).

## Draft vs direct

| `TWO_C8_WRITE_MODE` | Beteende |
|---|---|
| `draft` | Modeller skapas via draft; `accept_draft_model` för att ta in dem |
| `direct` | Skriver direkt i målrepot (bra i sandlåda) |

## Reuse-first

Innan ny symbol: `search_symbols` i **samma** repo. Återanvänd UUID när affärsbegreppet matchar.

## Process vs processkarta

- **Detaljprocess:** aktiviteter + verksamhetsobjekt på FLOW, RACI per aktivitet.
- **Översikt / processkarta:** processchevroner + verksamhetsobjekt (inga aktiviteter). I/O måste vara samma symboler som i detaljmodellerna.

## Vägval

2c8 har ingen “gateway”-typ för exklusivt val. Anropa `resolve_branching_object_type` → använd **`or`**. Aldrig Join/Förbinda.

Mönster: `aktivitet → BO → or → nästa aktivitet`.

## Dokument på aktiviteter

- **CONTROLS / IS_USED_BY** = stegspecifika.
- Processövergripande policyer: på processymbolen / dokumentpanelen, inte fan-out på varje steg.
- MT-dokument: `type: URL|file`; länk via `{ id, source: "mt.documents" }`.

## Kvalitet

Ingen modell är klar utan `review_process_model`. Se [quality-gates.md](quality-gates.md).
