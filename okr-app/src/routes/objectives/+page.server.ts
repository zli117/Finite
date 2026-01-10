import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { objectives, keyResults, savedQueries, objectiveReflections } from '$lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	// Register dependency for invalidation
	depends('data:objectives');

	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));
	const level = (url.searchParams.get('level') as 'yearly' | 'monthly') || 'yearly';
	const month = level === 'monthly'
		? parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1))
		: null;

	// Get objectives for the selected year and level (and month if monthly)
	const userObjectives = await db.query.objectives.findMany({
		where: level === 'monthly' && month
			? and(
				eq(objectives.userId, locals.user.id),
				eq(objectives.year, year),
				eq(objectives.level, level),
				eq(objectives.month, month)
			)
			: and(
				eq(objectives.userId, locals.user.id),
				eq(objectives.year, year),
				eq(objectives.level, level)
			)
	});

	// Get key results for each objective
	const objectivesWithKRs = await Promise.all(
		userObjectives.map(async (obj) => {
			const krs = await db.query.keyResults.findMany({
				where: eq(keyResults.objectiveId, obj.id)
			});

			// Calculate weighted average score
			const totalWeight = krs.reduce((sum, kr) => sum + kr.weight, 0);
			const avgScore = totalWeight > 0
				? krs.reduce((sum, kr) => sum + kr.score * kr.weight, 0) / totalWeight
				: 0;

			return {
				...obj,
				keyResults: krs,
				averageScore: avgScore
			};
		})
	);

	// Calculate overall score for the year
	const totalWeight = objectivesWithKRs.reduce((sum, obj) => sum + obj.weight, 0);
	const overallScore = totalWeight > 0
		? objectivesWithKRs.reduce((sum, obj) => sum + obj.averageScore * obj.weight, 0) / totalWeight
		: 0;

	// Get all saved queries for the progress query selector
	const allSavedQueries = await db.query.savedQueries.findMany({
		where: eq(savedQueries.userId, locals.user.id)
	});

	// Get distinct years that have objectives for this user
	const yearsResult = await db
		.selectDistinct({ year: objectives.year })
		.from(objectives)
		.where(eq(objectives.userId, locals.user.id))
		.orderBy(objectives.year);

	const currentYear = new Date().getFullYear();
	let availableYears = yearsResult.map(r => r.year);

	// If no years found, default to current year
	if (availableYears.length === 0) {
		availableYears = [currentYear];
	}
	// If current year not in list and we're viewing it, add it
	else if (!availableYears.includes(year)) {
		availableYears = [...availableYears, year].sort((a, b) => a - b);
	}

	// Get reflection for current year/level/month
	const reflection = await db.query.objectiveReflections.findFirst({
		where: and(
			eq(objectiveReflections.userId, locals.user.id),
			eq(objectiveReflections.level, level),
			eq(objectiveReflections.year, year),
			level === 'monthly' && month
				? eq(objectiveReflections.month, month)
				: isNull(objectiveReflections.month)
		)
	});

	return {
		year,
		level,
		month,
		objectives: objectivesWithKRs,
		overallScore,
		years: availableYears,
		savedQueries: allSavedQueries.map(q => ({ id: q.id, name: q.name, code: q.code })),
		reflection: reflection?.reflection || ''
	};
};
