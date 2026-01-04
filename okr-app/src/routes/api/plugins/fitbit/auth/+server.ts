import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fitbitPlugin } from '$lib/server/plugins/fitbit';
import { generateCodeVerifier, generateCodeChallenge, generateState, buildAuthorizationUrl } from '$lib/server/plugins/oauth';
import { setPendingAuth } from '$lib/server/plugins/oauth-state';

// GET /api/plugins/fitbit/auth - Start OAuth flow
export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const config = fitbitPlugin.getOAuthConfig();

	if (!config.clientId) {
		return json({ error: 'Fitbit not configured. Set FITBIT_CLIENT_ID and FITBIT_CLIENT_SECRET environment variables.' }, { status: 500 });
	}

	// Generate PKCE values
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = generateCodeChallenge(codeVerifier);
	const state = generateState();

	// Store pending auth (cleanup happens automatically)
	setPendingAuth(state, {
		userId: locals.user.id,
		codeVerifier,
		expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
	});

	const authUrl = buildAuthorizationUrl(config, state, codeChallenge);

	// Set state in cookie for verification
	cookies.set('fitbit_oauth_state', state, {
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		maxAge: 600 // 10 minutes
	});

	throw redirect(302, authUrl);
};
