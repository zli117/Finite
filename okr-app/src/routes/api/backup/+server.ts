import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import {
	users,
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

// GET /api/backup - Create a backup of user's data
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;

	try {
		// Fetch all user data
		const backup = {
			version: 1,
			exportedAt: new Date().toISOString(),
			userId: userId,
			data: {
				values: await db.query.values.findMany({
					where: eq(values.userId, userId)
				}),
				principles: await db.query.principles.findMany({
					where: eq(principles.userId, userId)
				}),
				objectives: await db.query.objectives.findMany({
					where: eq(objectives.userId, userId)
				}),
				keyResults: await db.query.keyResults.findMany({
					where: eq(keyResults.userId, userId)
				}),
				timePeriods: await db.query.timePeriods.findMany({
					where: eq(timePeriods.userId, userId)
				}),
				tasks: await db.query.tasks.findMany({
					where: eq(tasks.userId, userId)
				}),
				taskAttributes: await db.query.taskAttributes.findMany({
					where: eq(taskAttributes.userId, userId)
				}),
				tags: await db.query.tags.findMany({
					where: eq(tags.userId, userId)
				}),
				taskTags: await db.query.taskTags.findMany({
					where: eq(taskTags.userId, userId)
				}),
				dailyMetrics: await db.query.dailyMetrics.findMany({
					where: eq(dailyMetrics.userId, userId)
				}),
				savedQueries: await db.query.savedQueries.findMany({
					where: eq(savedQueries.userId, userId)
				}),
				plugins: await db.query.plugins.findMany({
					where: eq(plugins.userId, userId)
				})
			}
		};

		// Return as downloadable JSON file
		const filename = `okr-backup-${new Date().toISOString().split('T')[0]}.json`;

		return new Response(JSON.stringify(backup, null, 2), {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (error) {
		console.error('Backup failed:', error);
		return json({ error: 'Failed to create backup' }, { status: 500 });
	}
};
