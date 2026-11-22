# VS Code + GitHub Copilot med ModelM8

Denna bilaga visar hur du kopplar ModelM8 till **Visual Studio Code** med **GitHub Copilot** (agent / MCP-stöd). Andra klienter: se [connect.md](../connect.md).

## Förutsättningar

- ModelM8 körs (rekommenderat: `npm run start:http`)
- VS Code med GitHub Copilot och MCP-stöd aktiverat enligt Microsofts aktuella dokumentation
- `.env` ifylld (`TWO_C8_*`, writes om du ska skapa modeller)

## HTTP-anslutning (rekommenderas)

1. Starta ModelM8: `npm run start:http`  
2. I VS Code / Copilot: lägg till en MCP-server som pekar på  
   `http://127.0.0.1:3000/mcp`  
   (byt port om du ändrat `PORT`)  
3. Namnge servern **ModelM8**  
4. Verifiera med checklistan i [connect.md](../connect.md)

Exakt menyväg och JSON-format kan ändras mellan Copilot-/VS Code-versioner — följ den inbyggda hjälpen för “MCP servers” och använd URL:en ovan.

## stdio (alternativ)

Om klienten startar processen själv, peka på:

```text
node /absolut/sökväg/till/ModelM8/dist/index.js
```

Sätt miljövariabler (`TWO_C8_BASE_URL`, `TWO_C8_API_KEY`, …) i klientens MCP-konfiguration eller via `.env` som processen läser vid start.

## Tips

- Börja med **läsverktyg** innan `TWO_C8_ALLOW_WRITES=true` i produktion.
- För sandlåda: `TWO_C8_WRITE_MODE=direct`.
- Agentprompts: [examples/prompts/](../../examples/prompts/).
