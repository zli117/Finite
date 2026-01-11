import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { users, friendships, timePeriods, tasks, taskAttributes, objectives, keyResults, taskTags, tags } from '$lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
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

// Helper to verify friendship exists
async function verifyFriendship(userId: string, friendId: string) {
	return db.query.friendships.findFirst({
		where: or(
			and(eq(friendships.userId1, userId), eq(friendships.userId2, friendId)),
			and(eq(friendships.userId1, friendId), eq(friendships.userId2, userId))
		)
	});
}

// GET /api/friends/[friendId]/dashboard - Get friend's dashboard data
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const friendId = params.friendId;
		const userId = locals.user.id;

		// Verify friendship exists
		const friendship = await verifyFriendship(userId, friendId);
		if (!friendship) {
			return json({ error: 'Not friends with this user' }, { status: 403 });
		}

		// Get friend's user info
		const friend = await db.query.users.findFirst({
			where: eq(users.id, friendId)
		});

		if (!friend) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// Use friend's timezone and week settings
		const timezone = friend.timezone || 'UTC';
		const weekStartDay = friend.weekStartDay || 'monday';

		// Get today's date in the friend's timezone
		const todayStr = getTodayInTimezone(timezone);
		const today = getTodayDateInTimezone(timezone);
		const currentYear = getWeekYear(today, weekStartDay);
		const currentWeek = getWeekNumber(today, weekStartDay);
		const currentMonth = getCurrentMonthInTimezone(timezone);

		// Optional month parameter for monthly objectives
		const requestedMonth = url.searchParams.get('month');
		const monthForObjectives = requestedMonth ? parseInt(requestedMonth, 10) : currentMonth;

		// Get today's tasks for the friend
		const todayPeriod = await db.query.timePeriods.findFirst({
			where: and(
				eq(timePeriods.userId, friendId),
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

			// Get friend's tags for enriching task data
			const friendTags = await db.query.tags.findMany({
				where: eq(tags.userId, friendId)
			});

			todayTasks = await Promise.all(
				periodTasks.map(async (task) => {
					const attributes = await db.query.taskAttributes.findMany({
						where: eq(taskAttributes.taskId, task.id)
					});

					const taskTagLinks = await db.query.taskTags.findMany({
						where: eq(taskTags.taskId, task.id)
					});

					const taskTagIds = taskTagLinks.map((tt) => tt.tagId);
					const taskTagsData = friendTags.filter((t) => taskTagIds.includes(t.id));

					return {
						...task,
						attributes: attributes.reduce(
							(acc, attr) => {
								acc[attr.key] = attr.value;
								return acc;
							},
							{} as Record<string, string>
						),
						tags: taskTagsData
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
					eq(timePeriods.userId, friendId),
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
				eq(objectives.userId, friendId),
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

		// Get monthly objectives with key results
		const monthlyObjectives = await db.query.objectives.findMany({
			where: and(
				eq(objectives.userId, friendId),
				eq(objectives.level, 'monthly'),
				eq(objectives.year, currentYear),
				eq(objectives.month, monthForObjectives)
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

		return json({
			friend: {
				id: friend.id,
				username: friend.username
			},
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
			currentMonth: monthForObjectives,
			currentYear
		});
	} catch (error) {
		console.error('Error getting friend dashboard:', error);
		return json({ error: 'Failed to get friend dashboard' }, { status: 500 });
	}
};
