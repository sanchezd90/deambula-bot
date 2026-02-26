import { SystemMessage } from "@langchain/core/messages";
import { getPending, deletePending, setPending } from "../db.js";
import { llm, embeddings, index, bot } from "../services/clients.js";
import { transcribeAudio } from "../services/transcription.js";
import { sendMessage, downloadFile } from "../utils/helpers.js";

export async function handleActivityName(chatId, text, username) {
  setPending(chatId, text, username);
  await sendMessage(chatId, "Ahora enviame un audio con la descripcion del lugar");
}

export async function handleDesire(chatId, desireText) {
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

export async function handleTextDescription(chatId, messageId, descriptionText, pending) {
  const inputText = `El nombre de la actividad es '${pending.name}' y consiste en '${descriptionText}'`;
  await upsertAndConfirm(chatId, messageId, inputText, descriptionText, pending);
}

export async function handleVoiceDescription(chatId, messageId,  fileId, pending) {
  const fileUrl = await bot.getFileLink(fileId);
  const audioBuffer = await downloadFile(fileUrl);
  const transcription = await transcribeAudio(audioBuffer, "voice.oga");
  const inputText = `El nombre de la actividad es '${pending.name}' y consiste en '${transcription}'`;
  await upsertAndConfirm(chatId, messageId, inputText, transcription, pending);
}

export async function upsertAndConfirm(chatId, messageId, inputText, displayText, pending) {
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
