import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, sqlite } from '$lib/db/client';
import {
	objectives,
	keyResults,
	timePeriods,
	tasks,
	taskAttributes,
	tags,
	taskTags,
	dailyMetrics,
	savedQueries,
	plugins,
	values,
	principles
} from '$lib/db/schema';
import { eq } from 'drizzle-orm';

interface BackupData {
	version: number;
	exportedAt: string;
	userId: string;
	data: {
		values?: unknown[];
		principles?: unknown[];
		objectives?: unknown[];
		keyResults?: unknown[];
		timePeriods?: unknown[];
		tasks?: unknown[];
		taskAttributes?: unknown[];
		tags?: unknown[];
		taskTags?: unknown[];
		dailyMetrics?: unknown[];
		savedQueries?: unknown[];
		plugins?: unknown[];
	};
}

// POST /api/backup/restore - Restore from backup
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;

	try {
		const backup: BackupData = await request.json();

		// Validate backup format
		if (!backup.version || !backup.data) {
			return json({ error: 'Invalid backup format' }, { status: 400 });
		}

		if (backup.version !== 1) {
			return json({ error: `Unsupported backup version: ${backup.version}` }, { status: 400 });
		}

		// Use a transaction for atomic restore
		const result = sqlite.transaction(() => {
			const stats = {
				values: 0,
				principles: 0,
				objectives: 0,
				keyResults: 0,
				timePeriods: 0,
				tasks: 0,
				taskAttributes: 0,
				tags: 0,
				taskTags: 0,
				dailyMetrics: 0,
				savedQueries: 0,
				plugins: 0
			};

			// Helper to insert or update records
			const importRecords = <T extends Record<string, unknown>>(
				table: Parameters<typeof db.insert>[0],
				records: T[] | undefined,
				key: keyof typeof stats
			) => {
				if (!records || records.length === 0) return;

				for (const record of records) {
					// Override userId to current user
					const data = { ...record, userId };

					try {
						db.insert(table).values(data as never).onConflictDoNothing().run();
						stats[key]++;
					} catch {
						// Skip records that fail (likely duplicates)
					}
				}
			};

			// Delete existing data first (optional - for clean restore)
			// Uncomment these lines if you want restore to replace all data:
			// db.delete(taskTags).where(eq(taskTags.userId, userId)).run();
			// db.delete(taskAttributes).where(eq(taskAttributes.userId, userId)).run();
			// db.delete(tasks).where(eq(tasks.userId, userId)).run();
			// ... etc

			// Import in correct order (respecting foreign keys)
			importRecords(values, backup.data.values as never[], 'values');
			importRecords(principles, backup.data.principles as never[], 'principles');
			importRecords(objectives, backup.data.objectives as never[], 'objectives');
			importRecords(keyResults, backup.data.keyResults as never[], 'keyResults');
			importRecords(timePeriods, backup.data.timePeriods as never[], 'timePeriods');
			importRecords(tags, backup.data.tags as never[], 'tags');
			importRecords(tasks, backup.data.tasks as never[], 'tasks');
			importRecords(taskAttributes, backup.data.taskAttributes as never[], 'taskAttributes');
			importRecords(taskTags, backup.data.taskTags as never[], 'taskTags');
			importRecords(dailyMetrics, backup.data.dailyMetrics as never[], 'dailyMetrics');
			importRecords(savedQueries, backup.data.savedQueries as never[], 'savedQueries');

			// Skip plugins - credentials should be reconfigured
			// importRecords(plugins, backup.data.plugins as never[], 'plugins');

			return stats;
		})();

		return json({
			success: true,
			message: 'Backup restored successfully',
			stats: result
		});
	} catch (error) {
		console.error('Restore failed:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to restore backup' },
			{ status: 500 }
		);
	}
};
