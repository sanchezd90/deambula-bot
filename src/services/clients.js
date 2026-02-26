import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { Pinecone } from "@pinecone-database/pinecone";
import TelegramBot from "node-telegram-bot-api";
import { config } from "../config.js";

export const bot = new TelegramBot(config.TELEGRAM_TOKEN);
export const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 1,
  openAIApiKey: config.OPENAI_API_KEY,
});
export const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  dimensions: 512,
  openAIApiKey: config.OPENAI_API_KEY,
});
export const pinecone = new Pinecone({ apiKey: config.PINECONE_API_KEY });
export const index = pinecone.index(config.PINECONE_INDEX);
