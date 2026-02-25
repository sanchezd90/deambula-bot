import "dotenv/config";
import express from "express";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import Database from "better-sqlite3";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import https from "https";
import FormData from "form-data";
import fetch from "node-fetch";

// ─── Config ──────────────────────────────────────────────────────────────────
const {
  TELEGRAM_TOKEN,
  OPENAI_API_KEY,
  PINECONE_API_KEY,
  PINECONE_INDEX,
  PORT = 3000,
  WEBHOOK_URL, // e.g. https://yourdomain.com/webhook
} = process.env;

// ─── Clients ─────────────────────────────────────────────────────────────────
const bot = new TelegramBot(TELEGRAM_TOKEN);
const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 1, openAIApiKey: OPENAI_API_KEY });
const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small", dimensions: 512, openAIApiKey: OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pinecone.index(PINECONE_INDEX);

// ─── SQLite datastore (replaces Make's built-in Data Store) ──────────────────
const db = new Database("deambula.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_activities (
    chat_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

function getPending(chatId) {
  return db.prepare("SELECT * FROM pending_activities WHERE chat_id = ?").get(String(chatId));
}
function setPending(chatId, name, username) {
  db.prepare("INSERT OR REPLACE INTO pending_activities (chat_id, name, username) VALUES (?, ?, ?)").run(String(chatId), name, username);
}
function deletePending(chatId) {
  db.prepare("DELETE FROM pending_activities WHERE chat_id = ?").run(String(chatId));
}

// ─── Express + Webhook ───────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  const update = req.body;
  const updateId = update?.update_id;
  const hasMessage = !!update?.message;
  const hasCallback = !!update?.callback_query;
  console.log(`[webhook] Received update_id=${updateId} message=${hasMessage} callback_query=${hasCallback}`);
  if (hasMessage) {
    const from = update.message?.from?.username ?? update.message?.from?.id;
    const raw = update.message?.text;
    let kind;
    if (raw) {
      kind = raw.length > 50 ? `"${raw.slice(0, 50)}..."` : `"${raw}"`;
    } else {
      kind = update.message?.voice ? "[voice]" : "[other]";
    }
    console.log(`[webhook] From @${from} ${kind}`);
  }
  res.sendStatus(200);
  handleUpdate(update).catch((err) => {
    console.error("[webhook] handleUpdate error:", err);
  });
});

app.listen(PORT, async () => {
  console.log(`DeambulaBot listening on port ${PORT}`);
  if (WEBHOOK_URL) {
    try {
      const fullUrl = `${WEBHOOK_URL}/webhook`;
      await bot.setWebHook(fullUrl);
      console.log(`[webhook] Registered successfully: ${fullUrl}`);
    } catch (err) {
      console.error("[webhook] Failed to set webhook:", err.message);
    }
  } else {
    console.warn("[webhook] No WEBHOOK_URL set – set it and restart to register with Telegram.");
  }
});

// ─── Main update handler ─────────────────────────────────────────────────────
async function handleUpdate(update) {
  const msg = update.message;
  if (!msg) {
    console.log("[webhook] Update has no message, skipping");
    return;
  }

  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const username = msg.from?.username ?? "unknown";

  // ── Route: Voice message ──────────────────────────────────────────────────
  if (msg.voice) {
    const pending = getPending(chatId);
    if (!pending) {
      return sendMessage(chatId, "Define primero una actividad");
    }
    await handleVoiceDescription(chatId, messageId, username, msg.voice.file_id, pending);
    return;
  }

  // ── Route: Text message ───────────────────────────────────────────────────
  if (msg.text) {
    const pending = getPending(chatId);
    const intent = await classifyIntent(msg.text);

    if (intent === "name") {
      await handleActivityName(chatId, msg.text, username);
    } else if (intent === "desire") {
      await handleDesire(chatId, msg.text);
    } else if (intent === "description") {
      if (pending) {
        await handleTextDescription(chatId, messageId, msg.text, pending);
      } else {
        await sendMessage(chatId,
          "Parece que estas describiendo una actividad sin mencionar su nombre primero. " +
          'Decime el nombre de la actividad expresada como una accion (p. ej. "Sentarse a comer en el Banco Rojo").'
        );
      }
    } else {
      await sendMessage(chatId,
        "Hola! Estoy aca para ayudarte a deambular. " +
        'Si queres agregar una nueva actividad dame el nombre expresado como una accion (p. ej. "Sentarse a comer en el Banco Rojo"). ' +
        "Si queres consultar qué podrías hacer decime de qué tenés ganas o qué tenés en mente."
      );
    }
  }
}

// ─── Intent classifier ────────────────────────────────────────────────────────
async function classifyIntent(text) {
  const response = await llm.invoke([
    new SystemMessage(
      `Based on the following text determine if the user is giving the name for an activity, ` +
      `which will be a sentence starting with an infinitive such as "Caminar a la tarde por la costanera"; ` +
      `if the user is expressing a desire; if the user is giving a wide description of a place or activity; or other. ` +
      `Output the word "name", "desire", "description" or "other" respectively. Text:${text}`
    ),
  ], { maxTokens: 20 });
  return response.content.trim().toLowerCase().replace(/[^a-z]/g, "");
}

// ─── Handler: activity name ───────────────────────────────────────────────────
async function handleActivityName(chatId, text, username) {
  setPending(chatId, text, username);
  await sendMessage(chatId, "Ahora enviame un audio con la descripcion del lugar");
}

// ─── Handler: desire → semantic search → GPT summary ─────────────────────────
async function handleDesire(chatId, desireText) {
  const queryEmbedding = await embeddings.embedQuery(desireText);

  const results = await index.query({
    vector: queryEmbedding,
    topK: 10,
    includeMetadata: true,
  });

  const data = results.matches.map((m) => ({
    score: m.score,
    metadata: m.metadata,
  }));

  const response = await llm.invoke([
    new SystemMessage(
      `You are a helpful assistant. You will be provided with the output of a semantic query of activities ` +
      `based on an expressed desire of the user, which is "${desireText}". ` +
      `Based on the following data pick the three activities that best match with the stated desire ` +
      `and present them to the user in spanish, highlighting how they match the desire. ` +
      `If there are less than three activities do not make them up. Avoid final remarks.\nData:\n${JSON.stringify(data)}`
    ),
  ], { maxTokens: 2048 });

  await sendMessage(chatId, response.content);
}

// ─── Handler: text description ────────────────────────────────────────────────
async function handleTextDescription(chatId, messageId, descriptionText, pending) {
  const inputText = `El nombre de la actividad es '${pending.name}' y consiste en '${descriptionText}'`;
  await upsertAndConfirm(chatId, messageId, inputText, descriptionText, pending);
}

// ─── Handler: voice description ───────────────────────────────────────────────
async function handleVoiceDescription(chatId, messageId, username, fileId, pending) {
  // 1. Download file from Telegram
  const fileUrl = await bot.getFileLink(fileId);
  const audioBuffer = await downloadFile(fileUrl);

  // 2. Transcribe with Whisper
  const transcription = await transcribeAudio(audioBuffer, "voice.oga");

  // 3. Embed and upsert
  const inputText = `El nombre de la actividad es '${pending.name}' y consiste en '${transcription}'`;
  await upsertAndConfirm(chatId, messageId, inputText, transcription, pending);
}

// ─── Shared: embed → Pinecone upsert → cleanup → confirm ─────────────────────
async function upsertAndConfirm(chatId, messageId, inputText, displayText, pending) {
  try {
    const vector = await embeddings.embedQuery(inputText);

    await index.upsert([{
      id: `${pending.username}-${chatId}-${messageId}`,
      values: vector,
      metadata: {
        actividad: pending.name,
        text: displayText,
      },
    }]);

    deletePending(chatId);
    await sendMessage(chatId, "Ya guardé tu actividad!");
  } catch (err) {
    console.error("Upsert error:", err);
    await sendMessage(chatId, "Hubo un error. La descripcion no pudo ser guardada");
  }
}

// ─── Whisper transcription via OpenAI REST (multipart) ───────────────────────
async function transcribeAudio(audioBuffer, filename) {
  const form = new FormData();
  form.append("file", audioBuffer, { filename, contentType: "audio/ogg" });
  form.append("model", "whisper-1");
  form.append("language", "es");
  form.append("temperature", "0.1");
  form.append("prompt", "Transcribe the audio in spanish");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper error ${res.status}: ${err}`);
  }
  const json = await res.json();
  return json.text;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sendMessage(chatId, text) {
  return bot.sendMessage(chatId, text);
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}
