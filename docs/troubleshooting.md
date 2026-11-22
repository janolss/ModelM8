# Felsökning

## Anslutning

| Symptom | Åtgärd |
|---|---|
| Inga verktyg / auth-fel | Starta om modelM8; återanslut MCP-klienten |
| `list_repositories` failar | Kontrollera `TWO_C8_BASE_URL`, API-nyckel, nätverk |
| Skrivverktyg saknas | `TWO_C8_ALLOW_WRITES=true` och starta om |

## Tom HTTP 200

Många PATCH returnerar tom body. modelM8 tolkar det som `{ ok: true }`. Det är **inte** ett fel.

## Dokument

| Fel | Åtgärd |
|---|---|
| `Document type must be provided` | Fältet `type`: `"URL"` eller `"file"` (inte samma sak som `documentTypes`) |
| 400 vid länk | Använd `{ id, source: "mt.documents" }` — inte rena UUID-strängar |
| Inga dokumenttyper i nytt repo | `create_document_type` efter `list_document_types` |

## Översättningar / globber i 2c8 UI

- `translated: true` = bekräftad (glob av)  
- `translated: false` = ej översatt (glob på)  
- Symboltitlar: `update_titles` / `confirm_translations`  
- **Edge-labels** (Ja/Nej): ingår i `confirm_translations` (inte i enbart symbol-PATCH)

## Nedbrytningar

- Länkar lagras på **detalj** (`broken-down-from`)  
- `get_breakdowns(översikt)` ofta tom/404 → `get_navigation_tree`

## Modellering

| Fel | Åtgärd |
|---|---|
| gateway / join | `resolve_branching_object_type` → `or`; aldrig Join |
| `businessObjectCount = 0` | Alternera BO ↔ aktivitet i kedjan |
| 400 efter flytt av symboler | `move_canvas_vertices` reorthogonaliserar edges som default |

## Utvecklardocs

- [API-GAP-ANALYSIS.md](dev/API-GAP-ANALYSIS.md)  
- [mcp-errors.md](dev/mcp-errors.md)
