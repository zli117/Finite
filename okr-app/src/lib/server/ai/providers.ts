/**
 * AI Provider Abstraction
 * Unified interface for calling different LLM providers using plain fetch().
 */

export interface AiMessage {
	role: 'user' | 'assistant';
	content: string;
}

export interface AiProviderConfig {
	apiKey?: string;
	model?: string;
	baseUrl?: string;
}

export interface AiResponse {
	content: string;
	error?: string;
	/** True when the model was halted by a stop sequence (so the sequence is NOT in `content`). */
	stoppedOnSequence?: boolean;
}

export interface AiSendOptions {
	/**
	 * Stop sequences. The model halts generation when one is emitted; the matched
	 * text is NOT included in the returned content. Used for tool-use one-at-a-time
	 * pacing.
	 */
	stopSequences?: string[];
}

export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';

export const PROVIDER_DEFAULTS: Record<AiProvider, { model?: string; baseUrl?: string; label: string }> = {
	anthropic: { model: 'claude-sonnet-4-5-20250929', label: 'Anthropic' },
	openai: { model: 'gpt-4o', label: 'OpenAI' },
	gemini: { model: 'gemini-2.0-flash', label: 'Gemini' },
	openrouter: { label: 'OpenRouter' },
	ollama: { baseUrl: 'http://localhost:11434', label: 'Ollama' }
};

export const SUGGESTED_MODELS: Record<AiProvider, { id: string; label: string }[]> = {
	anthropic: [
		{ id: 'claude-opus-4-6', label: 'Opus' },
		{ id: 'claude-sonnet-4-5-20250929', label: 'Sonnet' },
		{ id: 'claude-haiku-4-5-20251001', label: 'Haiku' }
	],
	openai: [
		{ id: 'gpt-4o', label: 'GPT-4o' },
		{ id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
		{ id: 'o1', label: 'o1' }
	],
	gemini: [
		{ id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
		{ id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }
	],
	openrouter: [],
	ollama: []
};

const TIMEOUT_MS = 60_000;

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(url, { ...options, signal: controller.signal });
		return response;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * POST to Anthropic with automatic retry on 429 (rate limit) and 529 (overload).
 * Honors the `retry-after` header when present; otherwise uses exponential backoff
 * capped at the timeout budget.
 */
async function anthropicFetchWithRetry(body: unknown, apiKey: string): Promise<Response> {
	const maxAttempts = 4;
	let attempt = 0;
	let lastResponse: Response | null = null;
	while (attempt < maxAttempts) {
		const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify(body)
		});
		if (response.status !== 429 && response.status !== 529) return response;
		lastResponse = response;
		attempt += 1;
		if (attempt >= maxAttempts) break;
		const retryAfter = response.headers.get('retry-after');
		const headerWait = retryAfter ? parseInt(retryAfter, 10) * 1000 : NaN;
		// Exponential backoff: 1s, 2s, 4s. Header `retry-after` wins if present.
		const backoffMs = Number.isFinite(headerWait) ? headerWait : 1000 * Math.pow(2, attempt - 1);
		await new Promise((r) => setTimeout(r, Math.min(backoffMs, 8000)));
	}
	return lastResponse!;
}

async function sendAnthropicMessage(
	config: AiProviderConfig,
	systemPrompt: string,
	messages: AiMessage[],
	options?: AiSendOptions
): Promise<AiResponse> {
	const model = config.model || PROVIDER_DEFAULTS.anthropic.model!;

	// Prompt caching: mark the (large, stable) system prompt as cacheable, and
	// mark the last message as a second breakpoint so the growing conversation
	// prefix is also cached across agent-loop rounds. Anthropic allows up to 4
	// cache_control breakpoints; we use 2.
	const systemBlocks = [
		{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
	];

	type ContentBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };
	const wireMessages: { role: 'user' | 'assistant'; content: ContentBlock[] }[] = messages.map(
		(m) => ({
			role: m.role,
			content: [{ type: 'text', text: m.content }]
		})
	);
	if (wireMessages.length > 0) {
		const last = wireMessages[wireMessages.length - 1];
		last.content[last.content.length - 1].cache_control = { type: 'ephemeral' };
	}

	const body: Record<string, unknown> = {
		model,
		max_tokens: 4096,
		system: systemBlocks,
		messages: wireMessages
	};
	if (options?.stopSequences?.length) body.stop_sequences = options.stopSequences;

	const response = await anthropicFetchWithRetry(body, config.apiKey!);

	if (!response.ok) {
		const error = await response.json().catch(() => ({}));
		if (response.status === 401) return { content: '', error: 'Invalid Anthropic API key' };
		if (response.status === 429) return { content: '', error: 'Rate limit exceeded. Try again later.' };
		return { content: '', error: (error as { error?: { message?: string } }).error?.message || `Anthropic error: ${response.status}` };
	}

	const data = (await response.json()) as {
		content?: { type: string; text: string }[];
		stop_reason?: string;
	};
	const text = data.content?.[0]?.text || '';
	return { content: text, stoppedOnSequence: data.stop_reason === 'stop_sequence' };
}

async function sendOpenAiMessage(
	config: AiProviderConfig,
	systemPrompt: string,
	messages: AiMessage[],
	baseUrl = 'https://api.openai.com',
	options?: AiSendOptions
): Promise<AiResponse> {
	const model = config.model || PROVIDER_DEFAULTS.openai.model!;

	const body: Record<string, unknown> = {
		model,
		max_tokens: 4096,
		messages: [
			{ role: 'system', content: systemPrompt },
			...messages.map((m) => ({ role: m.role, content: m.content }))
		]
	};
	if (options?.stopSequences?.length) body.stop = options.stopSequences;

	const response = await fetchWithTimeout(`${baseUrl}/v1/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.apiKey}`
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({}));
		if (response.status === 401) return { content: '', error: 'Invalid API key' };
		if (response.status === 429) return { content: '', error: 'Rate limit exceeded. Try again later.' };
		return { content: '', error: (error as { error?: { message?: string } }).error?.message || `API error: ${response.status}` };
	}

	const data = (await response.json()) as {
		choices?: { message?: { content?: string }; finish_reason?: string }[];
	};
	const text = data.choices?.[0]?.message?.content || '';
	const stoppedOnSequence = data.choices?.[0]?.finish_reason === 'stop';
	return { content: text, stoppedOnSequence };
}

async function sendGeminiMessage(
	config: AiProviderConfig,
	systemPrompt: string,
	messages: AiMessage[],
	options?: AiSendOptions
): Promise<AiResponse> {
	const model = config.model || PROVIDER_DEFAULTS.gemini.model!;

	const contents = messages.map((m) => ({
		role: m.role === 'assistant' ? 'model' : 'user',
		parts: [{ text: m.content }]
	}));

	const body: Record<string, unknown> = {
		systemInstruction: { parts: [{ text: systemPrompt }] },
		contents
	};
	if (options?.stopSequences?.length) {
		body.generationConfig = { stopSequences: options.stopSequences };
	}

	const response = await fetchWithTimeout(
		`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
			body: JSON.stringify(body)
		}
	);

	if (!response.ok) {
		const error = await response.json().catch(() => ({}));
		if (response.status === 400 || response.status === 403) return { content: '', error: 'Invalid Gemini API key or model' };
		if (response.status === 429) return { content: '', error: 'Rate limit exceeded. Try again later.' };
		return { content: '', error: (error as { error?: { message?: string } }).error?.message || `Gemini error: ${response.status}` };
	}

	const data = (await response.json()) as {
		candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
	};
	const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
	const stoppedOnSequence = data.candidates?.[0]?.finishReason === 'STOP';
	return { content: text, stoppedOnSequence };
}

async function sendOpenRouterMessage(
	config: AiProviderConfig,
	systemPrompt: string,
	messages: AiMessage[],
	options?: AiSendOptions
): Promise<AiResponse> {
	if (!config.model) {
		return { content: '', error: 'Model is required for OpenRouter' };
	}

	const body: Record<string, unknown> = {
		model: config.model,
		max_tokens: 4096,
		messages: [
			{ role: 'system', content: systemPrompt },
			...messages.map((m) => ({ role: m.role, content: m.content }))
		]
	};
	if (options?.stopSequences?.length) body.stop = options.stopSequences;

	const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.apiKey}`,
			'HTTP-Referer': 'https://getruok.app',
			'X-Title': 'RUOK'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({}));
		if (response.status === 401) return { content: '', error: 'Invalid OpenRouter API key' };
		if (response.status === 429) return { content: '', error: 'Rate limit exceeded. Try again later.' };
		return { content: '', error: (error as { error?: { message?: string } }).error?.message || `OpenRouter error: ${response.status}` };
	}

	const data = (await response.json()) as {
		choices?: { message?: { content?: string }; finish_reason?: string }[];
	};
	const text = data.choices?.[0]?.message?.content || '';
	const stoppedOnSequence = data.choices?.[0]?.finish_reason === 'stop';
	return { content: text, stoppedOnSequence };
}

async function sendOllamaMessage(
	config: AiProviderConfig,
	systemPrompt: string,
	messages: AiMessage[],
	options?: AiSendOptions
): Promise<AiResponse> {
	if (!config.model) {
		return { content: '', error: 'Model is required for Ollama' };
	}

	const baseUrl = config.baseUrl || PROVIDER_DEFAULTS.ollama.baseUrl!;

	const body: Record<string, unknown> = {
		model: config.model,
		stream: false,
		messages: [
			{ role: 'system', content: systemPrompt },
			...messages.map((m) => ({ role: m.role, content: m.content }))
		]
	};
	if (options?.stopSequences?.length) {
		body.options = { stop: options.stopSequences };
	}

	const response = await fetchWithTimeout(`${baseUrl}/api/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		if (response.status === 404) return { content: '', error: `Model "${config.model}" not found in Ollama` };
		return { content: '', error: `Ollama error: ${response.status}` };
	}

	const data = (await response.json()) as { message?: { content?: string }; done_reason?: string };
	const text = data.message?.content || '';
	return { content: text, stoppedOnSequence: data.done_reason === 'stop' };
}

/**
 * Send a message to the specified AI provider
 */
export async function sendMessage(
	provider: AiProvider,
	config: AiProviderConfig,
	systemPrompt: string,
	messages: AiMessage[],
	options?: AiSendOptions
): Promise<AiResponse> {
	try {
		switch (provider) {
			case 'anthropic':
				return await sendAnthropicMessage(config, systemPrompt, messages, options);
			case 'openai':
				return await sendOpenAiMessage(config, systemPrompt, messages, undefined, options);
			case 'gemini':
				return await sendGeminiMessage(config, systemPrompt, messages, options);
			case 'openrouter':
				return await sendOpenRouterMessage(config, systemPrompt, messages, options);
			case 'ollama':
				return await sendOllamaMessage(config, systemPrompt, messages, options);
			default:
				return { content: '', error: `Unknown provider: ${provider}` };
		}
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			return { content: '', error: 'Request timed out (60s limit)' };
		}
		return {
			content: '',
			error: error instanceof Error ? error.message : 'Failed to contact AI provider'
		};
	}
}
