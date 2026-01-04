import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { objectives, keyResults } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';

// PUT /api/objectives/[id]/key-results/[krId] - Update a key result
export const PUT: RequestHandler = async ({ locals, params, request }) => {
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

	// Verify key result exists and belongs to objective
	const existing = await db.query.keyResults.findFirst({
		where: and(eq(keyResults.id, params.krId), eq(keyResults.objectiveId, params.id))
	});

	if (!existing) {
		return json({ error: 'Key result not found' }, { status: 404 });
	}

	try {
		const body = await request.json();
		const { title, weight, score, expectedHours, sortOrder } = body;

		const updates: Record<string, unknown> = {
			updatedAt: new Date()
		};

		if (title !== undefined) updates.title = title;
		if (weight !== undefined) updates.weight = weight;
		if (score !== undefined) {
			// Validate score is between 0 and 1
			if (typeof score !== 'number' || score < 0 || score > 1) {
				return json({ error: 'Score must be between 0 and 1' }, { status: 400 });
			}
			updates.score = score;
		}
		if (expectedHours !== undefined) updates.expectedHours = expectedHours;
		if (sortOrder !== undefined) updates.sortOrder = sortOrder;

		await db.update(keyResults).set(updates).where(eq(keyResults.id, params.krId));

		const updated = await db.query.keyResults.findFirst({
			where: eq(keyResults.id, params.krId)
		});

		return json({ keyResult: updated });
	} catch (error) {
		console.error('Error updating key result:', error);
		return json({ error: 'Failed to update key result' }, { status: 500 });
	}
};

// DELETE /api/objectives/[id]/key-results/[krId] - Delete a key result
export const DELETE: RequestHandler = async ({ locals, params }) => {
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

	// Verify key result exists
	const existing = await db.query.keyResults.findFirst({
		where: and(eq(keyResults.id, params.krId), eq(keyResults.objectiveId, params.id))
	});

	if (!existing) {
		return json({ error: 'Key result not found' }, { status: 404 });
	}

	await db.delete(keyResults).where(eq(keyResults.id, params.krId));

	return json({ success: true });
};
