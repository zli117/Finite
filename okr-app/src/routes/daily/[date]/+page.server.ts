import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, fetch }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const dateStr = params.date;

	// Validate date format
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		throw redirect(302, `/daily/${formatDate(new Date())}`);
	}

	// Fetch daily data from API
	const response = await fetch(`/api/periods/daily/${dateStr}`);
	const data = await response.json();

	if (!response.ok) {
		return {
			date: dateStr,
			period: null,
			tasks: [],
			metrics: null,
			error: data.error || 'Failed to load data'
		};
	}

	// Fetch tags for the user
	const tagsResponse = await fetch('/api/tags');
	const tagsData = await tagsResponse.json();

	return {
		date: dateStr,
		period: data.period,
		tasks: data.tasks || [],
		metrics: data.metrics,
		tags: tagsData.tags || []
	};
};

function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}
