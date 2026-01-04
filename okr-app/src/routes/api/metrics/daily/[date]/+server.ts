import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { timePeriods, dailyMetrics } from '$lib/db/schema';
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

// GET /api/metrics/daily/[date] - Get metrics for a specific date
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const dateStr = params.date;

	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		return json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
	}

	// Find the time period for this date
	const period = await db.query.timePeriods.findFirst({
		where: and(
			eq(timePeriods.userId, locals.user.id),
			eq(timePeriods.periodType, 'daily'),
			eq(timePeriods.day, dateStr)
		)
	});

	if (!period) {
		return json({ metrics: null });
	}

	const metrics = await db.query.dailyMetrics.findFirst({
		where: and(eq(dailyMetrics.timePeriodId, period.id), eq(dailyMetrics.userId, locals.user.id))
	});

	return json({ metrics });
};

// PUT /api/metrics/daily/[date] - Update or create metrics for a specific date
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const dateStr = params.date;

	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		return json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
	}

	try {
		const body = await request.json();
		const {
			previousNightBedTime,
			wakeUpTime,
			sleepLength,
			cardioLoad,
			fitbitReadiness,
			steps,
			heartPoints,
			restingHeartRate,
			customMetrics
		} = body;

		// Find or create the time period for this date
		let period = await db.query.timePeriods.findFirst({
			where: and(
				eq(timePeriods.userId, locals.user.id),
				eq(timePeriods.periodType, 'daily'),
				eq(timePeriods.day, dateStr)
			)
		});

		if (!period) {
			// Create the period
			const date = new Date(dateStr);
			const periodId = uuidv4();
			const now = new Date();

			await db.insert(timePeriods).values({
				id: periodId,
				userId: locals.user.id,
				periodType: 'daily',
				year: date.getFullYear(),
				month: date.getMonth() + 1,
				week: getWeekNumber(date),
				day: dateStr,
				createdAt: now,
				updatedAt: now
			});

			period = await db.query.timePeriods.findFirst({
				where: eq(timePeriods.id, periodId)
			});
		}

		if (!period) {
			return json({ error: 'Failed to create time period' }, { status: 500 });
		}

		// Check if metrics already exist
		const existing = await db.query.dailyMetrics.findFirst({
			where: and(
				eq(dailyMetrics.timePeriodId, period.id),
				eq(dailyMetrics.userId, locals.user.id)
			)
		});

		if (existing) {
			// Update existing metrics
			await db
				.update(dailyMetrics)
				.set({
					previousNightBedTime:
						previousNightBedTime !== undefined
							? previousNightBedTime
							: existing.previousNightBedTime,
					wakeUpTime: wakeUpTime !== undefined ? wakeUpTime : existing.wakeUpTime,
					sleepLength: sleepLength !== undefined ? sleepLength : existing.sleepLength,
					cardioLoad: cardioLoad !== undefined ? cardioLoad : existing.cardioLoad,
					fitbitReadiness:
						fitbitReadiness !== undefined ? fitbitReadiness : existing.fitbitReadiness,
					steps: steps !== undefined ? steps : existing.steps,
					heartPoints: heartPoints !== undefined ? heartPoints : existing.heartPoints,
					restingHeartRate:
						restingHeartRate !== undefined ? restingHeartRate : existing.restingHeartRate,
					customMetrics:
						customMetrics !== undefined
							? JSON.stringify(customMetrics)
							: existing.customMetrics
				})
				.where(eq(dailyMetrics.id, existing.id));

			const updated = await db.query.dailyMetrics.findFirst({
				where: eq(dailyMetrics.id, existing.id)
			});

			return json({ metrics: updated });
		} else {
			// Create new metrics
			const metricsId = uuidv4();

			await db.insert(dailyMetrics).values({
				id: metricsId,
				userId: locals.user.id,
				timePeriodId: period.id,
				previousNightBedTime: previousNightBedTime || null,
				wakeUpTime: wakeUpTime || null,
				sleepLength: sleepLength || null,
				cardioLoad: cardioLoad || null,
				fitbitReadiness: fitbitReadiness || null,
				steps: steps || null,
				heartPoints: heartPoints || null,
				restingHeartRate: restingHeartRate || null,
				customMetrics: customMetrics ? JSON.stringify(customMetrics) : null
			});

			const metrics = await db.query.dailyMetrics.findFirst({
				where: eq(dailyMetrics.id, metricsId)
			});

			return json({ metrics }, { status: 201 });
		}
	} catch (error) {
		console.error('Error updating metrics:', error);
		return json({ error: 'Failed to update metrics' }, { status: 500 });
	}
};
