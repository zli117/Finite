import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { tags } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// GET /api/tags - List all tags for the current user
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userTags = await db.query.tags.findMany({
		where: eq(tags.userId, locals.user.id),
		orderBy: (tag, { asc }) => [asc(tag.category), asc(tag.name)]
	});

	return json({ tags: userTags });
};

// POST /api/tags - Create a new tag
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { name, color, category } = body;

		if (!name || typeof name !== 'string') {
			return json({ error: 'Name is required' }, { status: 400 });
		}

		// Check if tag already exists
		const existing = await db.query.tags.findFirst({
			where: (tag, { eq, and }) =>
				and(eq(tag.userId, locals.user!.id), eq(tag.name, name.trim()))
		});

		if (existing) {
			return json({ error: 'Tag already exists' }, { status: 409 });
		}

		const id = uuidv4();

		await db.insert(tags).values({
			id,
			userId: locals.user.id,
			name: name.trim(),
			color: color || null,
			category: category || null
		});

		const tag = await db.query.tags.findFirst({
			where: eq(tags.id, id)
		});

		return json({ tag }, { status: 201 });
	} catch (error) {
		console.error('Error creating tag:', error);
		return json({ error: 'Failed to create tag' }, { status: 500 });
	}
};
