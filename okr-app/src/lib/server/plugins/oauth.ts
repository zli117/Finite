/**
 * OAuth2 utilities with PKCE support
 */

import { randomBytes, createHash } from 'crypto';
import type { OAuthConfig, OAuthCredentials } from './types';

/**
 * Generate a cryptographically random string for PKCE code verifier
 */
export function generateCodeVerifier(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * Generate code challenge from code verifier (SHA256)
 */
export function generateCodeChallenge(verifier: string): string {
	const hash = createHash('sha256').update(verifier).digest();
	return hash.toString('base64url');
}

/**
 * Generate a random state parameter for CSRF protection
 */
export function generateState(): string {
	return randomBytes(16).toString('hex');
}

/**
 * Build the authorization URL for OAuth2 flow
 */
export function buildAuthorizationUrl(
	config: OAuthConfig,
	state: string,
	codeChallenge?: string
): string {
	const params = new URLSearchParams({
		client_id: config.clientId,
		response_type: 'code',
		redirect_uri: config.redirectUri,
		scope: config.scopes.join(' '),
		state
	});

	if (config.usePKCE && codeChallenge) {
		params.set('code_challenge', codeChallenge);
		params.set('code_challenge_method', 'S256');
	}

	return `${config.authorizationUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
	config: OAuthConfig,
	code: string,
	codeVerifier?: string
): Promise<OAuthCredentials> {
	const params = new URLSearchParams({
		client_id: config.clientId,
		grant_type: 'authorization_code',
		code,
		redirect_uri: config.redirectUri
	});

	if (config.clientSecret && !config.usePKCE) {
		params.set('client_secret', config.clientSecret);
	}

	if (config.usePKCE && codeVerifier) {
		params.set('code_verifier', codeVerifier);
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/x-www-form-urlencoded'
	};

	// Fitbit requires Basic auth header
	if (config.clientSecret) {
		const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
		headers['Authorization'] = `Basic ${credentials}`;
	}

	const response = await fetch(config.tokenUrl, {
		method: 'POST',
		headers,
		body: params.toString()
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Token exchange failed: ${error}`);
	}

	const data = await response.json();

	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
		tokenType: data.token_type,
		scope: data.scope || config.scopes.join(' ')
	};
}

/**
 * Refresh an access token
 */
export async function refreshAccessToken(
	config: OAuthConfig,
	refreshToken: string
): Promise<OAuthCredentials> {
	const params = new URLSearchParams({
		grant_type: 'refresh_token',
		refresh_token: refreshToken
	});

	const headers: Record<string, string> = {
		'Content-Type': 'application/x-www-form-urlencoded'
	};

	// Fitbit requires Basic auth header for refresh
	if (config.clientSecret) {
		const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
		headers['Authorization'] = `Basic ${credentials}`;
	} else {
		params.set('client_id', config.clientId);
	}

	const response = await fetch(config.tokenUrl, {
		method: 'POST',
		headers,
		body: params.toString()
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Token refresh failed: ${error}`);
	}

	const data = await response.json();

	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token || refreshToken,
		expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
		tokenType: data.token_type,
		scope: data.scope
	};
}
