import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { savedQueries } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { executeQuery } from '$lib/server/query/executor';

// GET /api/queries/[id] - Get a single saved query
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const query = await db.query.savedQueries.findFirst({
		where: and(
			eq(savedQueries.id, params.id),
			eq(savedQueries.userId, locals.user.id)
		)
	});

	if (!query) {
		return json({ error: 'Query not found' }, { status: 404 });
	}

	return json({ query });
};

// PUT /api/queries/[id] - Update a saved query
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const existing = await db.query.savedQueries.findFirst({
		where: and(
			eq(savedQueries.id, params.id),
			eq(savedQueries.userId, locals.user.id)
		)
	});

	if (!existing) {
		return json({ error: 'Query not found' }, { status: 404 });
	}

	try {
		const body = await request.json();
		const { name, description, code } = body;

		const updates: Record<string, unknown> = {
			updatedAt: new Date()
		};

		if (name !== undefined) updates.name = name.trim();
		if (description !== undefined) updates.description = description?.trim() || null;
		if (code !== undefined) updates.code = code;

		await db.update(savedQueries).set(updates).where(eq(savedQueries.id, params.id));

		const query = await db.query.savedQueries.findFirst({
			where: eq(savedQueries.id, params.id)
		});

		return json({ query });
	} catch (error) {
		console.error('Error updating query:', error);
		return json({ error: 'Failed to update query' }, { status: 500 });
	}
};

// DELETE /api/queries/[id] - Delete a saved query
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const existing = await db.query.savedQueries.findFirst({
		where: and(
			eq(savedQueries.id, params.id),
			eq(savedQueries.userId, locals.user.id)
		)
	});

	if (!existing) {
		return json({ error: 'Query not found' }, { status: 404 });
	}

	await db.delete(savedQueries).where(eq(savedQueries.id, params.id));

	return json({ success: true });
};

// POST /api/queries/[id]/run - Run a saved query with params
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const query = await db.query.savedQueries.findFirst({
		where: and(
			eq(savedQueries.id, params.id),
			eq(savedQueries.userId, locals.user.id)
		)
	});

	if (!query) {
		return json({ error: 'Query not found' }, { status: 404 });
	}

	try {
		const body = await request.json().catch(() => ({}));
		const { params: queryParams } = body;

		const result = await executeQuery(query.code, locals.user.id, queryParams || {});

		if (result.error) {
			return json({ error: result.error }, { status: 400 });
		}

		return json({ result: result.result });
	} catch (error) {
		console.error('Error running query:', error);
		return json({ error: 'Failed to run query' }, { status: 500 });
	}
};
