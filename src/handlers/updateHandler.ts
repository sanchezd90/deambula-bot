import { SystemMessage } from "@langchain/core/messages";
import type TelegramBot from "node-telegram-bot-api";
import { getPending } from "../db.js";
import { llm } from "../services/clients.js";
import { sendMessage } from "../utils/helpers.js";
import {
  handleActivityName,
  handleDesire,
  handleTextDescription,
  handleVoiceDescription,
} from "./activityHandlers.js";

async function classifyIntent(text: string): Promise<string> {
  const response = await llm.invoke([
    new SystemMessage(
      `Based on the following text determine if the user is giving the name for an activity, ` +
      `which will be a sentence starting with an infinitive such as "Caminar a la tarde por la costanera"; ` +
      `if the user is expressing a desire; if the user is giving a wide description of a place or activity; or other. ` +
      `Output the word "name", "desire", "description" or "other" respectively. Text:${text}`
    ),
  ], { maxTokens: 20 } as Record<string, unknown>);
  return String(response.content).trim().toLowerCase().replaceAll(/[^a-z]/g, "");
}

export async function handleUpdate(update: TelegramBot.Update): Promise<void> {
  const msg = update.message;
  console.log(msg);
  if (!msg) {
    console.log("[webhook] Update has no message, skipping");
    return;
  }

  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const username = msg.from?.username ?? "unknown";

  if (msg.voice) {
    const pending = getPending(chatId);
    if (!pending) {
      await sendMessage(chatId, "Define primero una actividad");
      return;
    }
    await handleVoiceDescription(chatId, messageId, msg.voice.file_id, pending);
    return;
  }

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
