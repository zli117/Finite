import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import path from 'path';
import fs from 'fs';

// Get database path from environment or use default
const dbPath = env.DATABASE_PATH || path.join(process.cwd(), 'data', 'okr.db');

// Ensure the directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Create SQLite database connection
const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent access
sqlite.pragma('journal_mode = WAL');

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

// Run migrations at runtime (not during build) to create/update tables.
//
// Two paths:
// 1. Empty DB → run `migrate()` to create every table from scratch.
// 2. Existing DB (created via `db:push` or previous run) → skip `migrate()`
//    entirely and rely on the targeted `ensureColumn` calls below for
//    additive schema changes. The journal table is not a reliable indicator
//    of which migrations have been applied (it may be empty from a partial
//    setup), so we don't trust it.
if (!building) {
	const migrationsFolder = path.join(process.cwd(), 'drizzle');
	const tableCount = (
		sqlite
			.prepare(
				"SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'"
			)
			.get() as { c: number }
	).c;

	if (tableCount === 0 && fs.existsSync(migrationsFolder)) {
		try {
			migrate(db, { migrationsFolder });
		} catch (err) {
			console.error('[db] Initial migration failed:', err);
			throw err;
		}
	}

	// Additive schema sync. Idempotent; safe to run on every startup.
	// Add a new line here for any future column added to an existing table.
	ensureColumn(sqlite, 'user_ai_config', 'max_agent_rounds', 'INTEGER NOT NULL DEFAULT 20');
}

function ensureColumn(
	conn: InstanceType<typeof Database>,
	table: string,
	column: string,
	definition: string
) {
	try {
		const exists = conn
			.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
			.get(table);
		if (!exists) return;
		const cols = conn.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[];
		if (cols.some((c) => c.name === column)) return;
		conn.exec(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
		console.log(`[db] Added missing column ${table}.${column}`);
	} catch (err) {
		console.warn(`[db] Failed to ensure column ${table}.${column}:`, err);
	}
}

// Export the raw SQLite connection for migrations
export { sqlite };
