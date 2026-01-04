import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { timePeriods, tasks, taskAttributes, taskTags, dailyMetrics } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// Helper to get week number from date
function getWeekNumber(date: Date): number {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// GET /api/periods/daily/[date] - Get a specific day's data
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const dateStr = params.date; // Expected format: YYYY-MM-DD

	// Validate date format
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		return json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
	}

	const date = new Date(dateStr);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const week = getWeekNumber(date);

	// Find or create the daily period
	let period = await db.query.timePeriods.findFirst({
		where: and(
			eq(timePeriods.userId, locals.user.id),
			eq(timePeriods.periodType, 'daily'),
			eq(timePeriods.day, dateStr)
		)
	});

	let created = false;
	if (!period) {
		const id = uuidv4();
		const now = new Date();

		await db.insert(timePeriods).values({
			id,
			userId: locals.user.id,
			periodType: 'daily',
			year,
			month,
			week,
			day: dateStr,
			createdAt: now,
			updatedAt: now
		});

		period = await db.query.timePeriods.findFirst({
			where: eq(timePeriods.id, id)
		});
		created = true;
	}

	if (!period) {
		return json({ error: 'Failed to get or create period' }, { status: 500 });
	}

	// Get tasks for this period
	const periodTasks = await db.query.tasks.findMany({
		where: eq(tasks.timePeriodId, period.id),
		orderBy: (task, { asc }) => [asc(task.sortOrder)]
	});

	// Get attributes for each task
	const tasksWithAttributes = await Promise.all(
		periodTasks.map(async (task) => {
			const attributes = await db.query.taskAttributes.findMany({
				where: eq(taskAttributes.taskId, task.id)
			});

			const tags = await db.query.taskTags.findMany({
				where: eq(taskTags.taskId, task.id)
			});

			return {
				...task,
				attributes: attributes.reduce(
					(acc, attr) => {
						acc[attr.key] = attr.value;
						return acc;
					},
					{} as Record<string, string>
				),
				tagIds: tags.map((t) => t.tagId)
			};
		})
	);

	// Get daily metrics
	const metrics = await db.query.dailyMetrics.findFirst({
		where: and(eq(dailyMetrics.timePeriodId, period.id), eq(dailyMetrics.userId, locals.user.id))
	});

	return json({
		period,
		tasks: tasksWithAttributes,
		metrics,
		created
	});
};
