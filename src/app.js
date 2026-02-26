import express from "express";
import { config } from "./config.js";
import { bot } from "./services/clients.js";
import { handleUpdate } from "./handlers/updateHandler.js";

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

export async function startServer() {
  app.listen(config.PORT, async () => {
    console.log(`DeambulaBot listening on port ${config.PORT}`);
    if (config.WEBHOOK_URL) {
      try {
        const fullUrl = `${config.WEBHOOK_URL}/webhook`;
        await bot.setWebHook(fullUrl);
        console.log(`[webhook] Registered successfully: ${fullUrl}`);
      } catch (err) {
        console.error("[webhook] Failed to set webhook:", err.message);
      }
    } else {
      console.warn("[webhook] No WEBHOOK_URL set – set it and restart to register with Telegram.");
    }
  });
}
