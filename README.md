# DeambulaBot

A Node.js LangChain recreation of the Make.com DeambulaBot scenario. Users can log activities via Telegram (text name + voice or text description) and later query them semantically by expressing desires.

## Architecture

```
Telegram update
      │
      ├─ Voice message
      │       ├─ No pending activity → "Define primero una actividad"
      │       └─ Pending activity exists
      │               └─ Whisper transcription → Embed (text-embedding-3-small, 512d)
      │                       → Pinecone upsert → Delete pending → "Ya guardé tu actividad!"
      │
      └─ Text message
              │
              └─ GPT-4o-mini intent classifier → "name" | "desire" | "description" | "other"
                      │
                      ├─ name       → Save to SQLite (pending) → "Enviame un audio con la descripcion"
                      │
                      ├─ desire     → Embed query → Pinecone top-10 search
                      │               → GPT-4o-mini picks best 3 matches → Reply in Spanish
                      │
                      ├─ description
                      │       ├─ Pending exists → Embed (name + description) → Pinecone upsert
                      │       │                   → Delete pending → Confirm
                      │       └─ No pending     → Ask for activity name first
                      │
                      └─ other      → General help message
```

## Setup

```bash
npm install
cp .env.example .env
# fill in .env values
npm start
```

### Pinecone index requirements
- Dimension: **512**
- Metric: cosine (recommended)

### Exposing to the internet (for Telegram webhook)
Use a tunnel like [ngrok](https://ngrok.com/) during development:

```bash
ngrok http 3000
# then set WEBHOOK_URL=https://xxxx.ngrok.io in .env and restart
```

Or deploy to Railway, Render, Fly.io, etc.

## Environment variables

| Variable | Description |
|---|---|
| `TELEGRAM_TOKEN` | BotFather token |
| `OPENAI_API_KEY` | OpenAI API key |
| `PINECONE_API_KEY` | Pinecone API key |
| `PINECONE_INDEX` | Pinecone index name |
| `PORT` | HTTP port (default 3000) |
| `WEBHOOK_URL` | Public HTTPS URL for Telegram webhook |

## Data storage

Pending activities (activity name waiting for a description) are stored in a local **SQLite** database (`deambula.db`). This replaces Make's built-in Data Store. The record is deleted after the description is successfully embedded and stored in Pinecone.

## How to use

1. Send an activity name as an infinitive phrase, e.g.:  
   _"Caminar a la tarde por la costanera"_
2. The bot saves it and asks for a voice (or text) description.
3. Send a voice note (or text) describing the activity/place.
4. The bot embeds and indexes it in Pinecone, then confirms.
5. To search, express a desire, e.g.:  
   _"Quiero algo tranquilo al aire libre"_
6. The bot returns the top 3 matching activities in Spanish.
