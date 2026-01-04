import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getSessionIdFromCookies,
	deleteSession,
	clearSessionCookie
} from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies }) => {
	const sessionId = getSessionIdFromCookies(cookies);

	if (sessionId) {
		await deleteSession(sessionId);
	}

	clearSessionCookie(cookies);

	return json({ success: true });
};
