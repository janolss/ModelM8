# Anslut en MCP-klient till ModelM8

ModelM8 talar **MCP**. Vilken agent eller IDE som helst som kan anropa en MCP-server fungerar.

## Två transportlägen

| Läge | När | Endpoint / start |
|---|---|---|
| **HTTP** | Klienten pekar på en URL | `http://127.0.0.1:3000/mcp` (eller din host/port) |
| **stdio** | Klienten startar `node dist/index.js` | Processen läser env från `.env` / miljövariabler |

Starta HTTP-läge:

```bash
npm run start:http
```

## Checklista efter anslutning

Be agenten (eller kör verktygen) i denna ordning:

1. `list_repositories` — minst ett repo syns  
2. `get_api_versions` — backend svarar  
3. `list_languages` på valt repo — språk-UUID:n sparas  
4. Om du ska skriva: bekräfta att skrivverktyg finns (`create_repository`, `propose_model_from_text`, …)

Misslyckas steg 1–2: kontrollera `TWO_C8_BASE_URL`, API-nyckel och att servern kör (`GET /health`).

## Namngivning i klienten

Registrera servern under namnet **ModelM8** (eller motsvarande display name). Modellerna ligger fortfarande i **2c8** — förväxla inte namnen i instruktioner till agenten.

## Klientspecifika bilagor

- [VS Code + GitHub Copilot](clients/vscode-copilot.md)

Övriga klienter: använd samma HTTP-URL eller stdio-kommando enligt klientens MCP-dokumentation.
