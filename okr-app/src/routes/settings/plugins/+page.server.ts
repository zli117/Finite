import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserPluginConfig, getRegisteredPlugins, initializePlugins } from '$lib/server/plugins';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Initialize plugins
	initializePlugins();

	// Get all registered plugins
	const plugins = getRegisteredPlugins();

	// Get user's plugin configurations
	const pluginStatuses = await Promise.all(
		plugins.map(async (plugin) => {
			const config = await getUserPluginConfig(locals.user!.id, plugin.id);
			return {
				id: plugin.id,
				name: plugin.name,
				description: plugin.description,
				icon: plugin.icon,
				fields: plugin.getAvailableFields(),
				connected: !!(config?.credentials),
				enabled: config?.enabled ?? false,
				lastSync: config?.lastSync ?? null
			};
		})
	);

	// Check for success/error messages
	const success = url.searchParams.get('success');
	const error = url.searchParams.get('error');

	return {
		plugins: pluginStatuses,
		success,
		error
	};
};
