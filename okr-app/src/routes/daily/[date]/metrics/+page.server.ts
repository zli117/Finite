import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, fetch }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const dateStr = params.date;

	// Validate date format
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		throw redirect(302, '/daily');
	}

	// Fetch metrics for this date
	const response = await fetch(`/api/metrics/daily/${dateStr}`);
	const data = await response.json();

	return {
		date: dateStr,
		metrics: data.metrics || null
	};
};
