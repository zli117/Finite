import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { MetricDefinition } from '$lib/db/schema';

export const load: PageServerLoad = async ({ params, locals, fetch, depends }) => {
	// Register dependency for invalidation
	depends('data:metrics');

	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const dateStr = params.date;

	// Validate date format
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		throw redirect(302, '/daily');
	}

	// Fetch flexible metrics for this date
	const flexResponse = await fetch(`/api/metrics/flexible/${dateStr}`);
	const flexData = await flexResponse.json();

	// Also fetch legacy metrics for backward compatibility
	const legacyResponse = await fetch(`/api/metrics/daily/${dateStr}`);
	const legacyData = await legacyResponse.json();

	return {
		date: dateStr,
		// New flexible metrics system
		template: flexData.template as { id: string; name: string; effectiveFrom: string } | null,
		metricsDefinition: (flexData.metrics || []) as MetricDefinition[],
		values: (flexData.values || {}) as Record<string, string | number | boolean | null>,
		errors: (flexData.errors || {}) as Record<string, string>,
		// Legacy fixed metrics (for backward compatibility)
		legacyMetrics: legacyData.metrics || null
	};
};
