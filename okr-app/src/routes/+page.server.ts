import type { PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { timePeriods, tasks, taskAttributes, objectives, keyResults } from '$lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import {
	getWeekNumber,
	getWeekStartDate,
	getWeekYear,
	formatDate,
	addDays,
	getTodayInTimezone,
	getTodayDateInTimezone,
	getCurrentMonthInTimezone
} from '$lib/utils/week';

export const load: PageServerLoad = async ({ locals, depends }) => {
	// Register dependencies for invalidation
	depends('data:dashboard');
	depends('data:tasks');
	depends('data:objectives');

	if (!locals.user) {
		return { user: null };
	}

	const timezone = locals.user.timezone || 'UTC';
	const weekStartDay = locals.user.weekStartDay || 'monday';

	// Get today's date in the user's timezone
	const todayStr = getTodayInTimezone(timezone);
	const today = getTodayDateInTimezone(timezone);
	const currentYear = getWeekYear(today, weekStartDay);
	const currentWeek = getWeekNumber(today, weekStartDay);
	const currentMonth = getCurrentMonthInTimezone(timezone);

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
	const weekStart = getWeekStartDate(currentYear, currentWeek, weekStartDay);
	let weekTotalTasks = 0;
	let weekCompletedTasks = 0;

	for (let i = 0; i < 7; i++) {
		const date = addDays(weekStart, i);
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

	const yearlyObjectivesWithKRs = await Promise.all(
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

	// Get monthly objectives with key results for current month
	const monthlyObjectives = await db.query.objectives.findMany({
		where: and(
			eq(objectives.userId, locals.user.id),
			eq(objectives.level, 'monthly'),
			eq(objectives.year, currentYear),
			eq(objectives.month, currentMonth)
		)
	});

	const monthlyObjectivesWithKRs = await Promise.all(
		monthlyObjectives.map(async (obj) => {
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
		yearlyObjectives: yearlyObjectivesWithKRs,
		monthlyObjectives: monthlyObjectivesWithKRs,
		currentMonth,
		currentYear
	};
};
