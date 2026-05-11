import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { userAiConfig } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import {
	sendMessage,
	PROVIDER_DEFAULTS,
	type AiMessage,
	type AiProvider
} from '$lib/server/ai/providers';
import { buildSystemPrompt, type AiChatContext } from '$lib/server/ai/system-prompt';
import {
	TOOLS,
	parseToolCalls,
	stripToolCalls,
	executeTool,
	getUserToolContext,
	type ToolCall,
	type ToolCallResult,
	type PageContext
} from '$lib/server/ai/tools';

const MAX_AGENT_ROUNDS = 4;

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const {
			messages,
			provider: overrideProvider,
			model: overrideModel,
			context,
			contextData
		} = body as {
			messages: AiMessage[];
			provider?: AiProvider;
			model?: string;
			context?: AiChatContext;
			contextData?: Record<string, unknown>;
		};

		if (!messages || !Array.isArray(messages) || messages.length === 0) {
			return json({ error: 'Messages are required' }, { status: 400 });
		}

		const config = await db.query.userAiConfig.findFirst({
			where: eq(userAiConfig.userId, locals.user.id)
		});

		if (!config) {
			return json(
				{ error: 'AI not configured. Set up your AI provider in Settings → AI Assistant.' },
				{ status: 400 }
			);
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const providersConfig: Record<string, Record<string, any>> = config.providersConfig
			? JSON.parse(config.providersConfig)
			: {};

		const provider = overrideProvider || config.provider;
		const providerConfig = providersConfig[provider] || {};

		if (provider !== 'ollama' && !providerConfig.apiKey) {
			return json(
				{ error: `API key not configured for ${PROVIDER_DEFAULTS[provider]?.label || provider}` },
				{ status: 400 }
			);
		}

		const models: string[] =
			providerConfig.models || (providerConfig.model ? [providerConfig.model] : []);
		const resolvedModel = overrideModel || models[0] || PROVIDER_DEFAULTS[provider]?.model;

		const defaults = PROVIDER_DEFAULTS[provider];
		const finalConfig = {
			...defaults,
			...providerConfig,
			model: resolvedModel
		};

		const systemPrompt = await buildSystemPrompt(locals.user.id, context, contextData);

		// In assistant (tool-use) context, run the agent loop:
		// auto-execute read tools, return write tools as pending proposals.
		if (context === 'assistant') {
			const ctx = await getUserToolContext(locals.user.id);
			const workingMessages: AiMessage[] = [...messages];
			let lastText = '';
			let pendingWrites: ToolCall[] = [];
			const readResults: ToolCallResult[] = [];

			for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
				const response = await sendMessage(provider, finalConfig, systemPrompt, workingMessages);
				if (response.error) return json({ error: response.error }, { status: 502 });

				const calls = parseToolCalls(response.content);
				const reads: ToolCall[] = [];
				const writes: ToolCall[] = [];
				for (const c of calls) {
					const tool = TOOLS[c.name];
					if (tool?.category === 'read') reads.push(c);
					else writes.push(c);
				}

				// If no reads remain to execute, we're done — return text + any write proposals.
				if (reads.length === 0) {
					lastText = stripToolCalls(response.content);
					pendingWrites = writes;
					break;
				}

				// Execute reads, feed results back as a user message, continue the loop.
				// CRITICAL: discard any writes the model proposed in the same round —
				// they were generated BEFORE it could see the read results, so any IDs
				// they reference were either hallucinated or stale. Force the model to
				// re-propose writes in the next round with the real data in hand.
				const roundResults: ToolCallResult[] = [];
				for (const c of reads) roundResults.push(await executeTool(ctx, c));
				readResults.push(...roundResults);

				workingMessages.push({ role: 'assistant', content: response.content });
				let feedbackContent = formatToolResults(roundResults);
				if (writes.length > 0) {
					const ignoredList = writes
						.map((w) => `- ${w.name} (${JSON.stringify(w.args).slice(0, 120)})`)
						.join('\n');
					feedbackContent +=
						`\n\n<system_note>\nYou proposed ${writes.length} write tool call(s) in the same turn as read calls. They were NOT shown to the user and NOT executed, because they were generated before you saw the read results above — any IDs or values in them were guesses.\n\nIgnored:\n${ignoredList}\n\nIf you still want to propose these writes, do so now using the REAL ids and values from the tool_result above. Copy ids EXACTLY (full UUIDs) — never invent or shorten them.\n</system_note>`;
				}
				workingMessages.push({ role: 'user', content: feedbackContent });
			}

			return json({
				content: lastText,
				toolCalls: pendingWrites.map((c) => ({
					id: c.id,
					name: c.name,
					args: c.args,
					preview: previewFor(c),
					category: 'write' as const
				})),
				readResults: readResults.map((r) => ({
					id: r.id,
					name: r.name,
					ok: r.ok,
					error: r.error
				}))
			});
		}

		// Non-assistant contexts: existing single-shot behavior.
		const response = await sendMessage(provider, finalConfig, systemPrompt, messages);
		if (response.error) {
			return json({ error: response.error }, { status: 502 });
		}
		return json({ content: response.content });
	} catch (error) {
		console.error('AI chat error:', error);
		return json({ error: 'Failed to get AI response' }, { status: 500 });
	}
};

function formatToolResults(results: ToolCallResult[]): string {
	const blocks = results.map((r) => {
		const payload = r.ok ? JSON.stringify(r.result) : `ERROR: ${r.error}`;
		return `<tool_result name="${r.name}">\n${payload}\n</tool_result>`;
	});
	return blocks.join('\n');
}

function previewFor(c: ToolCall): string {
	const tool = TOOLS[c.name];
	if (!tool) return `${c.name}(${JSON.stringify(c.args)})`;
	try {
		return tool.preview(c.args);
	} catch {
		return tool.name;
	}
}
