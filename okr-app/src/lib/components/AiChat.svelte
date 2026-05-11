<script lang="ts">
	import { renderMarkdown } from '$lib/sanitize';
	import { tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	interface ToolCallProposal {
		id: string;
		name: string;
		args: Record<string, unknown>;
		preview: string;
		category: 'write';
	}

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

	interface AiMessage {
		role: 'user' | 'assistant';
		content: string;
		steps?: TranscriptStep[];
		toolCalls?: ToolCallProposal[];
		toolStatus?: Record<string, 'pending' | 'applied' | 'discarded' | 'failed'>;
		toolError?: Record<string, string>;
	}

	interface ParsedBlock {
		type: 'text' | 'code';
		content: string;
	}

	let {
		onCopyToEditor,
		hasConfig,
		configuredProviders = [],
		activeProvider = 'anthropic',
		providerModels = {},
		pendingCode = $bindable(''),
		context = 'query',
		contextData = {}
	}: {
		onCopyToEditor?: (code: string) => void;
		hasConfig: boolean;
		configuredProviders: string[];
		activeProvider: string;
		providerModels?: Record<string, string[]>;
		pendingCode?: string;
		context?: 'query' | 'kr_progress' | 'widget' | 'metric' | 'assistant';
		contextData?: Record<string, unknown>;
	} = $props();

	let messages = $state<AiMessage[]>([]);
	let expandedSteps = $state<Record<string, boolean>>({});

	function toggleStep(key: string) {
		expandedSteps[key] = !expandedSteps[key];
	}

	function prettyJson(value: unknown): string {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}

	function summarizeArgs(args: Record<string, unknown>): string {
		const keys = Object.keys(args);
		if (keys.length === 0) return '';
		const parts: string[] = [];
		for (const k of keys.slice(0, 3)) {
			const v = args[k];
			let s: string;
			if (typeof v === 'string') s = v.length > 40 ? v.slice(0, 40) + '…' : v;
			else if (v === null || v === undefined) s = String(v);
			else if (typeof v === 'object') s = '{…}';
			else s = String(v);
			parts.push(`${k}: ${s}`);
		}
		if (keys.length > 3) parts.push(`+${keys.length - 3}`);
		return parts.join(' · ');
	}
	let inputText = $state('');
	let loading = $state(false);
	let error = $state('');
	let providerOverride = $state<string | null>(null);
	const selectedProvider = $derived(providerOverride ?? activeProvider);
	let selectedModel = $state('');
	let messagesContainer = $state<HTMLDivElement | null>(null);
	let inputTextarea = $state<HTMLTextAreaElement | null>(null);

	let currentModels = $derived(providerModels[selectedProvider] || []);

	// Set initial model when provider changes
	$effect(() => {
		const models = providerModels[selectedProvider] || [];
		if (models.length > 0 && !models.includes(selectedModel)) {
			selectedModel = models[0];
		}
	});

	// When editor sends code to AI, populate the input
	$effect(() => {
		if (pendingCode) {
			inputText = "```\n" + pendingCode + "\n```\n";
			pendingCode = '';
			tick().then(() => {
				if (inputTextarea) {
					inputTextarea.focus();
					inputTextarea.setSelectionRange(0, 0);
				}
			});
		}
	});

	const providerLabels: Record<string, string> = {
		anthropic: 'Anthropic',
		openai: 'OpenAI',
		gemini: 'Gemini',
		openrouter: 'OpenRouter',
		ollama: 'Ollama'
	};

	const querySuggestions = [
		'Show my sleep trends this month',
		'Task completion rate by tag',
		'Weekly productivity report'
	];

	const assistantSuggestions = [
		'What\'s on my plate today?',
		'Add a 1h task tomorrow: review weekly plan',
		'List my objectives for this year'
	];

	const suggestions = $derived(context === 'assistant' ? assistantSuggestions : querySuggestions);

	function parseResponse(content: string): ParsedBlock[] {
		const blocks: ParsedBlock[] = [];
		const regex = /<code>([\s\S]*?)<\/code>/g;
		let lastIndex = 0;
		let match;

		while ((match = regex.exec(content)) !== null) {
			if (match.index > lastIndex) {
				blocks.push({ type: 'text', content: content.slice(lastIndex, match.index) });
			}
			blocks.push({ type: 'code', content: match[1].trim() });
			lastIndex = match.index + match[0].length;
		}

		if (lastIndex < content.length) {
			blocks.push({ type: 'text', content: content.slice(lastIndex) });
		}

		// If no <code> tags found, treat entire content as text
		if (blocks.length === 0) {
			blocks.push({ type: 'text', content });
		}

		return blocks;
	}


	async function scrollToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	async function copyToClipboard(text: string) {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Fallback: create a temporary textarea
			const ta = document.createElement('textarea');
			ta.value = text;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
		}
	}

	async function sendMessage(text?: string) {
		const messageText = text || inputText.trim();
		if (!messageText || loading) return;

		inputText = '';
		error = '';

		// Add user message
		messages = [...messages, { role: 'user', content: messageText }];
		await scrollToBottom();

		loading = true;

		try {
			// Strip tool metadata before sending — the server only expects role+content
			const wireMessages = messages.map((m) => ({ role: m.role, content: m.content }));

			const response = await fetch('/api/ai/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: wireMessages,
					provider: selectedProvider !== activeProvider ? selectedProvider : undefined,
					model: selectedModel || undefined,
					context,
					contextData: Object.keys(contextData).length > 0 ? contextData : undefined
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to get response');
			}

			const assistantMsg: AiMessage = { role: 'assistant', content: result.content || '' };
			if (Array.isArray(result.steps) && result.steps.length > 0) {
				assistantMsg.steps = result.steps;
			}
			if (Array.isArray(result.toolCalls) && result.toolCalls.length > 0) {
				assistantMsg.toolCalls = result.toolCalls;
				assistantMsg.toolStatus = Object.fromEntries(
					result.toolCalls.map((c: ToolCallProposal) => [c.id, 'pending'])
				);
				assistantMsg.toolError = {};
			}
			messages = [...messages, assistantMsg];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to get AI response';
		} finally {
			loading = false;
			await scrollToBottom();
		}
	}

	async function applyToolCall(msgIndex: number, call: ToolCallProposal) {
		const msg = messages[msgIndex];
		if (!msg.toolStatus || msg.toolStatus[call.id] !== 'pending') return;
		msg.toolStatus[call.id] = 'applied';
		messages = [...messages];
		try {
			const response = await fetch('/api/ai/tool', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: call.id, name: call.name, args: call.args })
			});
			const result = await response.json();
			if (!response.ok || !result.ok) {
				msg.toolStatus![call.id] = 'failed';
				msg.toolError![call.id] = result.error || 'Failed to apply';
				messages = [...messages];
			} else {
				// Refresh the current page so the edit is reflected immediately.
				// SSE already broadcasts to other tabs; this covers the originating tab
				// without waiting for the event round-trip.
				invalidateAll();
			}
		} catch (err) {
			msg.toolStatus![call.id] = 'failed';
			msg.toolError![call.id] = err instanceof Error ? err.message : 'Failed to apply';
			messages = [...messages];
		}
	}

	function discardToolCall(msgIndex: number, call: ToolCallProposal) {
		const msg = messages[msgIndex];
		if (!msg.toolStatus || msg.toolStatus[call.id] !== 'pending') return;
		msg.toolStatus[call.id] = 'discarded';
		messages = [...messages];
	}

	async function applyAllPending(msgIndex: number) {
		const msg = messages[msgIndex];
		if (!msg.toolCalls || !msg.toolStatus) return;
		for (const c of msg.toolCalls) {
			if (msg.toolStatus[c.id] === 'pending') {
				await applyToolCall(msgIndex, c);
			}
		}
	}

	async function switchProvider(newProvider: string) {
		providerOverride = newProvider;
		// Update the active provider on the server
		try {
			await fetch('/api/ai/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ provider: newProvider })
			});
		} catch {
			// Non-critical — continue using it locally
		}
	}

	function clearChat() {
		messages = [];
		error = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}
</script>

<div class="ai-chat">
	<div class="chat-header">
		<h3>AI Assistant</h3>
		<div class="header-actions">
			{#if configuredProviders.length > 1}
				<select
					class="provider-select"
					value={selectedProvider}
					onchange={(e) => switchProvider(e.currentTarget.value)}
				>
					{#each configuredProviders as provider}
						<option value={provider}>{providerLabels[provider] || provider}</option>
					{/each}
				</select>
			{:else if configuredProviders.length === 1}
				<span class="provider-label">{providerLabels[configuredProviders[0]] || configuredProviders[0]}</span>
			{/if}
			{#if currentModels.length > 1}
				<select
					class="provider-select"
					value={selectedModel}
					onchange={(e) => selectedModel = e.currentTarget.value}
				>
					{#each currentModels as m}
						<option value={m}>{m.split('/').pop()}</option>
					{/each}
				</select>
			{:else if currentModels.length === 1}
				<span class="provider-label">{currentModels[0].split('/').pop()}</span>
			{/if}
			{#if messages.length > 0}
				<button class="btn-icon" onclick={clearChat} title="New chat">
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>
					</svg>
				</button>
			{/if}
		</div>
	</div>

	<div class="chat-messages" bind:this={messagesContainer}>
		{#if !hasConfig}
			<div class="setup-prompt">
				<p>Configure your AI provider to get started.</p>
				<a href="/settings/ai" class="btn btn-primary btn-sm">Set up AI Provider</a>
			</div>
		{:else if messages.length === 0}
			<div class="welcome">
				<p class="welcome-text">Ask me to write queries for your data.</p>
				<div class="suggestions">
					{#each suggestions as suggestion}
						<button class="suggestion-btn" onclick={() => sendMessage(suggestion)}>
							{suggestion}
						</button>
					{/each}
				</div>
			</div>
		{:else}
			{#each messages as message, msgIndex}
				<div class="message message-{message.role}">
					<div class="message-role">{message.role === 'user' ? 'You' : 'AI'}</div>
					{#if message.role === 'user'}
						<div class="message-content">{message.content}</div>
					{:else}
						{#if message.steps && message.steps.length > 0}
							{#each message.steps as step, stepIdx}
								{#if step.type === 'text'}
									{#each parseResponse(step.content) as block}
										{#if block.type === 'text'}
											<div class="message-text">{@html renderMarkdown(block.content)}</div>
										{:else}
											<div class="code-block">
												<pre><code>{block.content}</code></pre>
												<div class="code-actions">
													{#if onCopyToEditor}
														<button class="btn btn-primary btn-xs" onclick={() => onCopyToEditor?.(block.content)}>Copy to Editor</button>
													{/if}
													<button class="btn btn-secondary btn-xs" onclick={() => copyToClipboard(block.content)}>Copy</button>
												</div>
											</div>
										{/if}
									{/each}
								{:else}
									{@const stepKey = `${msgIndex}-${stepIdx}`}
									{@const expanded = expandedSteps[stepKey]}
									<div class="step-call" class:step-call-err={!step.ok}>
										<button class="step-summary" onclick={() => toggleStep(stepKey)} aria-expanded={expanded}>
											<span class="step-chevron" class:step-chevron-open={expanded}>▸</span>
											<span class="step-icon">{step.ok ? '✓' : '✗'}</span>
											<span class="step-name">{step.name}</span>
											<span class="step-preview">{summarizeArgs(step.args)}</span>
										</button>
										{#if expanded}
											<div class="step-body">
												<div class="step-section">
													<div class="step-section-label">Arguments</div>
													<pre class="step-json">{prettyJson(step.args)}</pre>
												</div>
												<div class="step-section">
													<div class="step-section-label">{step.ok ? 'Result' : 'Error'}</div>
													<pre class="step-json">{step.ok ? prettyJson(step.result) : step.error ?? 'unknown error'}</pre>
												</div>
											</div>
										{/if}
									</div>
								{/if}
							{/each}
						{:else}
							{#each parseResponse(message.content) as block}
								{#if block.type === 'text'}
									<div class="message-text">{@html renderMarkdown(block.content)}</div>
								{:else}
									<div class="code-block">
										<pre><code>{block.content}</code></pre>
										<div class="code-actions">
											{#if onCopyToEditor}
												<button class="btn btn-primary btn-xs" onclick={() => onCopyToEditor?.(block.content)}>Copy to Editor</button>
											{/if}
											<button class="btn btn-secondary btn-xs" onclick={() => copyToClipboard(block.content)}>Copy</button>
										</div>
									</div>
								{/if}
							{/each}
						{/if}
						{#if message.toolCalls && message.toolCalls.length > 0}
							{@const pendingCount = message.toolCalls.filter(
								(c) => message.toolStatus?.[c.id] === 'pending'
							).length}
							<div class="tool-calls">
								{#each message.toolCalls as call}
									{@const status = message.toolStatus?.[call.id] ?? 'pending'}
									<div class="tool-card tool-card-{status}">
										<div class="tool-card-body">
											<div class="tool-name">{call.name}</div>
											<div class="tool-preview">{call.preview}</div>
											{#if status === 'failed' && message.toolError?.[call.id]}
												<div class="tool-error">{message.toolError[call.id]}</div>
											{/if}
										</div>
										<div class="tool-actions">
											{#if status === 'pending'}
												<button
													class="btn btn-primary btn-xs"
													onclick={() => applyToolCall(msgIndex, call)}
												>
													Apply
												</button>
												<button
													class="btn btn-secondary btn-xs"
													onclick={() => discardToolCall(msgIndex, call)}
												>
													Discard
												</button>
											{:else if status === 'applied'}
												<span class="tool-status tool-status-applied">Applied</span>
											{:else if status === 'discarded'}
												<span class="tool-status">Discarded</span>
											{:else if status === 'failed'}
												<span class="tool-status tool-status-failed">Failed</span>
											{/if}
										</div>
									</div>
								{/each}
								{#if pendingCount > 1}
									<button
										class="btn btn-primary btn-xs apply-all"
										onclick={() => applyAllPending(msgIndex)}
									>
										Apply all {pendingCount}
									</button>
								{/if}
							</div>
						{/if}
					{/if}
				</div>
			{/each}
		{/if}

		{#if loading}
			<div class="message message-assistant">
				<div class="message-role">AI</div>
				<div class="typing-indicator">
					<span></span><span></span><span></span>
				</div>
			</div>
		{/if}
	</div>

	{#if error}
		<div class="chat-error">{error}</div>
	{/if}

	<div class="chat-input">
		<textarea
			bind:this={inputTextarea}
			bind:value={inputText}
			placeholder={hasConfig ? 'Ask about your data...' : 'Configure AI provider first'}
			onkeydown={handleKeydown}
			disabled={loading || !hasConfig}
			rows="2"
		></textarea>
		<button
			class="btn btn-primary send-btn"
			onclick={() => sendMessage()}
			disabled={loading || !inputText.trim() || !hasConfig}
		>
			{#if loading}
				...
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
				</svg>
			{/if}
		</button>
	</div>
</div>

<style>
	.ai-chat {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--color-surface, white);
		overflow: hidden;
	}

	.chat-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
		min-height: 65px;
	}

	.chat-header h3 {
		margin: 0;
		font-size: 0.875rem;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.provider-select {
		font-size: 0.75rem;
		padding: 2px 6px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		cursor: pointer;
	}

	.provider-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.btn-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.btn-icon:hover {
		background-color: var(--color-bg-hover, #f3f4f6);
		color: var(--color-text);
	}

	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.setup-prompt {
		text-align: center;
		padding: var(--spacing-xl) var(--spacing-md);
		color: var(--color-text-muted);
	}

	.setup-prompt p {
		margin: 0 0 var(--spacing-md);
		font-size: 0.875rem;
	}

	.welcome {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--spacing-md);
		gap: var(--spacing-sm);
	}

	.welcome-text {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin: 0;
	}

	.suggestions {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		width: 100%;
	}

	.suggestion-btn {
		display: block;
		width: 100%;
		text-align: left;
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		font-size: 0.8125rem;
		color: var(--color-text);
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
	}

	.suggestion-btn:hover {
		border-color: var(--color-primary);
		background: rgb(59 130 246 / 0.05);
	}

	/* Messages */
	.message {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.message-role {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.message-user .message-content {
		background: var(--color-bg);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.message-text {
		font-size: 0.8125rem;
		line-height: 1.6;
	}

	.message-text :global(p) {
		margin: 0 0 var(--spacing-xs);
	}

	.message-text :global(p:last-child) {
		margin-bottom: 0;
	}

	.message-text :global(code) {
		background: var(--color-bg);
		padding: 1px 4px;
		border-radius: 3px;
		font-size: 0.75rem;
	}

	.message-text :global(pre) {
		background: var(--color-bg);
		padding: var(--spacing-sm);
		border-radius: var(--radius-sm);
		overflow-x: auto;
		font-size: 0.75rem;
		margin: var(--spacing-xs) 0;
	}

	.message-text :global(pre code) {
		background: none;
		padding: 0;
	}

	/* Code blocks from <code> tags */
	.code-block {
		margin: var(--spacing-xs) 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.code-block pre {
		margin: 0;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		overflow-x: auto;
		font-size: 0.75rem;
		line-height: 1.5;
		max-height: 300px;
		overflow-y: auto;
	}

	.code-block pre code {
		font-family: monospace;
	}

	.code-actions {
		display: flex;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		border-top: 1px solid var(--color-border);
		background: var(--color-surface, white);
	}

	.btn-xs {
		padding: 2px 8px;
		font-size: 0.6875rem;
	}

	/* Typing animation */
	.typing-indicator {
		display: flex;
		gap: 4px;
		padding: var(--spacing-sm) 0;
	}

	.typing-indicator span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: var(--color-text-muted);
		animation: typing 1.4s infinite ease-in-out;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing {
		0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
		30% { opacity: 1; transform: translateY(-4px); }
	}

	/* Error */
	.chat-error {
		padding: var(--spacing-xs) var(--spacing-md);
		background: #fef2f2;
		border-top: 1px solid #fecaca;
		color: var(--color-error);
		font-size: 0.75rem;
		flex-shrink: 0;
	}

	/* Input */
	.chat-input {
		display: flex;
		align-items: stretch;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm);
		border-top: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.chat-input textarea {
		flex: 1;
		resize: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-sm);
		font-size: 0.8125rem;
		font-family: inherit;
		line-height: 1.4;
		min-height: 0;
	}

	.chat-input textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.send-btn {
		flex-shrink: 0;
		width: 40px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
	}

	/* Tool call cards (assistant context) */
	/* Inline tool-call step (collapsible, shown alongside text in the transcript) */
	.step-call {
		margin: 4px 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		overflow: hidden;
	}

	.step-call-err {
		border-color: #fecaca;
		background: #fef2f2;
	}

	.step-summary {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 4px 8px;
		border: none;
		background: transparent;
		font-size: 0.75rem;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		color: var(--color-text);
	}

	.step-summary:hover {
		background: rgb(0 0 0 / 0.03);
	}

	.step-chevron {
		display: inline-block;
		transition: transform 0.15s;
		font-size: 0.625rem;
		color: var(--color-text-muted);
	}

	.step-chevron-open {
		transform: rotate(90deg);
	}

	.step-icon {
		font-weight: 600;
		color: #15803d;
	}

	.step-call-err .step-icon {
		color: var(--color-error);
	}

	.step-name {
		font-family: monospace;
		font-weight: 600;
	}

	.step-preview {
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.step-body {
		padding: 6px 10px 10px;
		border-top: 1px solid var(--color-border);
		background: var(--color-surface, white);
	}

	.step-section {
		margin-top: 6px;
	}

	.step-section:first-child {
		margin-top: 2px;
	}

	.step-section-label {
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		margin-bottom: 2px;
	}

	.step-json {
		margin: 0;
		padding: 6px 8px;
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		font-size: 0.6875rem;
		line-height: 1.4;
		max-height: 220px;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.tool-calls {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		margin-top: var(--spacing-xs);
	}

	.tool-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface, white);
	}

	.tool-card-applied {
		border-color: #bbf7d0;
		background: #f0fdf4;
	}

	.tool-card-discarded {
		opacity: 0.55;
	}

	.tool-card-failed {
		border-color: #fecaca;
		background: #fef2f2;
	}

	.tool-card-body {
		min-width: 0;
		flex: 1;
	}

	.tool-name {
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		font-weight: 600;
	}

	.tool-preview {
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--color-text);
		word-break: break-word;
	}

	.tool-error {
		font-size: 0.75rem;
		color: var(--color-error);
		margin-top: 2px;
	}

	.tool-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.tool-status {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
		padding: 2px 8px;
	}

	.tool-status-applied {
		color: #15803d;
	}

	.tool-status-failed {
		color: var(--color-error);
	}

	.apply-all {
		align-self: flex-end;
	}
</style>
