/**
 * Plugin Sync Scheduler
 * Automatically syncs data from connected plugins at regular intervals
 */

import { db } from '$lib/db/client';
import { plugins } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPlugin, syncPluginData } from './manager';

// Default sync interval: 1 hour
const DEFAULT_SYNC_INTERVAL_MS = 60 * 60 * 1000;

// Track if scheduler is running
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/**
 * Start the plugin sync scheduler
 */
export function startScheduler(intervalMs: number = DEFAULT_SYNC_INTERVAL_MS): void {
	if (schedulerInterval) {
		console.log('Scheduler already running');
		return;
	}

	console.log(`Starting plugin sync scheduler (interval: ${intervalMs / 1000}s)`);

	// Run initial sync after a short delay to let the server fully start
	setTimeout(() => {
		runScheduledSync().catch(console.error);
	}, 5000);

	// Set up recurring sync
	schedulerInterval = setInterval(() => {
		runScheduledSync().catch(console.error);
	}, intervalMs);
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
	if (schedulerInterval) {
		clearInterval(schedulerInterval);
		schedulerInterval = null;
		console.log('Plugin sync scheduler stopped');
	}
}

/**
 * Run a scheduled sync for all enabled plugins
 */
async function runScheduledSync(): Promise<void> {
	if (isRunning) {
		console.log('Sync already in progress, skipping');
		return;
	}

	isRunning = true;
	console.log('Starting scheduled plugin sync...');

	try {
		// Get all enabled plugin configurations
		const enabledPlugins = await db.query.plugins.findMany({
			where: eq(plugins.enabled, true)
		});

		if (enabledPlugins.length === 0) {
			console.log('No enabled plugins to sync');
			return;
		}

		console.log(`Found ${enabledPlugins.length} enabled plugin(s)`);

		// Calculate date range (last 7 days by default)
		const endDate = new Date();
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - 7);

		const startDateStr = startDate.toISOString().split('T')[0];
		const endDateStr = endDate.toISOString().split('T')[0];

		// Sync each plugin for each user
		for (const pluginConfig of enabledPlugins) {
			const plugin = getPlugin(pluginConfig.pluginId);
			if (!plugin) {
				console.warn(`Plugin ${pluginConfig.pluginId} not found, skipping`);
				continue;
			}

			console.log(`Syncing ${plugin.name} for user ${pluginConfig.userId}...`);

			try {
				const result = await syncPluginData(
					pluginConfig.userId,
					pluginConfig.pluginId,
					startDateStr,
					endDateStr
				);

				if (result.success) {
					console.log(`  Synced ${result.recordsImported} records`);
				} else {
					console.warn(`  Sync had errors: ${result.errors?.join(', ')}`);
				}
			} catch (error) {
				console.error(`  Sync failed:`, error);
			}
		}

		console.log('Scheduled sync complete');
	} finally {
		isRunning = false;
	}
}

/**
 * Manually trigger a sync for a specific user and plugin
 */
export async function triggerSync(
	userId: string,
	pluginId: string,
	options?: { startDate?: string; endDate?: string }
): Promise<{ success: boolean; recordsImported: number; errors?: string[] }> {
	const endDate = options?.endDate || new Date().toISOString().split('T')[0];
	const startDate = options?.startDate || (() => {
		const d = new Date();
		d.setDate(d.getDate() - 30);
		return d.toISOString().split('T')[0];
	})();

	return syncPluginData(userId, pluginId, startDate, endDate);
}

/**
 * Check if the scheduler is currently running
 */
export function isSchedulerRunning(): boolean {
	return schedulerInterval !== null;
}
