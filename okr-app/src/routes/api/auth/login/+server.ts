import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticateUser, createSession, setSessionCookie } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const { username, password } = await request.json();

		// Validate input
		if (!username || typeof username !== 'string') {
			return json({ error: 'Username is required' }, { status: 400 });
		}

		if (!password || typeof password !== 'string') {
			return json({ error: 'Password is required' }, { status: 400 });
		}

		// Authenticate user
		const user = await authenticateUser(username.toLowerCase().trim(), password);

		if (!user) {
			return json({ error: 'Invalid username or password' }, { status: 401 });
		}

		// Create session
		const sessionId = await createSession(user.id);

		// Set cookie
		setSessionCookie(cookies, sessionId);

		return json({ user: { id: user.id, username: user.username } });
	} catch (error) {
		console.error('Login error:', error);
		return json({ error: 'Login failed' }, { status: 500 });
	}
};
