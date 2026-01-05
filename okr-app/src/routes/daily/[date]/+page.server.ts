import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { MetricDefinition } from '$lib/db/schema';

export const load: PageServerLoad = async ({ params, locals, fetch, depends }) => {
	// Register dependencies for invalidation
	depends('data:daily');
	depends('data:tasks');

	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const dateStr = params.date;

	// Validate date format
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		throw redirect(302, `/daily/${formatDate(new Date())}`);
	}

	// Fetch daily data and flexible metrics in parallel
	const [response, flexResponse, tagsResponse] = await Promise.all([
		fetch(`/api/periods/daily/${dateStr}`),
		fetch(`/api/metrics/flexible/${dateStr}`),
		fetch('/api/tags')
	]);

	const data = await response.json();

	if (!response.ok) {
		return {
			date: dateStr,
			period: null,
			tasks: [],
			metrics: null,
			flexibleMetrics: null,
			error: data.error || 'Failed to load data'
		};
	}

	const flexData = await flexResponse.json();
	const tagsData = await tagsResponse.json();

	return {
		date: dateStr,
		period: data.period,
		tasks: data.tasks || [],
		metrics: data.metrics,
		tags: tagsData.tags || [],
		// Flexible metrics system
		flexibleMetrics: flexResponse.ok ? {
			template: flexData.template as { id: string; name: string; effectiveFrom: string } | null,
			metricsDefinition: (flexData.metrics || []) as MetricDefinition[],
			values: (flexData.values || {}) as Record<string, string | number | boolean | null>,
			errors: (flexData.errors || {}) as Record<string, string>
		} : null
	};
};

function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}
