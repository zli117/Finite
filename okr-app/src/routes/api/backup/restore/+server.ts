import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, sqlite } from '$lib/db/client';
import { eq } from 'drizzle-orm';
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
	principles,
	objectiveReflections,
	metricsTemplates,
	dailyMetricValues,
	users
} from '$lib/db/schema';

interface BackupData {
	version: number;
	exportedAt: string;
	userId: string;
	preferences?: {
		timezone?: string;
		weekStartDay?: 'sunday' | 'monday';
	};
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
		objectiveReflections?: unknown[];
		metricsTemplates?: unknown[];
		dailyMetricValues?: unknown[];
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

		// Helper to convert timestamp strings back to Date objects
		const convertTimestamps = (
			record: Record<string, unknown>,
			fields: string[]
		): Record<string, unknown> => {
			const result = { ...record };
			for (const field of fields) {
				if (result[field] && typeof result[field] === 'string') {
					result[field] = new Date(result[field] as string);
				}
			}
			return result;
		};

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
				plugins: 0,
				objectiveReflections: 0,
				metricsTemplates: 0,
				dailyMetricValues: 0
			};
			const errors: string[] = [];

			// Helper to insert records with userId override
			const importWithUserId = <T extends Record<string, unknown>>(
				table: Parameters<typeof db.insert>[0],
				records: T[] | undefined,
				key: keyof typeof stats,
				timestampFields: string[] = ['createdAt', 'updatedAt']
			) => {
				if (!records || records.length === 0) return;

				for (const record of records) {
					const data = convertTimestamps({ ...record, userId }, timestampFields);

					try {
						db.insert(table).values(data as never).onConflictDoNothing().run();
						stats[key]++;
					} catch (err) {
						errors.push(`${key}: ${err instanceof Error ? err.message : 'Unknown error'}`);
					}
				}
			};

			// Helper to insert records WITHOUT userId override (for child tables)
			const importWithoutUserId = <T extends Record<string, unknown>>(
				table: Parameters<typeof db.insert>[0],
				records: T[] | undefined,
				key: keyof typeof stats,
				timestampFields: string[] = ['createdAt', 'updatedAt']
			) => {
				if (!records || records.length === 0) return;

				for (const record of records) {
					const data = convertTimestamps({ ...record }, timestampFields);

					try {
						db.insert(table).values(data as never).onConflictDoNothing().run();
						stats[key]++;
					} catch (err) {
						errors.push(`${key}: ${err instanceof Error ? err.message : 'Unknown error'}`);
					}
				}
			};

			// Import in correct order (respecting foreign keys)
			// Tables with userId column
			importWithUserId(values, backup.data.values as never[], 'values');
			importWithUserId(principles, backup.data.principles as never[], 'principles');
			importWithUserId(objectives, backup.data.objectives as never[], 'objectives');
			importWithUserId(timePeriods, backup.data.timePeriods as never[], 'timePeriods');
			importWithUserId(tags, backup.data.tags as never[], 'tags');
			importWithUserId(tasks, backup.data.tasks as never[], 'tasks', [
				'createdAt',
				'updatedAt',
				'completedAt',
				'timerStartedAt'
			]);
			importWithUserId(dailyMetrics, backup.data.dailyMetrics as never[], 'dailyMetrics', []);
			importWithUserId(savedQueries, backup.data.savedQueries as never[], 'savedQueries');
			importWithUserId(
				objectiveReflections,
				backup.data.objectiveReflections as never[],
				'objectiveReflections'
			);
			importWithUserId(metricsTemplates, backup.data.metricsTemplates as never[], 'metricsTemplates');
			importWithUserId(dailyMetricValues, backup.data.dailyMetricValues as never[], 'dailyMetricValues', []);

			// Tables WITHOUT userId column (linked via foreign keys)
			importWithoutUserId(keyResults, backup.data.keyResults as never[], 'keyResults');
			importWithoutUserId(taskAttributes, backup.data.taskAttributes as never[], 'taskAttributes', []);
			importWithoutUserId(taskTags, backup.data.taskTags as never[], 'taskTags', []);

			// Skip plugins - credentials should be reconfigured
			// importWithUserId(plugins, backup.data.plugins as never[], 'plugins');

			// Restore user preferences if present
			if (backup.preferences) {
				const updates: { timezone?: string; weekStartDay?: 'sunday' | 'monday' } = {};
				if (backup.preferences.timezone) {
					updates.timezone = backup.preferences.timezone;
				}
				if (backup.preferences.weekStartDay) {
					updates.weekStartDay = backup.preferences.weekStartDay;
				}
				if (Object.keys(updates).length > 0) {
					db.update(users).set(updates).where(eq(users.id, userId)).run();
				}
			}

			if (errors.length > 0) {
				console.error('Restore errors:', errors.slice(0, 10));
			}

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
