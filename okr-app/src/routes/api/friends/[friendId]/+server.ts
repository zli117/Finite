import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { friendships, friendNotes } from '$lib/db/schema';
import { eq, and, or } from 'drizzle-orm';

// DELETE /api/friends/[friendId] - Unfriend a user
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const friendId = params.friendId;
		const userId = locals.user.id;

		// Find the friendship (could be in either direction)
		const friendship = await db.query.friendships.findFirst({
			where: or(
				and(eq(friendships.userId1, userId), eq(friendships.userId2, friendId)),
				and(eq(friendships.userId1, friendId), eq(friendships.userId2, userId))
			)
		});

		if (!friendship) {
			return json({ error: 'Friendship not found' }, { status: 404 });
		}

		// Delete the friendship
		await db.delete(friendships).where(eq(friendships.id, friendship.id));

		// Optionally delete the notes (from both sides)
		await db.delete(friendNotes).where(
			or(
				and(eq(friendNotes.userId, userId), eq(friendNotes.friendId, friendId)),
				and(eq(friendNotes.userId, friendId), eq(friendNotes.friendId, userId))
			)
		);

		return json({ success: true });
	} catch (error) {
		console.error('Error unfriending user:', error);
		return json({ error: 'Failed to unfriend user' }, { status: 500 });
	}
};
