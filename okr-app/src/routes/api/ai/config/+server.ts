import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { userAiConfig } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { PROVIDER_DEFAULTS, type AiProvider } from '$lib/server/ai/providers';

function maskApiKey(key: string): string {
	if (key.length > 8) return '***' + key.slice(-4);
	return '***';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeProviderConfig(conf: Record<string, any>): Record<string, any> {
	// Migrate old `model` (string) → `models` (array)
	if (conf.model && !conf.models) {
		conf.models = [conf.model];
		delete conf.model;
	}
	if (!conf.models) {
		conf.models = [];
	}
	return conf;
}

// GET /api/ai/config - Get current AI config (masked keys)
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const config = await db.query.userAiConfig.findFirst({
		where: eq(userAiConfig.userId, locals.user.id)
	});

	if (!config) {
		return json({ config: null, providerDefaults: PROVIDER_DEFAULTS });
	}

	// Mask API keys and normalize models
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const providersConfig: Record<string, Record<string, any>> = config.providersConfig
		? JSON.parse(config.providersConfig)
		: {};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const masked: Record<string, Record<string, any>> = {};
	for (const [provider, conf] of Object.entries(providersConfig)) {
		masked[provider] = normalizeProviderConfig({ ...conf });
		if (masked[provider].apiKey) {
			masked[provider].apiKeyMasked = maskApiKey(masked[provider].apiKey);
			delete masked[provider].apiKey;
		}
	}

	return json({
		config: {
			provider: config.provider,
			providersConfig: masked,
			customSystemPrompt: config.customSystemPrompt
		},
		providerDefaults: PROVIDER_DEFAULTS,
		suggestedModels: SUGGESTED_MODELS
	});
};

// PUT /api/ai/config - Save AI configuration
export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const {
			provider,
			providerConfig,
			deleteProvider,
			clearApiKey,
			customSystemPrompt,
			maxAgentRounds
		} = body as {
			provider?: AiProvider;
			providerConfig?: { apiKey?: string; models?: string[]; baseUrl?: string };
			deleteProvider?: AiProvider;
			clearApiKey?: AiProvider;
			customSystemPrompt?: string | null;
			maxAgentRounds?: number;
		};

		// Get existing config
		const existing = await db.query.userAiConfig.findFirst({
			where: eq(userAiConfig.userId, locals.user.id)
		});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const existingProvidersConfig: Record<string, Record<string, any>> = existing?.providersConfig
			? JSON.parse(existing.providersConfig)
			: {};

		// Handle provider deletion
		if (deleteProvider) {
			delete existingProvidersConfig[deleteProvider];
		}

		// Handle API key removal
		if (clearApiKey && existingProvidersConfig[clearApiKey]) {
			delete existingProvidersConfig[clearApiKey].apiKey;
		}

		// Merge provider config (only update the specific provider being configured)
		if (provider && providerConfig) {
			const existingProviderConf = normalizeProviderConfig(existingProvidersConfig[provider] || {});
			const merged = { ...existingProviderConf };

			// Only update API key if provided and non-empty
			if (providerConfig.apiKey !== undefined && providerConfig.apiKey !== '') {
				merged.apiKey = providerConfig.apiKey;
			}
			// Replace models array if provided
			if (providerConfig.models !== undefined) {
				merged.models = providerConfig.models;
			}
			// Handle baseUrl
			if (providerConfig.baseUrl !== undefined) {
				if (providerConfig.baseUrl === '') {
					delete merged.baseUrl;
				} else {
					merged.baseUrl = providerConfig.baseUrl;
				}
			}

			// Clean up old `model` field if it exists
			delete merged.model;

			existingProvidersConfig[provider] = merged;
		}

		const activeProvider = provider || existing?.provider || 'anthropic';
		const systemPrompt = customSystemPrompt !== undefined
			? (customSystemPrompt || null) // empty string becomes null
			: (existing?.customSystemPrompt || null);

		// Clamp the agent-round cap to a safe range.
		let rounds = existing?.maxAgentRounds ?? 20;
		if (typeof maxAgentRounds === 'number' && Number.isFinite(maxAgentRounds)) {
			rounds = Math.max(1, Math.min(200, Math.floor(maxAgentRounds)));
		}

		if (existing) {
			await db
				.update(userAiConfig)
				.set({
					provider: activeProvider,
					providersConfig: JSON.stringify(existingProvidersConfig),
					customSystemPrompt: systemPrompt,
					maxAgentRounds: rounds,
					updatedAt: new Date()
				})
				.where(eq(userAiConfig.id, existing.id));
		} else {
			await db.insert(userAiConfig).values({
				id: uuidv4(),
				userId: locals.user.id,
				provider: activeProvider,
				providersConfig: JSON.stringify(existingProvidersConfig),
				customSystemPrompt: systemPrompt,
				maxAgentRounds: rounds,
				createdAt: new Date(),
				updatedAt: new Date()
			});
		}

		return json({ success: true });
	} catch (error) {
		console.error('Error saving AI config:', error);
		return json({ error: 'Failed to save AI configuration' }, { status: 500 });
	}
};
