import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { objectives, keyResults } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));
	const level = (url.searchParams.get('level') as 'yearly' | 'monthly') || 'yearly';

	// Get objectives for the selected year and level
	const userObjectives = await db.query.objectives.findMany({
		where: and(
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

	return {
		year,
		level,
		objectives: objectivesWithKRs,
		overallScore,
		years: [2024, 2025, 2026] // Available years to select
	};
};
