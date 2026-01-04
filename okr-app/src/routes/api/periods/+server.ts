import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { timePeriods, tasks, dailyMetrics } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// GET /api/periods - List time periods
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const periodType = url.searchParams.get('type');
	const year = url.searchParams.get('year');
	const month = url.searchParams.get('month');
	const week = url.searchParams.get('week');

	const periods = await db.query.timePeriods.findMany({
		where: (period, { eq, and }) => {
			const conditions = [eq(period.userId, locals.user!.id)];
			if (periodType) conditions.push(eq(period.periodType, periodType as any));
			if (year) conditions.push(eq(period.year, parseInt(year)));
			if (month) conditions.push(eq(period.month, parseInt(month)));
			if (week) conditions.push(eq(period.week, parseInt(week)));
			return and(...conditions);
		},
		orderBy: (period, { desc }) => [desc(period.year), desc(period.month), desc(period.week)]
	});

	return json({ periods });
};

// POST /api/periods - Create or get a time period
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { periodType, year, month, week, day } = body;

		// Validate required fields
		if (!periodType || !['yearly', 'monthly', 'weekly', 'daily'].includes(periodType)) {
			return json({ error: 'Valid period type is required' }, { status: 400 });
		}

		if (!year || typeof year !== 'number') {
			return json({ error: 'Year is required' }, { status: 400 });
		}

		// Validate based on period type
		if (periodType === 'monthly' && (month === undefined || month < 1 || month > 12)) {
			return json({ error: 'Month (1-12) is required for monthly periods' }, { status: 400 });
		}

		if (periodType === 'weekly' && (week === undefined || week < 1 || week > 53)) {
			return json({ error: 'Week (1-53) is required for weekly periods' }, { status: 400 });
		}

		if (periodType === 'daily' && !day) {
			return json({ error: 'Day (ISO date) is required for daily periods' }, { status: 400 });
		}

		// Check if period already exists
		const existing = await db.query.timePeriods.findFirst({
			where: and(
				eq(timePeriods.userId, locals.user.id),
				eq(timePeriods.periodType, periodType),
				eq(timePeriods.year, year),
				periodType === 'monthly' || periodType === 'weekly' || periodType === 'daily'
					? eq(timePeriods.month, month ?? null)
					: undefined,
				periodType === 'weekly' || periodType === 'daily'
					? eq(timePeriods.week, week ?? null)
					: undefined,
				periodType === 'daily' ? eq(timePeriods.day, day) : undefined
			)
		});

		if (existing) {
			return json({ period: existing, created: false });
		}

		// Create new period
		const id = uuidv4();
		const now = new Date();

		await db.insert(timePeriods).values({
			id,
			userId: locals.user.id,
			periodType,
			year,
			month: periodType !== 'yearly' ? month : null,
			week: periodType === 'weekly' || periodType === 'daily' ? week : null,
			day: periodType === 'daily' ? day : null,
			createdAt: now,
			updatedAt: now
		});

		const period = await db.query.timePeriods.findFirst({
			where: eq(timePeriods.id, id)
		});

		return json({ period, created: true }, { status: 201 });
	} catch (error) {
		console.error('Error creating time period:', error);
		return json({ error: 'Failed to create time period' }, { status: 500 });
	}
};
