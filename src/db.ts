import Database from "better-sqlite3";

export interface PendingActivity {
  chat_id: string;
  name: string;
  username: string;
  created_at: number;
}

const db = new Database("deambula.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_activities (
    chat_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

export function getPending(chatId: number | string): PendingActivity | undefined {
  return db.prepare("SELECT * FROM pending_activities WHERE chat_id = ?").get(String(chatId)) as PendingActivity | undefined;
}

export function setPending(chatId: number | string, name: string, username: string): void {
  db.prepare("INSERT OR REPLACE INTO pending_activities (chat_id, name, username) VALUES (?, ?, ?)").run(String(chatId), name, username);
}

export function deletePending(chatId: number | string): void {
  db.prepare("DELETE FROM pending_activities WHERE chat_id = ?").run(String(chatId));
}
