import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { friendships, friendNotes } from '$lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// Helper to verify friendship exists
async function verifyFriendship(userId: string, friendId: string) {
	return db.query.friendships.findFirst({
		where: or(
			and(eq(friendships.userId1, userId), eq(friendships.userId2, friendId)),
			and(eq(friendships.userId1, friendId), eq(friendships.userId2, userId))
		)
	});
}

// GET /api/friends/[friendId]/notes - Get private notes about a friend
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const friendId = params.friendId;
		const userId = locals.user.id;

		// Verify friendship exists
		const friendship = await verifyFriendship(userId, friendId);
		if (!friendship) {
			return json({ error: 'Not friends with this user' }, { status: 403 });
		}

		// Get the note
		const note = await db.query.friendNotes.findFirst({
			where: and(eq(friendNotes.userId, userId), eq(friendNotes.friendId, friendId))
		});

		return json({ note: note?.note || '' });
	} catch (error) {
		console.error('Error getting friend notes:', error);
		return json({ error: 'Failed to get notes' }, { status: 500 });
	}
};

// PUT /api/friends/[friendId]/notes - Update private notes about a friend
export const PUT: RequestHandler = async ({ locals, request, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { note } = body;
		const friendId = params.friendId;
		const userId = locals.user.id;

		if (typeof note !== 'string') {
			return json({ error: 'Note must be a string' }, { status: 400 });
		}

		// Verify friendship exists
		const friendship = await verifyFriendship(userId, friendId);
		if (!friendship) {
			return json({ error: 'Not friends with this user' }, { status: 403 });
		}

		const now = new Date();

		// Check if note already exists
		const existingNote = await db.query.friendNotes.findFirst({
			where: and(eq(friendNotes.userId, userId), eq(friendNotes.friendId, friendId))
		});

		if (existingNote) {
			// Update existing note
			await db
				.update(friendNotes)
				.set({ note, updatedAt: now })
				.where(eq(friendNotes.id, existingNote.id));
		} else {
			// Create new note
			await db.insert(friendNotes).values({
				id: uuidv4(),
				userId,
				friendId,
				note,
				updatedAt: now
			});
		}

		return json({ note, updatedAt: now });
	} catch (error) {
		console.error('Error updating friend notes:', error);
		return json({ error: 'Failed to update notes' }, { status: 500 });
	}
};
