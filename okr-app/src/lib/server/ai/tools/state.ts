/**
 * Build a compact, page-aware state snapshot to embed in the system prompt.
 * Tells the model "where the user is" so it can disambiguate "this week",
 * "today", "the current objective" without an extra tool call.
 */

import { db } from '$lib/db/client';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import {
	getTodayInTimezone,
	getCurrentYearInTimezone,
	getWeekNumber,
	getWeekYear,
	type WeekStartDay
} from '$lib/utils/week';

export interface PageContext {
	route?: string;
	year?: number;
	month?: number;
	week?: number;
	day?: string;
}

export async function buildStateSnapshot(userId: string, page: PageContext): Promise<string> {
	const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
	const timezone = user?.timezone || 'UTC';
	const weekStartDay = (user?.weekStartDay || 'monday') as WeekStartDay;

	const today = getTodayInTimezone(timezone);
	const todayDate = new Date(`${today}T00:00:00Z`);
	const currentYear = getCurrentYearInTimezone(timezone);
	const currentWeek = getWeekNumber(todayDate, weekStartDay);
	const currentWeekYear = getWeekYear(todayDate, weekStartDay);

	const lines = [
		`- Today: ${today} (${timezone}, week-start: ${weekStartDay})`,
		`- Current year: ${currentYear}`,
		`- Current week: ${currentWeekYear}-W${currentWeek}`
	];

	if (page.route) lines.push(`- User is viewing: ${page.route}`);
	if (page.day) lines.push(`- Page day: ${page.day}`);
	if (page.year !== undefined) {
		let span = String(page.year);
		if (page.month) span += `-${String(page.month).padStart(2, '0')}`;
		if (page.week) span += `-W${page.week}`;
		lines.push(`- Page period: ${span}`);
	}

	return `## Current State\n\n${lines.join('\n')}`;
}

export async function getUserToolContext(userId: string) {
	const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
	return {
		userId,
		timezone: user?.timezone || 'UTC',
		weekStartDay: (user?.weekStartDay || 'monday') as WeekStartDay
	};
}
