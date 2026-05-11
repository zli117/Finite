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
	type ToolCallResult
} from '$lib/server/ai/tools';

const MAX_AGENT_ROUNDS = 20;

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
			// Interleaved transcript: text segments and tool-call records, in order.
			type TranscriptStep =
				| { type: 'text'; content: string }
				| {
						type: 'tool_call';
						id: string;
						name: string;
						args: Record<string, unknown>;
						ok: boolean;
						result?: unknown;
						error?: string;
					};
			const steps: TranscriptStep[] = [];
			let pendingWrites: ToolCall[] = [];
			let exhausted = true;

			// Stop the model after each tool call so it can't speculatively emit a
			// follow-up call before seeing the result. The stop sequence itself is
			// NOT included in the returned content, so we re-append it before parsing.
			const TOOL_CALL_CLOSE = '</tool_call>';
			const stopOptions = { stopSequences: [TOOL_CALL_CLOSE] };

			for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
				const response = await sendMessage(
					provider,
					finalConfig,
					systemPrompt,
					workingMessages,
					stopOptions
				);
				if (response.error) return json({ error: response.error }, { status: 502 });

				let assistantContent = response.content;
				if (response.stoppedOnSequence && assistantContent.includes('<tool_call')) {
					assistantContent = assistantContent + TOOL_CALL_CLOSE;
				}

				// Capture per-round narration so the user sees the running commentary
				// in order, alongside the tool calls.
				const roundText = stripToolCalls(assistantContent).trim();
				if (roundText) steps.push({ type: 'text', content: roundText });

				// Enforce one-tool-call-per-turn: only honor the first call.
				const firstCall = parseToolCalls(assistantContent)[0];

				if (!firstCall) {
					exhausted = false;
					break;
				}

				const tool = TOOLS[firstCall.name];

				if (!tool) {
					steps.push({
						type: 'tool_call',
						id: firstCall.id,
						name: firstCall.name,
						args: firstCall.args,
						ok: false,
						error: 'Unknown tool'
					});
					workingMessages.push({ role: 'assistant', content: assistantContent });
					workingMessages.push({
						role: 'user',
						content: `<tool_result name="${firstCall.name}">\nERROR: Unknown tool. Available tools are listed in the system prompt.\n</tool_result>`
					});
					continue;
				}

				if (tool.category === 'write') {
					pendingWrites = [firstCall];
					exhausted = false;
					break;
				}

				// Read → execute, record in transcript, feed back to model.
				const result = await executeTool(ctx, firstCall);
				steps.push({
					type: 'tool_call',
					id: firstCall.id,
					name: firstCall.name,
					args: firstCall.args,
					ok: result.ok,
					result: result.result,
					error: result.error
				});
				workingMessages.push({ role: 'assistant', content: assistantContent });
				workingMessages.push({ role: 'user', content: formatToolResults([result]) });
			}

			if (exhausted) {
				steps.push({
					type: 'text',
					content: `_I hit my tool-call budget (${MAX_AGENT_ROUNDS} steps) before finishing. Reply "continue" if you want me to keep going._`
				});
			}

			return json({
				steps,
				toolCalls: pendingWrites.map((c) => ({
					id: c.id,
					name: c.name,
					args: c.args,
					preview: previewFor(c),
					category: 'write' as const
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
