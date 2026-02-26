import FormData from "form-data";
import fetch from "node-fetch";
import { config } from "../config.js";

export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", audioBuffer, { filename, contentType: "audio/ogg" });
  form.append("model", "whisper-1");
  form.append("language", "es");
  form.append("temperature", "0.1");
  form.append("prompt", "Transcribe the audio in spanish");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      ...form.getHeaders(),
    },
    body: form as import("node-fetch").RequestInit["body"],
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper error ${res.status}: ${err}`);
  }
  const json = (await res.json()) as { text: string };
  return json.text;
}
