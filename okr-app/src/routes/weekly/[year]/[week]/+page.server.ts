import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { timePeriods, tasks, taskAttributes, taskTags } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';

// Get week number from date
function getWeekNumber(date: Date): number {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Get the start date of a week (Monday)
function getWeekStartDate(year: number, week: number): Date {
	const jan4 = new Date(Date.UTC(year, 0, 4));
	const dayOfWeek = jan4.getUTCDay() || 7;
	const monday = new Date(jan4);
	monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
	monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
	return monday;
}

// Format date as YYYY-MM-DD
function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const year = parseInt(params.year);
	const week = parseInt(params.week);

	if (isNaN(year) || isNaN(week) || week < 1 || week > 53) {
		const today = new Date();
		throw redirect(302, `/weekly/${today.getFullYear()}/${getWeekNumber(today)}`);
	}

	// Get the dates for this week
	const weekStart = getWeekStartDate(year, week);
	const days: { date: string; dayName: string; tasks: any[]; period: any }[] = [];

	for (let i = 0; i < 7; i++) {
		const date = new Date(weekStart);
		date.setDate(weekStart.getDate() + i);
		const dateStr = formatDate(date);
		const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

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
		days,
		stats: {
			totalTasks: allTasks.length,
			completedTasks: completedTasks.length,
			totalHours: totalHours.toFixed(1)
		}
	};
};
