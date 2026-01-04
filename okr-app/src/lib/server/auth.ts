import { db } from '$lib/db/client';
import { users, sessions } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import type { Cookies } from '@sveltejs/kit';

const SALT_ROUNDS = 12;
const SESSION_COOKIE_NAME = 'session_id';
const SESSION_DURATION_DAYS = 30;

export interface AuthUser {
	id: string;
	username: string;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

/**
 * Create a new user
 */
export async function createUser(username: string, password: string): Promise<AuthUser> {
	const existingUser = await db.query.users.findFirst({
		where: eq(users.username, username)
	});

	if (existingUser) {
		throw new Error('Username already exists');
	}

	const id = uuidv4();
	const passwordHash = await hashPassword(password);

	await db.insert(users).values({
		id,
		username,
		passwordHash
	});

	return { id, username };
}

/**
 * Authenticate a user with username and password
 */
export async function authenticateUser(
	username: string,
	password: string
): Promise<AuthUser | null> {
	const user = await db.query.users.findFirst({
		where: eq(users.username, username)
	});

	if (!user) {
		return null;
	}

	const valid = await verifyPassword(password, user.passwordHash);
	if (!valid) {
		return null;
	}

	return { id: user.id, username: user.username };
}

/**
 * Create a new session for a user
 */
export async function createSession(userId: string): Promise<string> {
	const sessionId = uuidv4();
	const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

	await db.insert(sessions).values({
		id: sessionId,
		userId,
		expiresAt
	});

	return sessionId;
}

/**
 * Get user from session ID
 */
export async function getUserFromSession(sessionId: string): Promise<AuthUser | null> {
	const session = await db.query.sessions.findFirst({
		where: eq(sessions.id, sessionId)
	});

	if (!session) {
		return null;
	}

	// Check if session is expired
	if (session.expiresAt < new Date()) {
		await deleteSession(sessionId);
		return null;
	}

	const user = await db.query.users.findFirst({
		where: eq(users.id, session.userId)
	});

	if (!user) {
		return null;
	}

	return { id: user.id, username: user.username };
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Set session cookie
 */
export function setSessionCookie(cookies: Cookies, sessionId: string): void {
	cookies.set(SESSION_COOKIE_NAME, sessionId, {
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60
	});
}

/**
 * Get session ID from cookies
 */
export function getSessionIdFromCookies(cookies: Cookies): string | undefined {
	return cookies.get(SESSION_COOKIE_NAME);
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
}

/**
 * Clean up expired sessions (call periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
	const result = await db
		.delete(sessions)
		.where(eq(sessions.expiresAt, new Date(0))) // This needs proper implementation
		.returning();

	return result.length;
}
