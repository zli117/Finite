import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { users, friendRequests, friendships, friendNotes } from '$lib/db/schema';
import { eq, and, or, ne } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// GET /api/friends - List current friends
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;

	// Find all friendships where the user is either userId1 or userId2
	const userFriendships = await db.query.friendships.findMany({
		where: or(eq(friendships.userId1, userId), eq(friendships.userId2, userId))
	});

	// Get friend IDs (the other user in each friendship)
	const friendIds = userFriendships.map((f) => (f.userId1 === userId ? f.userId2 : f.userId1));

	if (friendIds.length === 0) {
		return json({ friends: [] });
	}

	// Get friend user info and notes
	const friendsData = await Promise.all(
		friendIds.map(async (friendId) => {
			const friend = await db.query.users.findFirst({
				where: eq(users.id, friendId),
				columns: { id: true, username: true }
			});

			const note = await db.query.friendNotes.findFirst({
				where: and(eq(friendNotes.userId, userId), eq(friendNotes.friendId, friendId))
			});

			const friendship = userFriendships.find(
				(f) => (f.userId1 === userId && f.userId2 === friendId) ||
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

	// Filter out any null friends (shouldn't happen but just in case)
	const friends = friendsData.filter((f) => f.id);

	return json({ friends });
};

// POST /api/friends - Send a friend request by username
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { username } = body;

		if (!username || typeof username !== 'string') {
			return json({ error: 'Username is required' }, { status: 400 });
		}

		const normalizedUsername = username.toLowerCase().trim();
		const userId = locals.user.id;

		// Find target user by username
		const targetUser = await db.query.users.findFirst({
			where: eq(users.username, normalizedUsername),
			columns: { id: true, username: true }
		});

		if (!targetUser) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// Cannot send request to self
		if (targetUser.id === userId) {
			return json({ error: 'Cannot send friend request to yourself' }, { status: 400 });
		}

		// Check if already friends
		const existingFriendship = await db.query.friendships.findFirst({
			where: or(
				and(eq(friendships.userId1, userId), eq(friendships.userId2, targetUser.id)),
				and(eq(friendships.userId1, targetUser.id), eq(friendships.userId2, userId))
			)
		});

		if (existingFriendship) {
			return json({ error: 'Already friends with this user' }, { status: 409 });
		}

		// Check if there's already a pending request (in either direction)
		const existingRequest = await db.query.friendRequests.findFirst({
			where: and(
				or(
					and(eq(friendRequests.fromUserId, userId), eq(friendRequests.toUserId, targetUser.id)),
					and(eq(friendRequests.fromUserId, targetUser.id), eq(friendRequests.toUserId, userId))
				),
				eq(friendRequests.status, 'pending')
			)
		});

		if (existingRequest) {
			// If the other user already sent us a request, tell the user to check their requests
			if (existingRequest.fromUserId === targetUser.id) {
				return json({ error: 'This user has already sent you a friend request. Check your pending requests.' }, { status: 409 });
			}
			return json({ error: 'Friend request already sent' }, { status: 409 });
		}

		// Create the friend request
		const requestId = uuidv4();
		await db.insert(friendRequests).values({
			id: requestId,
			fromUserId: userId,
			toUserId: targetUser.id,
			status: 'pending',
			createdAt: new Date()
		});

		return json(
			{
				request: {
					id: requestId,
					toUserId: targetUser.id,
					toUsername: targetUser.username,
					status: 'pending',
					createdAt: new Date()
				}
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Error sending friend request:', error);
		return json({ error: 'Failed to send friend request' }, { status: 500 });
	}
};
