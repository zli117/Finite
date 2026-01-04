/**
 * In-memory store for pending OAuth authorization states
 * In production, use Redis or database for persistence across server restarts
 */

interface PendingAuth {
	userId: string;
	codeVerifier: string;
	expiresAt: number;
}

const pendingAuths: Map<string, PendingAuth> = new Map();

/**
 * Store a pending OAuth authorization
 */
export function setPendingAuth(state: string, data: PendingAuth): void {
	// Clean up expired entries
	cleanupExpired();

	pendingAuths.set(state, data);
}

/**
 * Get and remove a pending OAuth authorization
 */
export function getPendingAuth(state: string): PendingAuth | undefined {
	const data = pendingAuths.get(state);
	if (data) {
		pendingAuths.delete(state);
	}
	return data;
}

/**
 * Clean up expired pending authorizations
 */
function cleanupExpired(): void {
	const now = Date.now();
	for (const [key, value] of pendingAuths.entries()) {
		if (value.expiresAt < now) {
			pendingAuths.delete(key);
		}
	}
}
