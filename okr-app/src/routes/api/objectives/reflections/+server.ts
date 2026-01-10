import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { objectiveReflections } from '$lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { broadcastDataChange } from '$lib/server/events';

// GET /api/objectives/reflections?level=yearly&year=2025&month=1
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const level = url.searchParams.get('level') as 'yearly' | 'monthly';
	const year = parseInt(url.searchParams.get('year') || '');
	const month = url.searchParams.get('month') ? parseInt(url.searchParams.get('month')!) : null;

	if (!level || !year || (level === 'monthly' && !month)) {
		return json({ error: 'Missing required parameters' }, { status: 400 });
	}

	const reflection = await db.query.objectiveReflections.findFirst({
		where: and(
			eq(objectiveReflections.userId, locals.user.id),
			eq(objectiveReflections.level, level),
			eq(objectiveReflections.year, year),
			level === 'monthly' && month !== null
				? eq(objectiveReflections.month, month)
				: isNull(objectiveReflections.month)
		)
	});

	return json({ reflection: reflection?.reflection || '' });
};

// PUT /api/objectives/reflections
export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { level, year, month, reflection } = await request.json();

		if (!level || !year || typeof reflection !== 'string') {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		if (level === 'monthly' && !month) {
			return json({ error: 'Month is required for monthly reflections' }, { status: 400 });
		}

		// Check if reflection already exists
		const existing = await db.query.objectiveReflections.findFirst({
			where: and(
				eq(objectiveReflections.userId, locals.user.id),
				eq(objectiveReflections.level, level),
				eq(objectiveReflections.year, year),
				level === 'monthly' && month
					? eq(objectiveReflections.month, month)
					: isNull(objectiveReflections.month)
			)
		});

		const now = new Date();

		if (existing) {
			// Update existing
			await db
				.update(objectiveReflections)
				.set({ reflection, updatedAt: now })
				.where(eq(objectiveReflections.id, existing.id));
		} else {
			// Create new
			await db.insert(objectiveReflections).values({
				id: uuidv4(),
				userId: locals.user.id,
				level,
				year,
				month: level === 'monthly' ? month : null,
				reflection,
				createdAt: now,
				updatedAt: now
			});
		}

		// Broadcast change to other connected clients
		broadcastDataChange(locals.user.id, 'data:objectives');

		return json({ success: true });
	} catch (error) {
		console.error('Error saving reflection:', error);
		return json({ error: 'Failed to save reflection' }, { status: 500 });
	}
};
