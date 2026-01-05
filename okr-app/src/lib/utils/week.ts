/**
 * Week calculation utilities that support both Sunday-first and Monday-first weeks
 * Also includes timezone-aware date utilities
 */

export type WeekStartDay = 'sunday' | 'monday';

/**
 * Get the current date string (YYYY-MM-DD) in a specific timezone
 */
export function getTodayInTimezone(timezone: string = 'UTC'): string {
	const now = new Date();
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});
	return formatter.format(now); // Returns YYYY-MM-DD format
}

/**
 * Get a Date object representing the start of today in a specific timezone
 * The returned Date is in UTC but represents midnight in the specified timezone
 */
export function getTodayDateInTimezone(timezone: string = 'UTC'): Date {
	const dateStr = getTodayInTimezone(timezone);
	// Parse as UTC to avoid local timezone issues
	const [year, month, day] = dateStr.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Get the current year in a specific timezone
 */
export function getCurrentYearInTimezone(timezone: string = 'UTC'): number {
	const now = new Date();
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		year: 'numeric'
	});
	return parseInt(formatter.format(now), 10);
}

/**
 * Get the current month (1-12) in a specific timezone
 */
export function getCurrentMonthInTimezone(timezone: string = 'UTC'): number {
	const now = new Date();
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		month: 'numeric'
	});
	return parseInt(formatter.format(now), 10);
}

/**
 * Get the ISO week number (Monday-first, week 1 contains Jan 4)
 */
function getISOWeekNumber(date: Date): number {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7; // Convert Sunday (0) to 7
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Get the US week number (Sunday-first, week 1 contains Jan 1)
 */
function getUSWeekNumber(date: Date): number {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	const yearStartDay = yearStart.getUTCDay(); // 0 = Sunday

	// Calculate days since the start of week 1
	// Week 1 starts on the Sunday of the week containing Jan 1
	const firstSunday = new Date(yearStart);
	firstSunday.setUTCDate(yearStart.getUTCDate() - yearStartDay);

	const daysSinceFirstSunday = Math.floor((d.getTime() - firstSunday.getTime()) / 86400000);
	return Math.floor(daysSinceFirstSunday / 7) + 1;
}

/**
 * Get the week number for a date based on the week start day preference
 */
export function getWeekNumber(date: Date, weekStartDay: WeekStartDay = 'monday'): number {
	if (weekStartDay === 'sunday') {
		return getUSWeekNumber(date);
	}
	return getISOWeekNumber(date);
}

/**
 * Get the start date of a week (Monday-first, ISO standard)
 */
function getISOWeekStartDate(year: number, week: number): Date {
	// Jan 4 is always in week 1 of the ISO year
	const jan4 = new Date(Date.UTC(year, 0, 4));
	const dayOfWeek = jan4.getUTCDay() || 7;
	const monday = new Date(jan4);
	monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
	monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
	return monday;
}

/**
 * Get the start date of a week (Sunday-first, US standard)
 */
function getUSWeekStartDate(year: number, week: number): Date {
	const jan1 = new Date(Date.UTC(year, 0, 1));
	const jan1Day = jan1.getUTCDay(); // 0 = Sunday

	// Find the Sunday of week 1 (which contains Jan 1)
	const firstSunday = new Date(jan1);
	firstSunday.setUTCDate(jan1.getUTCDate() - jan1Day);

	// Add weeks
	const weekStart = new Date(firstSunday);
	weekStart.setUTCDate(firstSunday.getUTCDate() + (week - 1) * 7);
	return weekStart;
}

/**
 * Get the start date of a week based on the week start day preference
 */
export function getWeekStartDate(year: number, week: number, weekStartDay: WeekStartDay = 'monday'): Date {
	if (weekStartDay === 'sunday') {
		return getUSWeekStartDate(year, week);
	}
	return getISOWeekStartDate(year, week);
}

/**
 * Get the year that a week belongs to (handles year boundaries)
 * For ISO weeks, this might differ from the calendar year
 */
export function getWeekYear(date: Date, weekStartDay: WeekStartDay = 'monday'): number {
	if (weekStartDay === 'monday') {
		// ISO week-year logic
		const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
		const dayNum = d.getUTCDay() || 7;
		d.setUTCDate(d.getUTCDate() + 4 - dayNum);
		return d.getUTCFullYear();
	}
	// US weeks just use the calendar year
	return date.getFullYear();
}

/**
 * Format date as YYYY-MM-DD (uses UTC to avoid timezone issues)
 */
export function formatDate(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Add days to a UTC date
 */
export function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setUTCDate(result.getUTCDate() + days);
	return result;
}

/**
 * Get day name from UTC date
 */
export function getDayName(date: Date): string {
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	return dayNames[date.getUTCDay()];
}
