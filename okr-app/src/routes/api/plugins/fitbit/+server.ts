import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserPluginConfig, disableUserPlugin } from '$lib/server/plugins/manager';
import { fitbitPlugin } from '$lib/server/plugins/fitbit';

// GET /api/plugins/fitbit - Get Fitbit plugin status
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const config = await getUserPluginConfig(locals.user.id, 'fitbit');

	return json({
		plugin: {
			id: fitbitPlugin.id,
			name: fitbitPlugin.name,
			description: fitbitPlugin.description,
			icon: fitbitPlugin.icon,
			fields: fitbitPlugin.getAvailableFields()
		},
		connected: !!(config?.credentials),
		enabled: config?.enabled ?? false,
		lastSync: config?.lastSync ?? null
	});
};

// DELETE /api/plugins/fitbit - Disconnect Fitbit
export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await disableUserPlugin(locals.user.id, 'fitbit');

	return json({ success: true });
};
