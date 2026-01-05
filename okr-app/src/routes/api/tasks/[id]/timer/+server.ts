import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { tasks } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';

// POST /api/tasks/[id]/timer - Start or stop timer
export const POST: RequestHandler = async ({ locals, params, request }) => {
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
		const { action } = body; // 'start' or 'stop'

		if (action !== 'start' && action !== 'stop') {
			return json({ error: 'Invalid action. Use "start" or "stop"' }, { status: 400 });
		}

		const now = new Date();

		if (action === 'start') {
			// Start timer - set timerStartedAt
			if (existing.timerStartedAt) {
				return json({ error: 'Timer is already running' }, { status: 400 });
			}

			await db
				.update(tasks)
				.set({
					timerStartedAt: now,
					updatedAt: now
				})
				.where(eq(tasks.id, params.id));
		} else {
			// Stop timer - calculate elapsed time and add to timeSpentMs
			if (!existing.timerStartedAt) {
				return json({ error: 'Timer is not running' }, { status: 400 });
			}

			const elapsedMs = now.getTime() - existing.timerStartedAt.getTime();
			const newTimeSpentMs = (existing.timeSpentMs || 0) + elapsedMs;

			await db
				.update(tasks)
				.set({
					timeSpentMs: newTimeSpentMs,
					timerStartedAt: null,
					updatedAt: now
				})
				.where(eq(tasks.id, params.id));
		}

		// Return updated task
		const task = await db.query.tasks.findFirst({
			where: eq(tasks.id, params.id)
		});

		return json({ task });
	} catch (error) {
		console.error('Error toggling timer:', error);
		return json({ error: 'Failed to toggle timer' }, { status: 500 });
	}
};
