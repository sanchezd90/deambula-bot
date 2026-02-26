import https from "https";
import { bot } from "../services/clients.js";

export function sendMessage(chatId, text) {
  return bot.sendMessage(chatId, text);
}

export function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}
