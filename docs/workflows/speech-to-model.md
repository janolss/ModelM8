# Speech-to-model (tal → modell)

## När

Användaren beskriver processen muntligt och vill ha en 2c8-modell.

## Viktigt

**modelM8 har ingen tal-till-text.** Din MCP-klient / agent (t.ex. Copilot) sköter STT. modelM8 får **text** och kör samma kedja som text-to-model.

```text
Tal → (klientens STT) → text → modelM8 propose/apply → modell i 2c8
```

## Förutsättningar

Samma som [text-to-model](text-to-model.md), plus att klienten kan leverera tillförlitlig text från tal.

## Agentprompt

[examples/prompts/speech-to-model.md](../../examples/prompts/speech-to-model.md)

## Steg

1. Ta emot / sammanfatta taldiktatet som strukturerad text (gärna prefixad)
2. Låt användaren bekräfta sammanfattningen vid oklara vägval eller roller
3. Fortsätt exakt enligt [text-to-model](text-to-model.md) från `propose_model_from_text` (inkl. källbaserade aktivitetsbeskrivningar — gissa inte från tal som saknar syfte/hänsyn)

## Definition of done

Samma som text-to-model.

## Vanliga fel

| Symptom | Åtgärd |
|---|---|
| Tvetydigt tal (“ibland A ibland B”) | Ställ en fråga; modellera inte båda som fakta |
| Agent “transkriberar” in i verktyg som inte finns | Använd bara modelM8:s text-/write-verktyg |
