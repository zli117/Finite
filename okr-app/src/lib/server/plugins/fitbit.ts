/**
 * Fitbit Plugin - Import health and fitness data from Fitbit
 */

import type { DataImportPlugin, OAuthConfig, OAuthCredentials, DataFieldDescriptor, ImportedDataRecord } from './types';
import { refreshAccessToken } from './oauth';
import { env } from '$env/dynamic/private';

const FITBIT_API_BASE = 'https://api.fitbit.com';

export const fitbitPlugin: DataImportPlugin = {
	id: 'fitbit',
	name: 'Fitbit',
	description: 'Import sleep, activity, and health data from Fitbit',
	icon: '⌚',

	getOAuthConfig(): OAuthConfig {
		const baseUrl = env.PUBLIC_BASE_URL || 'http://localhost:5173';
		return {
			clientId: env.FITBIT_CLIENT_ID || '',
			clientSecret: env.FITBIT_CLIENT_SECRET || '',
			authorizationUrl: 'https://www.fitbit.com/oauth2/authorize',
			tokenUrl: 'https://api.fitbit.com/oauth2/token',
			scopes: ['sleep', 'activity', 'heartrate', 'profile'],
			redirectUri: `${baseUrl}/api/plugins/fitbit/callback`,
			usePKCE: true
		};
	},

	getAvailableFields(): DataFieldDescriptor[] {
		return [
			{
				id: 'sleepLength',
				name: 'Sleep Duration',
				description: 'Total time asleep',
				type: 'time',
				unit: 'HH:MM'
			},
			{
				id: 'wakeUpTime',
				name: 'Wake Up Time',
				description: 'Time of waking up',
				type: 'time',
				unit: 'HH:MM'
			},
			{
				id: 'bedTime',
				name: 'Bed Time',
				description: 'Time of going to bed',
				type: 'time',
				unit: 'HH:MM'
			},
			{
				id: 'steps',
				name: 'Steps',
				description: 'Daily step count',
				type: 'number'
			},
			{
				id: 'cardioLoad',
				name: 'Active Zone Minutes',
				description: 'Minutes in cardio/peak heart rate zones',
				type: 'number',
				unit: 'minutes'
			},
			{
				id: 'restingHeartRate',
				name: 'Resting Heart Rate',
				description: 'Daily resting heart rate',
				type: 'number',
				unit: 'bpm'
			},
			{
				id: 'fitbitReadiness',
				name: 'Daily Readiness Score',
				description: 'Fitbit Premium readiness score (if available)',
				type: 'number',
				unit: '0-100'
			}
		];
	},

	async validateCredentials(credentials: OAuthCredentials): Promise<boolean> {
		try {
			const response = await fetch(`${FITBIT_API_BASE}/1/user/-/profile.json`, {
				headers: {
					'Authorization': `Bearer ${credentials.accessToken}`
				}
			});
			return response.ok;
		} catch {
			return false;
		}
	},

	async refreshTokens(credentials: OAuthCredentials): Promise<OAuthCredentials> {
		const config = this.getOAuthConfig();
		return refreshAccessToken(config, credentials.refreshToken);
	},

	async fetchData(
		credentials: OAuthCredentials,
		startDate: string,
		endDate: string,
		_fields: string[]
	): Promise<ImportedDataRecord[]> {
		const records: Map<string, ImportedDataRecord> = new Map();

		// Helper to ensure record exists
		const getRecord = (date: string): ImportedDataRecord => {
			if (!records.has(date)) {
				records.set(date, { date, fields: {} });
			}
			return records.get(date)!;
		};

		// Fetch sleep data
		try {
			const sleepData = await fetchSleepData(credentials.accessToken, startDate, endDate);
			for (const sleep of sleepData) {
				const record = getRecord(sleep.date);
				record.fields.sleepLength = sleep.duration;
				record.fields.wakeUpTime = sleep.wakeUpTime;
				record.fields.bedTime = sleep.bedTime;
			}
		} catch (error) {
			console.error('Failed to fetch sleep data:', error);
		}

		// Fetch activity data (steps, active zone minutes)
		try {
			const activityData = await fetchActivityData(credentials.accessToken, startDate, endDate);
			for (const activity of activityData) {
				const record = getRecord(activity.date);
				record.fields.steps = activity.steps;
				record.fields.cardioLoad = activity.activeZoneMinutes;
			}
		} catch (error) {
			console.error('Failed to fetch activity data:', error);
		}

		// Fetch heart rate data
		try {
			const heartData = await fetchHeartRateData(credentials.accessToken, startDate, endDate);
			for (const heart of heartData) {
				const record = getRecord(heart.date);
				record.fields.restingHeartRate = heart.restingHeartRate;
			}
		} catch (error) {
			console.error('Failed to fetch heart rate data:', error);
		}

		return Array.from(records.values()).sort((a, b) => a.date.localeCompare(b.date));
	}
};

interface SleepRecord {
	date: string;
	duration: string; // HH:MM
	wakeUpTime: string;
	bedTime: string;
}

async function fetchSleepData(
	accessToken: string,
	startDate: string,
	endDate: string
): Promise<SleepRecord[]> {
	const response = await fetch(
		`${FITBIT_API_BASE}/1.2/user/-/sleep/date/${startDate}/${endDate}.json`,
		{
			headers: { 'Authorization': `Bearer ${accessToken}` }
		}
	);

	if (!response.ok) {
		throw new Error(`Sleep API failed: ${response.status}`);
	}

	const data = await response.json();
	const records: SleepRecord[] = [];

	for (const sleep of data.sleep || []) {
		if (sleep.isMainSleep) {
			const durationMinutes = sleep.minutesAsleep || 0;
			const hours = Math.floor(durationMinutes / 60);
			const minutes = durationMinutes % 60;

			// Extract times from the sleep log
			const startTime = new Date(sleep.startTime);
			const endTime = new Date(sleep.endTime);

			records.push({
				date: sleep.dateOfSleep,
				duration: `${hours}:${String(minutes).padStart(2, '0')}`,
				bedTime: formatTime(startTime),
				wakeUpTime: formatTime(endTime)
			});
		}
	}

	return records;
}

interface ActivityRecord {
	date: string;
	steps: number;
	activeZoneMinutes: number;
}

async function fetchActivityData(
	accessToken: string,
	startDate: string,
	endDate: string
): Promise<ActivityRecord[]> {
	// Fetch steps
	const stepsResponse = await fetch(
		`${FITBIT_API_BASE}/1/user/-/activities/steps/date/${startDate}/${endDate}.json`,
		{
			headers: { 'Authorization': `Bearer ${accessToken}` }
		}
	);

	if (!stepsResponse.ok) {
		throw new Error(`Steps API failed: ${stepsResponse.status}`);
	}

	const stepsData = await stepsResponse.json();

	// Fetch active zone minutes
	let azmData: { 'activities-active-zone-minutes'?: Array<{ dateTime: string; value: { activeZoneMinutes: number } }> } = {};
	try {
		const azmResponse = await fetch(
			`${FITBIT_API_BASE}/1/user/-/activities/active-zone-minutes/date/${startDate}/${endDate}.json`,
			{
				headers: { 'Authorization': `Bearer ${accessToken}` }
			}
		);
		if (azmResponse.ok) {
			azmData = await azmResponse.json();
		}
	} catch {
		// Active zone minutes may not be available for all users
	}

	const records: Map<string, ActivityRecord> = new Map();

	// Process steps
	for (const entry of stepsData['activities-steps'] || []) {
		records.set(entry.dateTime, {
			date: entry.dateTime,
			steps: parseInt(entry.value) || 0,
			activeZoneMinutes: 0
		});
	}

	// Process active zone minutes
	for (const entry of azmData['activities-active-zone-minutes'] || []) {
		const existing = records.get(entry.dateTime);
		if (existing) {
			existing.activeZoneMinutes = entry.value?.activeZoneMinutes || 0;
		} else {
			records.set(entry.dateTime, {
				date: entry.dateTime,
				steps: 0,
				activeZoneMinutes: entry.value?.activeZoneMinutes || 0
			});
		}
	}

	return Array.from(records.values());
}

interface HeartRecord {
	date: string;
	restingHeartRate: number | null;
}

async function fetchHeartRateData(
	accessToken: string,
	startDate: string,
	endDate: string
): Promise<HeartRecord[]> {
	const response = await fetch(
		`${FITBIT_API_BASE}/1/user/-/activities/heart/date/${startDate}/${endDate}.json`,
		{
			headers: { 'Authorization': `Bearer ${accessToken}` }
		}
	);

	if (!response.ok) {
		throw new Error(`Heart rate API failed: ${response.status}`);
	}

	const data = await response.json();
	const records: HeartRecord[] = [];

	for (const entry of data['activities-heart'] || []) {
		records.push({
			date: entry.dateTime,
			restingHeartRate: entry.value?.restingHeartRate || null
		});
	}

	return records;
}

function formatTime(date: Date): string {
	const hours = date.getHours();
	const minutes = date.getMinutes();
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
