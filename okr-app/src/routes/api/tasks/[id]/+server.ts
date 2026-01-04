import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { tasks, taskAttributes, taskTags } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// GET /api/tasks/[id] - Get a single task
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const task = await db.query.tasks.findFirst({
		where: and(eq(tasks.id, params.id), eq(tasks.userId, locals.user.id))
	});

	if (!task) {
		return json({ error: 'Task not found' }, { status: 404 });
	}

	const attributes = await db.query.taskAttributes.findMany({
		where: eq(taskAttributes.taskId, task.id)
	});

	const tags = await db.query.taskTags.findMany({
		where: eq(taskTags.taskId, task.id)
	});

	return json({
		task: {
			...task,
			attributes: attributes.reduce(
				(acc, attr) => {
					acc[attr.key] = attr.value;
					return acc;
				},
				{} as Record<string, string>
			),
			tagIds: tags.map((t) => t.tagId)
		}
	});
};

// PUT /api/tasks/[id] - Update a task
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const existing = await db.query.tasks.findFirst({
		where: and(eq(tasks.id, params.id), eq(tasks.userId, locals.user.id))
	});

	if (!existing) {
		return json({ error: 'Task not found' }, { status: 404 });
	}

	try {
		const body = await request.json();
		const { title, completed, sortOrder, attributes, tagIds } = body;

		const updates: Record<string, unknown> = {
			updatedAt: new Date()
		};

		if (title !== undefined) updates.title = title;
		if (completed !== undefined) {
			updates.completed = completed;
			updates.completedAt = completed ? new Date() : null;
		}
		if (sortOrder !== undefined) updates.sortOrder = sortOrder;

		await db.update(tasks).set(updates).where(eq(tasks.id, params.id));

		// Update attributes if provided
		if (attributes && typeof attributes === 'object') {
			// Delete existing attributes
			await db.delete(taskAttributes).where(eq(taskAttributes.taskId, params.id));

			// Insert new attributes
			for (const [key, value] of Object.entries(attributes)) {
				if (value !== null && value !== undefined) {
					await db.insert(taskAttributes).values({
						id: uuidv4(),
						taskId: params.id,
						key,
						value: String(value),
						valueType: typeof value === 'number' ? 'number' : 'text'
					});
				}
			}
		}

		// Update tags if provided
		if (tagIds !== undefined && Array.isArray(tagIds)) {
			// Delete existing tags
			await db.delete(taskTags).where(eq(taskTags.taskId, params.id));

			// Insert new tags
			for (const tagId of tagIds) {
				await db.insert(taskTags).values({
					taskId: params.id,
					tagId
				});
			}
		}

		// Return updated task
		const task = await db.query.tasks.findFirst({
			where: eq(tasks.id, params.id)
		});

		const attrs = await db.query.taskAttributes.findMany({
			where: eq(taskAttributes.taskId, params.id)
		});

		const tags = await db.query.taskTags.findMany({
			where: eq(taskTags.taskId, params.id)
		});

		return json({
			task: {
				...task,
				attributes: attrs.reduce(
					(acc, attr) => {
						acc[attr.key] = attr.value;
						return acc;
					},
					{} as Record<string, string>
				),
				tagIds: tags.map((t) => t.tagId)
			}
		});
	} catch (error) {
		console.error('Error updating task:', error);
		return json({ error: 'Failed to update task' }, { status: 500 });
	}
};

// PATCH /api/tasks/[id] - Toggle task completion
export const PATCH: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const existing = await db.query.tasks.findFirst({
		where: and(eq(tasks.id, params.id), eq(tasks.userId, locals.user.id))
	});

	if (!existing) {
		return json({ error: 'Task not found' }, { status: 404 });
	}

	const newCompleted = !existing.completed;

	await db
		.update(tasks)
		.set({
			completed: newCompleted,
			completedAt: newCompleted ? new Date() : null,
			updatedAt: new Date()
		})
		.where(eq(tasks.id, params.id));

	const task = await db.query.tasks.findFirst({
		where: eq(tasks.id, params.id)
	});

	return json({ task });
};

// DELETE /api/tasks/[id] - Delete a task
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const existing = await db.query.tasks.findFirst({
		where: and(eq(tasks.id, params.id), eq(tasks.userId, locals.user.id))
	});

	if (!existing) {
		return json({ error: 'Task not found' }, { status: 404 });
	}

	await db.delete(tasks).where(eq(tasks.id, params.id));

	return json({ success: true });
};
