import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Where the copies go (git-ignored, like all of backend/private). */
export const BACKUPS_DIR = path.resolve(__dirname, "../private/backups");

/**
 * Every Supabase table (backend/supabase/schema.sql) with the columns of its primary key: the copy reads them in that
 * order, page by page, and a restore writes rows back by them. A new table must be added here to be copied.
 */
export const BACKUP_TABLES = [
  { table: "users", key: ["id"] },
  { table: "friendships", key: ["user_a", "user_b"] },
  { table: "question_reports", key: ["id"] },
  { table: "questions", key: ["id"] },
  { table: "songs", key: ["id"] },
  { table: "spotify_songs", key: ["spotify_id"] },
  { table: "lyric_rounds", key: ["song_id"] },
  { table: "lyric_queue", key: ["song_id"] },
  { table: "feed_cache", key: ["key"] },
];
