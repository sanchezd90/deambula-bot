import "dotenv/config";

export const config = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  PINECONE_API_KEY: process.env.PINECONE_API_KEY,
  PINECONE_INDEX: process.env.PINECONE_INDEX,
  PORT: Number(process.env.PORT) || 3000,
  WEBHOOK_URL: process.env.WEBHOOK_URL,
};
