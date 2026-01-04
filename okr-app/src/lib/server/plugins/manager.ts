/**
 * Plugin Manager - handles registration and coordination of data import plugins
 */

import type { DataImportPlugin, PluginConfig, OAuthCredentials, SyncResult, ImportedDataRecord } from './types';
import { db } from '$lib/db/client';
import { plugins, dailyMetrics, timePeriods } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// Plugin registry
const registeredPlugins: Map<string, DataImportPlugin> = new Map();

/**
 * Register a plugin
 */
export function registerPlugin(plugin: DataImportPlugin): void {
	registeredPlugins.set(plugin.id, plugin);
	console.log(`Plugin registered: ${plugin.name} (${plugin.id})`);
}

/**
 * Get all registered plugins
 */
export function getRegisteredPlugins(): DataImportPlugin[] {
	return Array.from(registeredPlugins.values());
}

/**
 * Get a specific plugin by ID
 */
export function getPlugin(pluginId: string): DataImportPlugin | undefined {
	return registeredPlugins.get(pluginId);
}

/**
 * Get user's plugin configuration
 */
export async function getUserPluginConfig(userId: string, pluginId: string): Promise<PluginConfig | null> {
	const record = await db.query.plugins.findFirst({
		where: and(
			eq(plugins.userId, userId),
			eq(plugins.pluginId, pluginId)
		)
	});

	if (!record) return null;

	const config = record.config ? JSON.parse(record.config) : {};

	return {
		id: record.id,
		userId: record.userId,
		enabled: record.enabled,
		credentials: config.credentials,
		settings: config.settings,
		lastSync: record.lastSync ?? undefined
	};
}

/**
 * Save user's plugin configuration
 */
export async function saveUserPluginConfig(
	userId: string,
	pluginId: string,
	credentials: OAuthCredentials,
	settings?: Record<string, unknown>
): Promise<void> {
	const existing = await db.query.plugins.findFirst({
		where: and(
			eq(plugins.userId, userId),
			eq(plugins.pluginId, pluginId)
		)
	});

	const config = JSON.stringify({ credentials, settings });

	if (existing) {
		await db.update(plugins)
			.set({ config, enabled: true })
			.where(eq(plugins.id, existing.id));
	} else {
		await db.insert(plugins).values({
			id: uuidv4(),
			userId,
			pluginId,
			enabled: true,
			config,
			createdAt: new Date()
		});
	}
}

/**
 * Disable a plugin for a user
 */
export async function disableUserPlugin(userId: string, pluginId: string): Promise<void> {
	await db.update(plugins)
		.set({ enabled: false, config: null })
		.where(and(
			eq(plugins.userId, userId),
			eq(plugins.pluginId, pluginId)
		));
}

/**
 * Sync data from a plugin for a user
 */
export async function syncPluginData(
	userId: string,
	pluginId: string,
	startDate: string,
	endDate: string
): Promise<SyncResult> {
	const plugin = getPlugin(pluginId);
	if (!plugin) {
		return { success: false, recordsImported: 0, errors: ['Plugin not found'] };
	}

	const config = await getUserPluginConfig(userId, pluginId);
	if (!config || !config.credentials) {
		return { success: false, recordsImported: 0, errors: ['Plugin not configured'] };
	}

	let credentials = config.credentials;

	// Check if tokens need refresh
	if (credentials.expiresAt < Date.now() / 1000) {
		try {
			credentials = await plugin.refreshTokens(credentials);
			await saveUserPluginConfig(userId, pluginId, credentials, config.settings);
		} catch (error) {
			return { success: false, recordsImported: 0, errors: ['Failed to refresh tokens'] };
		}
	}

	// Validate credentials
	const valid = await plugin.validateCredentials(credentials);
	if (!valid) {
		return { success: false, recordsImported: 0, errors: ['Invalid credentials'] };
	}

	// Fetch data
	const fields = plugin.getAvailableFields().map(f => f.id);
	let records: ImportedDataRecord[];

	try {
		records = await plugin.fetchData(credentials, startDate, endDate, fields);
	} catch (error) {
		return {
			success: false,
			recordsImported: 0,
			errors: [`Failed to fetch data: ${error instanceof Error ? error.message : 'Unknown error'}`]
		};
	}

	// Import records into database
	let importedCount = 0;
	const errors: string[] = [];

	for (const record of records) {
		try {
			await importDailyMetrics(userId, record);
			importedCount++;
		} catch (error) {
			errors.push(`Failed to import ${record.date}: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	// Update last sync time
	await db.update(plugins)
		.set({ lastSync: new Date() })
		.where(and(
			eq(plugins.userId, userId),
			eq(plugins.pluginId, pluginId)
		));

	return {
		success: errors.length === 0,
		recordsImported: importedCount,
		errors: errors.length > 0 ? errors : undefined,
		lastSyncDate: endDate
	};
}

/**
 * Import daily metrics from plugin data
 */
async function importDailyMetrics(userId: string, record: ImportedDataRecord): Promise<void> {
	// Find or create the time period for this date
	let period = await db.query.timePeriods.findFirst({
		where: and(
			eq(timePeriods.userId, userId),
			eq(timePeriods.periodType, 'daily'),
			eq(timePeriods.day, record.date)
		)
	});

	if (!period) {
		const date = new Date(record.date);
		const periodId = uuidv4();
		const now = new Date();

		await db.insert(timePeriods).values({
			id: periodId,
			userId,
			periodType: 'daily',
			year: date.getFullYear(),
			month: date.getMonth() + 1,
			week: getWeekNumber(date),
			day: record.date,
			createdAt: now,
			updatedAt: now
		});

		period = await db.query.timePeriods.findFirst({
			where: eq(timePeriods.id, periodId)
		});
	}

	if (!period) {
		throw new Error('Failed to create time period');
	}

	// Check if metrics already exist
	const existing = await db.query.dailyMetrics.findFirst({
		where: and(
			eq(dailyMetrics.timePeriodId, period.id),
			eq(dailyMetrics.userId, userId)
		)
	});

	// Map plugin fields to database columns
	const metricsData: Record<string, unknown> = {};

	if (record.fields.sleepLength !== undefined) {
		metricsData.sleepLength = record.fields.sleepLength;
	}
	if (record.fields.wakeUpTime !== undefined) {
		metricsData.wakeUpTime = record.fields.wakeUpTime;
	}
	if (record.fields.bedTime !== undefined) {
		metricsData.previousNightBedTime = record.fields.bedTime;
	}
	if (record.fields.steps !== undefined) {
		metricsData.steps = record.fields.steps;
	}
	if (record.fields.cardioLoad !== undefined) {
		metricsData.cardioLoad = record.fields.cardioLoad;
	}
	if (record.fields.fitbitReadiness !== undefined) {
		metricsData.fitbitReadiness = record.fields.fitbitReadiness;
	}
	if (record.fields.restingHeartRate !== undefined) {
		metricsData.restingHeartRate = record.fields.restingHeartRate;
	}

	if (existing) {
		// Update existing metrics
		await db.update(dailyMetrics)
			.set(metricsData)
			.where(eq(dailyMetrics.id, existing.id));
	} else {
		// Create new metrics
		await db.insert(dailyMetrics).values({
			id: uuidv4(),
			userId,
			timePeriodId: period.id,
			...metricsData
		});
	}
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
