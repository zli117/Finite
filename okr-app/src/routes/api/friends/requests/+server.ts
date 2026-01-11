import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { users, friendRequests } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';

// GET /api/friends/requests - List pending friend requests (incoming and outgoing)
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;

	// Get incoming pending requests (sent to this user)
	const incomingRequests = await db.query.friendRequests.findMany({
		where: and(eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending'))
	});

	// Get outgoing pending requests (sent by this user)
	const outgoingRequests = await db.query.friendRequests.findMany({
		where: and(eq(friendRequests.fromUserId, userId), eq(friendRequests.status, 'pending'))
	});

	// Enrich incoming requests with sender username
	const incoming = await Promise.all(
		incomingRequests.map(async (req) => {
			const fromUser = await db.query.users.findFirst({
				where: eq(users.id, req.fromUserId),
				columns: { id: true, username: true }
			});
			return {
				id: req.id,
				fromUserId: req.fromUserId,
				fromUsername: fromUser?.username,
				createdAt: req.createdAt
			};
		})
	);

	// Enrich outgoing requests with recipient username
	const outgoing = await Promise.all(
		outgoingRequests.map(async (req) => {
			const toUser = await db.query.users.findFirst({
				where: eq(users.id, req.toUserId),
				columns: { id: true, username: true }
			});
			return {
				id: req.id,
				toUserId: req.toUserId,
				toUsername: toUser?.username,
				createdAt: req.createdAt
			};
		})
	);

	return json({ incoming, outgoing });
};
