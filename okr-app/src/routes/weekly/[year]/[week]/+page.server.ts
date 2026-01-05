import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { timePeriods, tasks, taskAttributes, taskTags } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getWeekNumber, getWeekStartDate, getWeekYear, formatDate, addDays, getDayName } from '$lib/utils/week';

export const load: PageServerLoad = async ({ params, locals, depends }) => {
	// Register dependency for invalidation
	depends('data:weekly');
	depends('data:tasks');

	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const year = parseInt(params.year);
	const week = parseInt(params.week);
	const weekStartDay = locals.user.weekStartDay || 'monday';

	if (isNaN(year) || isNaN(week) || week < 1 || week > 53) {
		const today = new Date();
		const currentYear = getWeekYear(today, weekStartDay);
		const currentWeek = getWeekNumber(today, weekStartDay);
		throw redirect(302, `/weekly/${currentYear}/${currentWeek}`);
	}

	// Get the dates for this week (using UTC-based utilities)
	const weekStart = getWeekStartDate(year, week, weekStartDay);
	const days: { date: string; dayName: string; tasks: any[]; period: any }[] = [];

	for (let i = 0; i < 7; i++) {
		const date = addDays(weekStart, i);
		const dateStr = formatDate(date);
		const dayName = getDayName(date);

		// Find the period for this day
		const period = await db.query.timePeriods.findFirst({
			where: and(
				eq(timePeriods.userId, locals.user.id),
				eq(timePeriods.periodType, 'daily'),
				eq(timePeriods.day, dateStr)
			)
		});

		let dayTasks: any[] = [];
		if (period) {
			const periodTasks = await db.query.tasks.findMany({
				where: eq(tasks.timePeriodId, period.id),
				orderBy: (task, { asc }) => [asc(task.sortOrder)]
			});

			dayTasks = await Promise.all(
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
		}

		days.push({
			date: dateStr,
			dayName,
			tasks: dayTasks,
			period
		});
	}

	// Calculate weekly stats
	const allTasks = days.flatMap((d) => d.tasks);
	const completedTasks = allTasks.filter((t) => t.completed);
	const totalHours = allTasks.reduce((sum, t) => {
		const hours = parseFloat(t.attributes?.hour || '0');
		return sum + (isNaN(hours) ? 0 : hours);
	}, 0);

	return {
		year,
		week,
		weekStartDay,
		days,
		stats: {
			totalTasks: allTasks.length,
			completedTasks: completedTasks.length,
			totalHours: totalHours.toFixed(1)
		}
	};
};
