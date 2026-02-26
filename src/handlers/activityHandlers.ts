import { SystemMessage } from "@langchain/core/messages";
import { deletePending, setPending } from "../db.js";
import { llm, embeddings, index, bot } from "../services/clients.js";
import { transcribeAudio } from "../services/transcription.js";
import { sendMessage, downloadFile } from "../utils/helpers.js";
import { MESSAGES } from "../messages.js";
import type { PendingActivity } from "../db.js";

export async function handleActivityName(chatId: number, text: string, username: string): Promise<void> {
  setPending(chatId, text, username);
  await sendMessage(chatId, MESSAGES.sendAudioDescription);
}

export async function handleDesire(chatId: number, desireText: string): Promise<void> {
  const queryEmbedding = await embeddings.embedQuery(desireText);

  const results = await index.query({
    vector: queryEmbedding,
    topK: 10,
    includeMetadata: true,
  });

  const data = results.matches?.map((m: { score?: number; metadata?: Record<string, unknown> }) => ({
    score: m.score,
    metadata: m.metadata,
  })) ?? [];

  const response = await llm.invoke([
    new SystemMessage(
      `You are a helpful assistant. You will be provided with the output of a semantic query of activities ` +
      `based on an expressed desire of the user, which is "${desireText}". ` +
      `Based on the following data pick the three activities that best match with the stated desire ` +
      `and present them to the user in spanish, highlighting how they match the desire. ` +
      `If there are less than three activities do not make them up. Avoid final remarks.\nData:\n${JSON.stringify(data)}`
    ),
  ], { maxTokens: 2048 } as Record<string, unknown>);

  await sendMessage(chatId, String(response.content));
}

export async function handleTextDescription(
  chatId: number,
  messageId: number,
  descriptionText: string,
  pending: PendingActivity
): Promise<void> {
  const inputText = `El nombre de la actividad es '${pending.name}' y consiste en '${descriptionText}'`;
  await upsertAndConfirm(chatId, messageId, inputText, descriptionText, pending);
}

export async function handleVoiceDescription(
  chatId: number,
  messageId: number,
  fileId: string,
  pending: PendingActivity
): Promise<void> {
  const fileUrl = await bot.getFileLink(fileId);
  const audioBuffer = await downloadFile(fileUrl);
  const transcription = await transcribeAudio(audioBuffer, "voice.oga");
  const inputText = `El nombre de la actividad es '${pending.name}' y consiste en '${transcription}'`;
  await upsertAndConfirm(chatId, messageId, inputText, transcription, pending);
}

async function upsertAndConfirm(
  chatId: number,
  messageId: number,
  inputText: string,
  displayText: string,
  pending: PendingActivity
): Promise<void> {
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
    await sendMessage(chatId, MESSAGES.activitySaved);
  } catch (err) {
    console.error("Upsert error:", err);
    await sendMessage(chatId, MESSAGES.saveError);
  }
}
