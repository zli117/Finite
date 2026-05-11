import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { userAiConfig } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { PROVIDER_DEFAULTS } from '$lib/server/ai/providers';
import { getDefaultPrompt, CONTEXT_ADDENDA } from '$lib/server/ai/system-prompt';

function maskApiKey(key: string): string {
	if (key.length > 8) return '***' + key.slice(-4);
	return '***';
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const config = await db.query.userAiConfig.findFirst({
		where: eq(userAiConfig.userId, locals.user.id)
	});

	// Mask API keys and normalize models for client-side display
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let maskedProvidersConfig: Record<string, Record<string, any>> | null = null;
	if (config?.providersConfig) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const parsed: Record<string, Record<string, any>> = JSON.parse(config.providersConfig);
		maskedProvidersConfig = {};
		for (const [provider, conf] of Object.entries(parsed)) {
			maskedProvidersConfig[provider] = { ...conf };
			// Normalize old model → models
			if (maskedProvidersConfig[provider].model && !maskedProvidersConfig[provider].models) {
				maskedProvidersConfig[provider].models = [maskedProvidersConfig[provider].model];
				delete maskedProvidersConfig[provider].model;
			}
			if (!maskedProvidersConfig[provider].models) {
				maskedProvidersConfig[provider].models = [];
			}
			// Mask API key
			if (maskedProvidersConfig[provider].apiKey) {
				maskedProvidersConfig[provider].apiKeyMasked = maskApiKey(
					maskedProvidersConfig[provider].apiKey
				);
				delete maskedProvidersConfig[provider].apiKey;
			}
		}
	}

	return {
		aiConfig: config
			? {
					provider: config.provider,
					providersConfig: maskedProvidersConfig,
					customSystemPrompt: config.customSystemPrompt
				}
			: null,
		providerDefaults: PROVIDER_DEFAULTS,
		defaultPrompt: getDefaultPrompt(),
		contextAddenda: {
			query: CONTEXT_ADDENDA.query || '(no additional instructions)',
			kr_progress: CONTEXT_ADDENDA.kr_progress,
			widget: CONTEXT_ADDENDA.widget,
			metric: CONTEXT_ADDENDA.metric,
			objectives: CONTEXT_ADDENDA.objectives,
			daily_plan: CONTEXT_ADDENDA.daily_plan,
			weekly_plan: CONTEXT_ADDENDA.weekly_plan,
			metrics_template: CONTEXT_ADDENDA.metrics_template
		}
	};
};
