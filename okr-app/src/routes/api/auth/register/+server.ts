import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createUser, createSession, setSessionCookie } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const { username, password } = await request.json();

		// Validate input
		if (!username || typeof username !== 'string' || username.length < 3) {
			return json({ error: 'Username must be at least 3 characters' }, { status: 400 });
		}

		if (!password || typeof password !== 'string' || password.length < 8) {
			return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
		}

		// Create user
		const user = await createUser(username.toLowerCase().trim(), password);

		// Create session
		const sessionId = await createSession(user.id);

		// Set cookie
		setSessionCookie(cookies, sessionId);

		return json({ user: { id: user.id, username: user.username } });
	} catch (error) {
		if (error instanceof Error && error.message === 'Username already exists') {
			return json({ error: 'Username already exists' }, { status: 409 });
		}
		console.error('Registration error:', error);
		return json({ error: 'Registration failed' }, { status: 500 });
	}
};
