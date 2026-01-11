import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { users, friendRequests, friendships } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// POST /api/friends/requests/[id] - Accept or decline a friend request
export const POST: RequestHandler = async ({ locals, request, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { action } = body;
		const requestId = params.id;
		const userId = locals.user.id;

		if (!action || !['accept', 'decline'].includes(action)) {
			return json({ error: 'Invalid action. Must be "accept" or "decline"' }, { status: 400 });
		}

		// Find the request - must be sent TO this user and be pending
		const friendRequest = await db.query.friendRequests.findFirst({
			where: and(eq(friendRequests.id, requestId), eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending'))
		});

		if (!friendRequest) {
			return json({ error: 'Friend request not found or already processed' }, { status: 404 });
		}

		const now = new Date();

		if (action === 'decline') {
			// Update request status to declined
			await db
				.update(friendRequests)
				.set({ status: 'declined', respondedAt: now })
				.where(eq(friendRequests.id, requestId));

			return json({ success: true, status: 'declined' });
		}

		// Accept: Update request and create friendship
		await db
			.update(friendRequests)
			.set({ status: 'accepted', respondedAt: now })
			.where(eq(friendRequests.id, requestId));

		// Create friendship (ensure userId1 < userId2 for consistency)
		const [id1, id2] =
			friendRequest.fromUserId < userId
				? [friendRequest.fromUserId, userId]
				: [userId, friendRequest.fromUserId];

		const friendshipId = uuidv4();
		await db.insert(friendships).values({
			id: friendshipId,
			userId1: id1,
			userId2: id2,
			createdAt: now
		});

		// Get friend info
		const friend = await db.query.users.findFirst({
			where: eq(users.id, friendRequest.fromUserId),
			columns: { id: true, username: true }
		});

		return json({
			success: true,
			status: 'accepted',
			friendship: {
				id: friendshipId,
				friendId: friend?.id,
				friendUsername: friend?.username
			}
		});
	} catch (error) {
		console.error('Error processing friend request:', error);
		return json({ error: 'Failed to process friend request' }, { status: 500 });
	}
};

// DELETE /api/friends/requests/[id] - Cancel an outgoing friend request
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const requestId = params.id;
		const userId = locals.user.id;

		// Find the request - must be sent BY this user and be pending
		const friendRequest = await db.query.friendRequests.findFirst({
			where: and(eq(friendRequests.id, requestId), eq(friendRequests.fromUserId, userId), eq(friendRequests.status, 'pending'))
		});

		if (!friendRequest) {
			return json({ error: 'Friend request not found or cannot be cancelled' }, { status: 404 });
		}

		// Delete the request
		await db.delete(friendRequests).where(eq(friendRequests.id, requestId));

		return json({ success: true });
	} catch (error) {
		console.error('Error cancelling friend request:', error);
		return json({ error: 'Failed to cancel friend request' }, { status: 500 });
	}
};
