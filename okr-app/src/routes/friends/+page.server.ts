import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/client';
import { users, friendRequests, friendships, friendNotes } from '$lib/db/schema';
import { eq, and, or } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const userId = locals.user.id;

	// Get all friendships
	const userFriendships = await db.query.friendships.findMany({
		where: or(eq(friendships.userId1, userId), eq(friendships.userId2, userId))
	});

	// Get friend IDs
	const friendIds = userFriendships.map((f) => (f.userId1 === userId ? f.userId2 : f.userId1));

	// Get friend details
	const friends = await Promise.all(
		friendIds.map(async (friendId) => {
			const friend = await db.query.users.findFirst({
				where: eq(users.id, friendId),
				columns: { id: true, username: true }
			});

			const note = await db.query.friendNotes.findFirst({
				where: and(eq(friendNotes.userId, userId), eq(friendNotes.friendId, friendId))
			});

			const friendship = userFriendships.find(
				(f) =>
					(f.userId1 === userId && f.userId2 === friendId) ||
					(f.userId1 === friendId && f.userId2 === userId)
			);

			return {
				id: friend?.id,
				username: friend?.username,
				friendshipCreatedAt: friendship?.createdAt,
				note: note?.note || ''
			};
		})
	);

	// Get pending incoming requests
	const incomingRequests = await db.query.friendRequests.findMany({
		where: and(eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending'))
	});

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

	// Get pending outgoing requests
	const outgoingRequests = await db.query.friendRequests.findMany({
		where: and(eq(friendRequests.fromUserId, userId), eq(friendRequests.status, 'pending'))
	});

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

	return {
		user: locals.user,
		friends: friends.filter((f) => f.id), // Filter out any nulls
		requests: {
			incoming,
			outgoing
		}
	};
};
