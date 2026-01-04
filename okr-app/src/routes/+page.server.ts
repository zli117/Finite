import type { PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { timePeriods, tasks, taskAttributes, objectives, keyResults } from '$lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

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

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		return { user: null };
	}

	const today = new Date();
	const todayStr = formatDate(today);
	const currentYear = today.getFullYear();
	const currentWeek = getWeekNumber(today);

	// Get today's tasks
	const todayPeriod = await db.query.timePeriods.findFirst({
		where: and(
			eq(timePeriods.userId, locals.user.id),
			eq(timePeriods.periodType, 'daily'),
			eq(timePeriods.day, todayStr)
		)
	});

	let todayTasks: any[] = [];
	if (todayPeriod) {
		const periodTasks = await db.query.tasks.findMany({
			where: eq(tasks.timePeriodId, todayPeriod.id),
			orderBy: (task, { asc }) => [asc(task.sortOrder)]
		});

		todayTasks = await Promise.all(
			periodTasks.map(async (task) => {
				const attributes = await db.query.taskAttributes.findMany({
					where: eq(taskAttributes.taskId, task.id)
				});
				return {
					...task,
					attributes: attributes.reduce(
						(acc, attr) => {
							acc[attr.key] = attr.value;
							return acc;
						},
						{} as Record<string, string>
					)
				};
			})
		);
	}

	// Get this week's tasks stats
	const weekStart = getWeekStartDate(currentYear, currentWeek);
	let weekTotalTasks = 0;
	let weekCompletedTasks = 0;

	for (let i = 0; i < 7; i++) {
		const date = new Date(weekStart);
		date.setDate(weekStart.getDate() + i);
		const dateStr = formatDate(date);

		const period = await db.query.timePeriods.findFirst({
			where: and(
				eq(timePeriods.userId, locals.user.id),
				eq(timePeriods.periodType, 'daily'),
				eq(timePeriods.day, dateStr)
			)
		});

		if (period) {
			const dayTasks = await db.query.tasks.findMany({
				where: eq(tasks.timePeriodId, period.id)
			});
			weekTotalTasks += dayTasks.length;
			weekCompletedTasks += dayTasks.filter((t) => t.completed).length;
		}
	}

	// Get yearly objectives with key results
	const yearlyObjectives = await db.query.objectives.findMany({
		where: and(
			eq(objectives.userId, locals.user.id),
			eq(objectives.level, 'yearly'),
			eq(objectives.year, currentYear)
		)
	});

	const objectivesWithKRs = await Promise.all(
		yearlyObjectives.map(async (obj) => {
			const krs = await db.query.keyResults.findMany({
				where: eq(keyResults.objectiveId, obj.id)
			});
			const avgScore =
				krs.length > 0 ? krs.reduce((sum, kr) => sum + kr.score * kr.weight, 0) / krs.reduce((sum, kr) => sum + kr.weight, 0) : 0;
			return {
				...obj,
				keyResults: krs,
				averageScore: avgScore
			};
		})
	);

	return {
		user: locals.user,
		today: {
			date: todayStr,
			tasks: todayTasks,
			completedCount: todayTasks.filter((t) => t.completed).length,
			totalCount: todayTasks.length
		},
		week: {
			year: currentYear,
			week: currentWeek,
			completedCount: weekCompletedTasks,
			totalCount: weekTotalTasks
		},
		objectives: objectivesWithKRs
	};
};
