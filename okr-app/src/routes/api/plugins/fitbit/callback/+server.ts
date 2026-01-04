import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fitbitPlugin } from '$lib/server/plugins/fitbit';
import { exchangeCodeForTokens } from '$lib/server/plugins/oauth';
import { saveUserPluginConfig } from '$lib/server/plugins/manager';
import { getPendingAuth } from '$lib/server/plugins/oauth-state';

// GET /api/plugins/fitbit/callback - OAuth callback
export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');

	// Check for errors
	if (error) {
		console.error('OAuth error:', error);
		throw redirect(302, '/settings/plugins?error=' + encodeURIComponent(error));
	}

	if (!code || !state) {
		throw redirect(302, '/settings/plugins?error=missing_params');
	}

	// Verify state
	const cookieState = cookies.get('fitbit_oauth_state');
	if (state !== cookieState) {
		throw redirect(302, '/settings/plugins?error=invalid_state');
	}

	// Get and remove pending auth (getPendingAuth auto-deletes)
	const pending = getPendingAuth(state);
	if (!pending || pending.expiresAt < Date.now()) {
		throw redirect(302, '/settings/plugins?error=expired');
	}

	// Clean up cookie
	cookies.delete('fitbit_oauth_state', { path: '/' });

	try {
		// Exchange code for tokens
		const config = fitbitPlugin.getOAuthConfig();
		const credentials = await exchangeCodeForTokens(config, code, pending.codeVerifier);

		// Save credentials
		await saveUserPluginConfig(pending.userId, 'fitbit', credentials);

		// Redirect to success
		throw redirect(302, '/settings/plugins?success=fitbit');
	} catch (err) {
		console.error('Token exchange failed:', err);
		throw redirect(302, '/settings/plugins?error=token_exchange_failed');
	}
};
