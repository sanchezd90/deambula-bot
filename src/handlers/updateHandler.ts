import { SystemMessage } from "@langchain/core/messages";
import type TelegramBot from "node-telegram-bot-api";
import { getPending } from "../db.js";
import { IntentSchema } from "../schemas.js";
import { llm } from "../services/clients.js";
import { sendMessage } from "../utils/helpers.js";
import { MESSAGES } from "../messages.js";
import {
  handleActivityName,
  handleDesire,
  handleTextDescription,
  handleVoiceDescription,
} from "./activityHandlers.js";

const structuredLlm = llm.withStructuredOutput(IntentSchema);

async function classifyIntent(text: string) {
  const response = await structuredLlm.invoke([
    new SystemMessage(
      `Based on the following text determine if the user is giving the name for an activity, ` +
      `which will be a sentence starting with an infinitive such as "Caminar a la tarde por la costanera"; ` +
      `if the user is expressing a desire; if the user is giving a wide description of a place or activity; or other. ` +
      `Text: ${text}`
    ),
  ], { maxTokens: 20 } as Record<string, unknown>);
  return response.intent;
}

export async function handleUpdate(update: TelegramBot.Update): Promise<void> {
  const msg = update.message;
  
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
      await sendMessage(chatId, MESSAGES.defineActivityFirst);
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
        await sendMessage(chatId, MESSAGES.descriptionWithoutName);
      }
    } else {
      await sendMessage(chatId, MESSAGES.welcome);
    }
    return;
  }

  await sendMessage(chatId, MESSAGES.welcome);

}
