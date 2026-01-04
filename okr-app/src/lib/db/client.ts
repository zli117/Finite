import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';
import path from 'path';

// Get database path from environment or use default
const dbPath = env.DATABASE_PATH || path.join(process.cwd(), 'data', 'okr.db');

// Create SQLite database connection
const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent access
sqlite.pragma('journal_mode = WAL');

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

// Export the raw SQLite connection for migrations
export { sqlite };
