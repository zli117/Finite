import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { savedQueries } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const queries = await db.query.savedQueries.findMany({
		where: eq(savedQueries.userId, locals.user.id)
	});

	return {
		savedQueries: queries
	};
};
