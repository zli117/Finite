import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { objectives } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';

// GET /api/objectives/[id] - Get a single objective
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const objective = await db.query.objectives.findFirst({
		where: and(eq(objectives.id, params.id), eq(objectives.userId, locals.user.id))
	});

	if (!objective) {
		return json({ error: 'Objective not found' }, { status: 404 });
	}

	return json({ objective });
};

// PUT /api/objectives/[id] - Update an objective
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Check if objective exists and belongs to user
	const existing = await db.query.objectives.findFirst({
		where: and(eq(objectives.id, params.id), eq(objectives.userId, locals.user.id))
	});

	if (!existing) {
		return json({ error: 'Objective not found' }, { status: 404 });
	}

	try {
		const body = await request.json();
		const { title, description, weight, parentId, category } = body;

		const updates: Partial<typeof existing> = {
			updatedAt: new Date()
		};

		if (title !== undefined) updates.title = title;
		if (description !== undefined) updates.description = description;
		if (weight !== undefined) updates.weight = weight;
		if (parentId !== undefined) updates.parentId = parentId;
		if (category !== undefined) updates.category = category;

		await db
			.update(objectives)
			.set(updates)
			.where(and(eq(objectives.id, params.id), eq(objectives.userId, locals.user.id)));

		const updated = await db.query.objectives.findFirst({
			where: eq(objectives.id, params.id)
		});

		return json({ objective: updated });
	} catch (error) {
		console.error('Error updating objective:', error);
		return json({ error: 'Failed to update objective' }, { status: 500 });
	}
};

// DELETE /api/objectives/[id] - Delete an objective
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Check if objective exists and belongs to user
	const existing = await db.query.objectives.findFirst({
		where: and(eq(objectives.id, params.id), eq(objectives.userId, locals.user.id))
	});

	if (!existing) {
		return json({ error: 'Objective not found' }, { status: 404 });
	}

	await db
		.delete(objectives)
		.where(and(eq(objectives.id, params.id), eq(objectives.userId, locals.user.id)));

	return json({ success: true });
};
