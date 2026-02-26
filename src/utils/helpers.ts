import https from "https";
import { bot } from "../services/clients.js";

export function sendMessage(chatId: number, text: string) {
  return bot.sendMessage(chatId, text);
}

export function downloadFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}
