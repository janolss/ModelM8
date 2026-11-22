# Kom igång med modelM8

modelM8 är en **MCP-server**. Den ger AI-agenter verktyg för att läsa och skapa processmodeller i **2c8 Modeling Tool**.

- **modelM8** = verktyget (MCP)
- **2c8** = där modellerna lagras och metodiken gäller

## Krav

- Node.js 26+
- Tillgång till en 2c8 MT-backend (`…/mt-backend`)
- API-nyckel (`x-api-key`)

## Installera

```bash
git clone <denna-repo-url>
cd modelM8   # eller ditt lokala katalognamn
npm install
cp .env.example .env
```

Redigera `.env` — minst:

```env
TWO_C8_BASE_URL=https://din-server.example/mt-backend
TWO_C8_API_KEY=...
TWO_C8_ALLOW_WRITES=true
TWO_C8_WRITE_MODE=direct
```

| Variabel | Betydelse |
|---|---|
| `TWO_C8_ALLOW_WRITES` | `true` för att skapa/ändra modeller |
| `TWO_C8_WRITE_MODE` | `draft` (säkrare) eller `direct` (sandlåda/utveckling) |
| `TWO_C8_ALLOW_DELETES` | Lämna `false` om du inte absolut behöver `delete_model` |
| `PORT` / `HOST` | HTTP-lyssning (standard `127.0.0.1:3000`) |

## Bygg och starta

```bash
npm run build

# HTTP (rekommenderas för de flesta MCP-klienter)
npm run start:http

# eller stdio (klienten startar processen själv)
npm start
```

Hälsokoll: `GET http://127.0.0.1:3000/health`

## Nästa steg

1. [Anslut din MCP-klient](connect.md)
2. [Begrepp](concepts.md) — repo, språk, reuse-first
3. Välj workflow: [läsa](workflows/consume.md) · [text](workflows/text-to-model.md) · [dokument](workflows/document-to-model.md) · [tal](workflows/speech-to-model.md) · [helt IMS](workflows/ims-from-plan.md)

### Docker (valfritt)

```bash
docker build -t modelm8 .   # bas: node:26-alpine
docker run --rm -p 3000:3000 \
  -e TWO_C8_BASE_URL=https://host/mt-backend \
  -e TWO_C8_API_KEY=... \
  -e TWO_C8_ALLOW_WRITES=true \
  -e TWO_C8_WRITE_MODE=direct \
  modelm8
```
