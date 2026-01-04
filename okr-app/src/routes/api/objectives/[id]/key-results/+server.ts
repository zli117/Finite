import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { objectives, keyResults } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// GET /api/objectives/[id]/key-results - List all key results for an objective
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Verify objective belongs to user
	const objective = await db.query.objectives.findFirst({
		where: and(eq(objectives.id, params.id), eq(objectives.userId, locals.user.id))
	});

	if (!objective) {
		return json({ error: 'Objective not found' }, { status: 404 });
	}

	const krs = await db.query.keyResults.findMany({
		where: eq(keyResults.objectiveId, params.id),
		orderBy: (kr, { asc }) => [asc(kr.sortOrder)]
	});

	return json({ keyResults: krs });
};

// POST /api/objectives/[id]/key-results - Create a new key result
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Verify objective belongs to user
	const objective = await db.query.objectives.findFirst({
		where: and(eq(objectives.id, params.id), eq(objectives.userId, locals.user.id))
	});

	if (!objective) {
		return json({ error: 'Objective not found' }, { status: 404 });
	}

	try {
		const body = await request.json();
		const { title, weight, score, expectedHours, sortOrder } = body;

		if (!title || typeof title !== 'string') {
			return json({ error: 'Title is required' }, { status: 400 });
		}

		// Get the current max sort order
		const existing = await db.query.keyResults.findMany({
			where: eq(keyResults.objectiveId, params.id)
		});
		const maxSortOrder = existing.reduce((max, kr) => Math.max(max, kr.sortOrder), -1);

		const id = uuidv4();
		const now = new Date();

		await db.insert(keyResults).values({
			id,
			objectiveId: params.id,
			title,
			weight: weight ?? 1.0,
			score: score ?? 0,
			expectedHours: expectedHours ?? 0,
			sortOrder: sortOrder ?? maxSortOrder + 1,
			createdAt: now,
			updatedAt: now
		});

		const keyResult = await db.query.keyResults.findFirst({
			where: eq(keyResults.id, id)
		});

		return json({ keyResult }, { status: 201 });
	} catch (error) {
		console.error('Error creating key result:', error);
		return json({ error: 'Failed to create key result' }, { status: 500 });
	}
};
