import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { tasks, taskAttributes, taskTags, timePeriods } from '$lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// GET /api/tasks - List tasks with filters
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const periodId = url.searchParams.get('periodId');
	const completed = url.searchParams.get('completed');

	const taskList = await db.query.tasks.findMany({
		where: (task, { eq, and }) => {
			const conditions = [eq(task.userId, locals.user!.id)];
			if (periodId) conditions.push(eq(task.timePeriodId, periodId));
			if (completed !== null) conditions.push(eq(task.completed, completed === 'true'));
			return and(...conditions);
		},
		orderBy: (task, { asc }) => [asc(task.sortOrder)]
	});

	// Get attributes for each task
	const tasksWithAttributes = await Promise.all(
		taskList.map(async (task) => {
			const attributes = await db.query.taskAttributes.findMany({
				where: eq(taskAttributes.taskId, task.id)
			});

			return {
				...task,
				attributes: attributes.reduce(
					(acc, attr) => {
						acc[attr.key] = attr.value;
						return acc;
					},
					{} as Record<string, string>
				)
			};
		})
	);

	return json({ tasks: tasksWithAttributes });
};

// POST /api/tasks - Create a new task
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { timePeriodId, title, attributes, tagIds } = body;

		// Validate required fields
		if (!timePeriodId || typeof timePeriodId !== 'string') {
			return json({ error: 'Time period ID is required' }, { status: 400 });
		}

		if (!title || typeof title !== 'string') {
			return json({ error: 'Title is required' }, { status: 400 });
		}

		// Verify time period belongs to user
		const period = await db.query.timePeriods.findFirst({
			where: and(eq(timePeriods.id, timePeriodId), eq(timePeriods.userId, locals.user.id))
		});

		if (!period) {
			return json({ error: 'Time period not found' }, { status: 404 });
		}

		// Get current max sort order
		const existingTasks = await db.query.tasks.findMany({
			where: eq(tasks.timePeriodId, timePeriodId)
		});
		const maxSortOrder = existingTasks.reduce((max, t) => Math.max(max, t.sortOrder), -1);

		const taskId = uuidv4();
		const now = new Date();

		await db.insert(tasks).values({
			id: taskId,
			userId: locals.user.id,
			timePeriodId,
			title,
			sortOrder: maxSortOrder + 1,
			createdAt: now,
			updatedAt: now
		});

		// Add attributes if provided
		if (attributes && typeof attributes === 'object') {
			for (const [key, value] of Object.entries(attributes)) {
				if (value !== null && value !== undefined) {
					await db.insert(taskAttributes).values({
						id: uuidv4(),
						taskId,
						key,
						value: String(value),
						valueType: typeof value === 'number' ? 'number' : 'text'
					});
				}
			}
		}

		// Add tags if provided
		if (tagIds && Array.isArray(tagIds)) {
			for (const tagId of tagIds) {
				await db.insert(taskTags).values({
					taskId,
					tagId
				});
			}
		}

		// Return the created task with attributes
		const task = await db.query.tasks.findFirst({
			where: eq(tasks.id, taskId)
		});

		const taskAttrs = await db.query.taskAttributes.findMany({
			where: eq(taskAttributes.taskId, taskId)
		});

		return json(
			{
				task: {
					...task,
					attributes: taskAttrs.reduce(
						(acc, attr) => {
							acc[attr.key] = attr.value;
							return acc;
						},
						{} as Record<string, string>
					)
				}
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Error creating task:', error);
		return json({ error: 'Failed to create task' }, { status: 500 });
	}
};
