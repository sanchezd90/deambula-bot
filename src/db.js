import Database from "better-sqlite3";

const db = new Database("deambula.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_activities (
    chat_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

export function getPending(chatId) {
  return db.prepare("SELECT * FROM pending_activities WHERE chat_id = ?").get(String(chatId));
}

export function setPending(chatId, name, username) {
  db.prepare("INSERT OR REPLACE INTO pending_activities (chat_id, name, username) VALUES (?, ?, ?)").run(String(chatId), name, username);
}

export function deletePending(chatId) {
  db.prepare("DELETE FROM pending_activities WHERE chat_id = ?").run(String(chatId));
}
