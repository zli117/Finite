import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { objectives, keyResults } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// GET /api/objectives - List all objectives for the current user
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const year = url.searchParams.get('year');
	const level = url.searchParams.get('level');
	const month = url.searchParams.get('month');

	let query = db.query.objectives.findMany({
		where: (obj, { eq, and }) => {
			const conditions = [eq(obj.userId, locals.user!.id)];
			if (year) conditions.push(eq(obj.year, parseInt(year)));
			if (level) conditions.push(eq(obj.level, level as 'yearly' | 'monthly'));
			if (month) conditions.push(eq(obj.month, parseInt(month)));
			return and(...conditions);
		},
		with: {
			// We'll add relations later
		},
		orderBy: (obj, { asc }) => [asc(obj.year), asc(obj.month)]
	});

	const result = await query;
	return json({ objectives: result });
};

// POST /api/objectives - Create a new objective
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { title, description, level, year, month, weight, parentId, category } = body;

		// Validate required fields
		if (!title || typeof title !== 'string') {
			return json({ error: 'Title is required' }, { status: 400 });
		}

		if (!level || !['yearly', 'monthly'].includes(level)) {
			return json({ error: 'Level must be "yearly" or "monthly"' }, { status: 400 });
		}

		if (!year || typeof year !== 'number') {
			return json({ error: 'Year is required' }, { status: 400 });
		}

		if (level === 'monthly' && (month === undefined || month < 1 || month > 12)) {
			return json({ error: 'Month (1-12) is required for monthly objectives' }, { status: 400 });
		}

		const id = uuidv4();
		const now = new Date();

		await db.insert(objectives).values({
			id,
			userId: locals.user.id,
			title,
			description: description || null,
			level,
			year,
			month: level === 'monthly' ? month : null,
			weight: weight ?? 1.0,
			parentId: parentId || null,
			category: category || null,
			createdAt: now,
			updatedAt: now
		});

		const objective = await db.query.objectives.findFirst({
			where: eq(objectives.id, id)
		});

		return json({ objective }, { status: 201 });
	} catch (error) {
		console.error('Error creating objective:', error);
		return json({ error: 'Failed to create objective' }, { status: 500 });
	}
};
