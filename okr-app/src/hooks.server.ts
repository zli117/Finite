import type { Handle } from '@sveltejs/kit';
import { getSessionIdFromCookies, getUserFromSession } from '$lib/server/auth';
import { initializePlugins } from '$lib/server/plugins';
import { startScheduler, isSchedulerRunning } from '$lib/server/plugins/scheduler';

// Initialize plugins and scheduler on server start
let initialized = false;

function initializeOnce(): void {
	if (initialized) return;
	initialized = true;

	// Register all plugins
	initializePlugins();

	// Start the sync scheduler (syncs every hour)
	if (!isSchedulerRunning()) {
		startScheduler(60 * 60 * 1000); // 1 hour
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	// Initialize plugins and scheduler on first request
	initializeOnce();

	// Get session ID from cookies
	const sessionId = getSessionIdFromCookies(event.cookies);

	if (sessionId) {
		// Get user from session
		const user = await getUserFromSession(sessionId);
		if (user) {
			event.locals.user = user;
		}
	}

	return resolve(event);
};
