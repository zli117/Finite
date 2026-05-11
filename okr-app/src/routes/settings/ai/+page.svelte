<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	type Provider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';

	const providers: { id: Provider; label: string; needsApiKey: boolean; needsBaseUrl: boolean }[] = [
		{ id: 'anthropic', label: 'Anthropic', needsApiKey: true, needsBaseUrl: false },
		{ id: 'openai', label: 'OpenAI', needsApiKey: true, needsBaseUrl: false },
		{ id: 'gemini', label: 'Gemini', needsApiKey: true, needsBaseUrl: false },
		{ id: 'openrouter', label: 'OpenRouter', needsApiKey: true, needsBaseUrl: false },
		{ id: 'ollama', label: 'Ollama', needsApiKey: false, needsBaseUrl: true }
	];

	// Per-provider form state
	let apiKeys = $state<Record<string, string>>({});
	let baseUrls = $state<Record<string, string>>({});
	let newModelInputs = $state<Record<string, string>>({});
	let showApiKeys = $state<Record<string, boolean>>({});
	let customSystemPromptOverride = $state<string | null>(null);
	let customSystemPrompt = $derived(customSystemPromptOverride ?? data.aiConfig?.customSystemPrompt ?? '');
	let showPromptEditor = $state(false);

	let maxAgentRoundsOverride = $state<number | null>(null);
	let maxAgentRoundsInput = $derived(
		maxAgentRoundsOverride ?? data.aiConfig?.maxAgentRounds ?? 20
	);
	let savingMaxRounds = $state(false);

	let saving = $state<Record<string, boolean>>({});
	let deleting = $state<Record<string, boolean>>({});
	let testing = $state<Record<string, boolean>>({});
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	function getProviderConfig(provider: Provider) {
		const config = data.aiConfig?.providersConfig?.[provider];
		return {
			apiKeyMasked: config?.apiKeyMasked || '',
			models: (config?.models as string[]) || [],
			baseUrl: config?.baseUrl || ''
		};
	}

	function isConfigured(provider: Provider): boolean {
		const config = data.aiConfig?.providersConfig?.[provider];
		if (!config) return false;
		const providerInfo = providers.find(p => p.id === provider);
		if (providerInfo?.needsApiKey && !config.apiKeyMasked) return false;
		if (providerInfo?.needsBaseUrl && !config.baseUrl) return false;
		return true;
	}

	function getModelCount(provider: Provider): number {
		return getProviderConfig(provider).models.length;
	}

	function getSummary(provider: Provider): string {
		if (!isConfigured(provider)) return 'not configured';
		const count = getModelCount(provider);
		if (count === 0) return 'configured, no models';
		return `${count} model${count !== 1 ? 's' : ''}`;
	}

	async function refreshConfig() {
		await invalidateAll();
	}

	async function saveProviderKey(provider: Provider) {
		const key = apiKeys[provider];
		const url = baseUrls[provider];
		if (!key && !url) return;

		saving = { ...saving, [provider]: true };
		message = null;

		try {
			const providerConfig: Record<string, string | string[]> = {};
			if (key) providerConfig.apiKey = key;
			const providerInfo = providers.find(p => p.id === provider);
			if (providerInfo?.needsBaseUrl && url) providerConfig.baseUrl = url;

			// Preserve existing models
			const existing = getProviderConfig(provider);
			providerConfig.models = existing.models;

			const response = await fetch('/api/ai/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ provider, providerConfig })
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save');
			}

			message = { type: 'success', text: `${providers.find(p => p.id === provider)?.label} credentials saved` };
			apiKeys = { ...apiKeys, [provider]: '' };
			showApiKeys = { ...showApiKeys, [provider]: false };
			await refreshConfig();
		} catch (error) {
			message = { type: 'error', text: error instanceof Error ? error.message : 'Failed to save' };
		} finally {
			saving = { ...saving, [provider]: false };
		}
	}

	async function clearApiKey(provider: Provider) {
		saving = { ...saving, [provider]: true };
		message = null;

		try {
			const response = await fetch('/api/ai/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ clearApiKey: provider })
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to remove key');
			}

			message = { type: 'success', text: `${providers.find(p => p.id === provider)?.label} API key removed` };
			await refreshConfig();
		} catch (error) {
			message = { type: 'error', text: error instanceof Error ? error.message : 'Failed to remove key' };
		} finally {
			saving = { ...saving, [provider]: false };
		}
	}

	async function addModel(provider: Provider, modelId: string) {
		if (!modelId.trim()) return;
		const existing = getProviderConfig(provider);
		if (existing.models.includes(modelId)) return;

		saving = { ...saving, [provider]: true };
		message = null;

		try {
			const models = [...existing.models, modelId];
			const response = await fetch('/api/ai/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ provider, providerConfig: { models } })
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save');
			}

			newModelInputs = { ...newModelInputs, [provider]: '' };
			await refreshConfig();
		} catch (error) {
			message = { type: 'error', text: error instanceof Error ? error.message : 'Failed to add model' };
		} finally {
			saving = { ...saving, [provider]: false };
		}
	}

	async function removeModel(provider: Provider, modelId: string) {
		const existing = getProviderConfig(provider);
		const models = existing.models.filter((m: string) => m !== modelId);

		saving = { ...saving, [provider]: true };

		try {
			const response = await fetch('/api/ai/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ provider, providerConfig: { models } })
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save');
			}

			await refreshConfig();
		} catch (error) {
			message = { type: 'error', text: error instanceof Error ? error.message : 'Failed to remove model' };
		} finally {
			saving = { ...saving, [provider]: false };
		}
	}

	async function deleteProviderConfig(provider: Provider) {
		deleting = { ...deleting, [provider]: true };
		message = null;

		try {
			const response = await fetch('/api/ai/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ deleteProvider: provider })
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to delete');
			}

			message = { type: 'success', text: `${providers.find(p => p.id === provider)?.label} configuration deleted` };
			await refreshConfig();
		} catch (error) {
			message = { type: 'error', text: error instanceof Error ? error.message : 'Failed to delete' };
		} finally {
			deleting = { ...deleting, [provider]: false };
		}
	}

	async function testConnection(provider: Provider) {
		testing = { ...testing, [provider]: true };
		message = null;

		try {
			const config = getProviderConfig(provider);
			const model = config.models[0]; // Use first configured model

			const response = await fetch('/api/ai/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: [{ role: 'user', content: 'Say "Connection successful!" and nothing else.' }],
					provider,
					model
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Connection test failed');
			}

			message = { type: 'success', text: `Connection successful! Response: "${result.content.slice(0, 100)}"` };
		} catch (error) {
			message = { type: 'error', text: error instanceof Error ? error.message : 'Connection test failed' };
		} finally {
			testing = { ...testing, [provider]: false };
		}
	}

	async function saveSystemPrompt() {
		saving = { ...saving, prompt: true };
		message = null;

		try {
			const response = await fetch('/api/ai/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ customSystemPrompt: customSystemPrompt || null })
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save');
			}

			message = { type: 'success', text: 'System prompt saved' };
		} catch (error) {
			message = { type: 'error', text: error instanceof Error ? error.message : 'Failed to save prompt' };
		} finally {
			saving = { ...saving, prompt: false };
		}
	}

	function resetPrompt() {
		customSystemPromptOverride = '';
	}

	async function saveMaxAgentRounds() {
		savingMaxRounds = true;
		message = null;
		try {
			const rounds = Math.max(1, Math.min(200, Math.floor(Number(maxAgentRoundsInput) || 20)));
			const response = await fetch('/api/ai/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ maxAgentRounds: rounds })
			});
			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save');
			}
			maxAgentRoundsOverride = rounds;
			message = { type: 'success', text: `Max agent rounds set to ${rounds}` };
		} catch (error) {
			message = {
				type: 'error',
				text: error instanceof Error ? error.message : 'Failed to save agent rounds'
			};
		} finally {
			savingMaxRounds = false;
		}
	}
</script>

<svelte:head>
	<title>AI Assistant Settings - RUOK</title>
</svelte:head>

<div class="settings-page">
	<header class="page-header">
		<a href="/settings" class="back-link">
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
			Back to Settings
		</a>
		<h1>AI Assistant</h1>
		<p class="text-muted">Configure your LLM providers for AI-powered code generation</p>
	</header>

	{#if message}
		<div class="message" class:success={message.type === 'success'} class:error={message.type === 'error'}>
			{message.text}
		</div>
	{/if}

	<div class="settings-grid">
		<h2 class="section-heading">Provider Connections</h2>
		{#each providers as provider}
			{@const config = getProviderConfig(provider.id)}
			{@const configured = isConfigured(provider.id)}
			<details class="provider-section" open={configured}>
				<summary class="provider-header">
					<div class="provider-title">
						<span class="provider-name">{provider.label}</span>
						<span class="provider-summary" class:configured>
							{getSummary(provider.id)}
						</span>
					</div>
					<svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M6 9l6 6 6-6"/>
					</svg>
				</summary>

				<div class="provider-body">
					<!-- API Key / Base URL -->
					{#if provider.needsApiKey}
						<div class="field-group">
							<span class="field-label">
								API Key
								{#if config.apiKeyMasked}
									<span class="configured-badge">{config.apiKeyMasked}</span>
								{/if}
							</span>
							<div class="input-row">
								<input
									type={showApiKeys[provider.id] ? 'text' : 'password'}
									class="input"
									bind:value={apiKeys[provider.id]}
									placeholder={config.apiKeyMasked ? 'Enter new key to update' : 'Enter API key'}
								/>
								<button
									class="btn btn-secondary btn-sm"
									onclick={() => showApiKeys = { ...showApiKeys, [provider.id]: !showApiKeys[provider.id] }}
									type="button"
								>
									{showApiKeys[provider.id] ? 'Hide' : 'Show'}
								</button>
								<button
									class="btn btn-primary btn-sm"
									onclick={() => saveProviderKey(provider.id)}
									disabled={saving[provider.id] || (!apiKeys[provider.id] && !baseUrls[provider.id])}
								>
									{saving[provider.id] ? '...' : 'Save'}
								</button>
								{#if config.apiKeyMasked}
									<button
										class="btn btn-danger btn-sm"
										onclick={() => clearApiKey(provider.id)}
										disabled={saving[provider.id]}
										title="Remove API key"
									>
										Remove
									</button>
								{/if}
							</div>
						</div>
					{/if}

					{#if provider.needsBaseUrl}
						<div class="field-group">
							<span class="field-label">Base URL</span>
							<div class="input-row">
								<input
									type="text"
									class="input"
									bind:value={baseUrls[provider.id]}
									placeholder={config.baseUrl || 'http://localhost:11434'}
								/>
								<button
									class="btn btn-primary btn-sm"
									onclick={() => saveProviderKey(provider.id)}
									disabled={saving[provider.id] || !baseUrls[provider.id]}
								>
									{saving[provider.id] ? '...' : 'Save'}
								</button>
							</div>
						</div>
					{/if}

					<!-- Models -->
					<div class="field-group">
						<span class="field-label">Models</span>

						{#if config.models.length > 0}
							<div class="model-list">
								{#each config.models as modelId}
									<div class="model-item">
										<code class="model-id">{modelId}</code>
										<button
											class="remove-btn"
											onclick={() => removeModel(provider.id, modelId)}
											title="Remove model"
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
											</svg>
										</button>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted no-models">No models configured</p>
						{/if}

						<!-- Add model -->
						<div class="input-row">
							<input
								type="text"
								class="input"
								bind:value={newModelInputs[provider.id]}
								placeholder="Model ID (e.g. claude-sonnet-4-5-20250929)"
								onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addModel(provider.id, newModelInputs[provider.id] || ''); } }}
							/>
							<button
								class="btn btn-secondary btn-sm"
								onclick={() => addModel(provider.id, newModelInputs[provider.id] || '')}
								disabled={!newModelInputs[provider.id]?.trim()}
							>
								Add
							</button>
						</div>
					</div>

					<!-- Actions -->
					<div class="provider-actions">
						{#if configured}
							<button
								class="btn btn-secondary btn-sm"
								onclick={() => testConnection(provider.id)}
								disabled={testing[provider.id]}
							>
								{testing[provider.id] ? 'Testing...' : 'Test Connection'}
							</button>
						{/if}
						{#if configured}
							<button
								class="btn btn-danger btn-sm"
								onclick={() => deleteProviderConfig(provider.id)}
								disabled={deleting[provider.id]}
							>
								{deleting[provider.id] ? 'Deleting...' : 'Delete Configuration'}
							</button>
						{/if}
					</div>
				</div>
			</details>
		{/each}

		<h2 class="section-heading">Agent</h2>

		<details class="provider-section">
			<summary class="provider-header">
				<div class="provider-title">
					<span class="provider-name">Max Agent Rounds</span>
					<span class="provider-summary">
						{data.aiConfig?.maxAgentRounds ?? 20} step{(data.aiConfig?.maxAgentRounds ?? 20) === 1 ? '' : 's'}
					</span>
				</div>
				<svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M6 9l6 6 6-6"/>
				</svg>
			</summary>
			<div class="provider-body">
				<p class="text-muted">
					Cap on how many tool calls the assistant can chain in one turn before stopping and asking you to continue. One read or write tool call counts as one round. Higher = the agent can complete longer multi-step tasks autonomously, but uses more API calls. Default 20, max 200.
				</p>
				<div class="field-row">
					<label class="field-label" for="max-agent-rounds-input">Rounds</label>
					<input
						id="max-agent-rounds-input"
						type="number"
						min="1"
						max="200"
						step="1"
						bind:value={maxAgentRoundsInput}
						class="text-input"
						style="width: 8rem"
					/>
					<button
						class="btn btn-primary btn-sm"
						onclick={saveMaxAgentRounds}
						disabled={savingMaxRounds}
					>
						{savingMaxRounds ? 'Saving…' : 'Save'}
					</button>
				</div>
			</div>
		</details>

		<h2 class="section-heading">System Prompt</h2>

		<!-- System Prompt -->
		<details class="provider-section">
			<summary class="provider-header">
				<div class="provider-title">
					<span class="provider-name">System Prompt</span>
					<span class="provider-summary">{customSystemPrompt ? 'customized' : 'default'}</span>
				</div>
				<svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M6 9l6 6 6-6"/>
				</svg>
			</summary>

			<div class="provider-body">
				<p class="text-muted">
					The system prompt tells the AI how to generate code. API reference and your metrics are appended automatically via placeholders.
				</p>

				{#if !customSystemPrompt}
					<div class="default-prompt-section">
						<span class="field-label">Default prompt (read-only)</span>
						<pre class="prompt-preview">{data.defaultPrompt}</pre>
					</div>
				{/if}

				<div class="field-group">
					<span class="field-label">
						{customSystemPrompt ? 'Custom prompt' : 'Override with custom prompt'}
					</span>
					<p class="text-muted hint">
						Use &#123;&#123;API_REFERENCE&#125;&#125; and &#123;&#123;USER_METRICS&#125;&#125; as placeholders.
					</p>
					<textarea
						class="input prompt-textarea"
						value={customSystemPrompt}
						oninput={(e) => customSystemPromptOverride = e.currentTarget.value}
						placeholder="Leave empty to use the default prompt above."
						rows="10"
					></textarea>
					<div class="prompt-actions">
						<button
							class="btn btn-primary btn-sm"
							onclick={saveSystemPrompt}
							disabled={saving['prompt']}
						>
							{saving['prompt'] ? 'Saving...' : 'Save Prompt'}
						</button>
						{#if customSystemPrompt}
							<button class="btn btn-secondary btn-sm" onclick={resetPrompt}>
								Reset to Default
							</button>
						{/if}
					</div>
				</div>
			</div>
		</details>

		<!-- Context Addenda -->
		<details class="provider-section">
			<summary class="provider-header">
				<div class="provider-title">
					<span class="provider-name">Context-Specific Instructions</span>
					<span class="provider-summary">4 contexts</span>
				</div>
				<svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M6 9l6 6 6-6"/>
				</svg>
			</summary>

			<div class="provider-body">
				<p class="text-muted">
					These instructions are appended to the system prompt based on where the AI is used. They are not editable.
				</p>

				{#each [
					{ id: 'query', label: 'Query Builder', desc: 'When writing queries in the Query Builder' },
					{ id: 'kr_progress', label: 'KR Progress', desc: 'When writing Key Result progress calculations' },
					{ id: 'widget', label: 'Dashboard Widget', desc: 'When writing dashboard widget code' },
					{ id: 'metric', label: 'Computed Metric', desc: 'When writing computed metric expressions' }
				] as ctx}
					<div class="context-block">
						<div class="context-header">
							<span class="context-label">{ctx.label}</span>
							<span class="text-muted context-desc">{ctx.desc}</span>
						</div>
						<pre class="prompt-preview">{data.contextAddenda[ctx.id] || '(no additional instructions)'}</pre>
					</div>
				{/each}
			</div>
		</details>
	</div>
</div>

<style>
	.settings-page {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--spacing-lg);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: 0.875rem;
		margin-bottom: var(--spacing-sm);
	}

	.back-link:hover {
		color: var(--color-primary);
	}

	.page-header {
		margin-bottom: var(--spacing-lg);
	}

	.page-header h1 {
		margin: 0 0 var(--spacing-xs);
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.message {
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
		font-size: 0.875rem;
	}

	.message.success {
		background-color: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: var(--color-success);
	}

	.message.error {
		background-color: #fef2f2;
		border: 1px solid #fecaca;
		color: var(--color-error);
	}

	.settings-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.section-heading {
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		margin: 0;
	}

	/* Provider accordion sections */
	.provider-section {
		background: var(--color-bg-card);
		border: 1px solid var(--color-border-light, var(--color-border));
		border-radius: var(--radius-xl);
		overflow: hidden;
	}

	.provider-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		cursor: pointer;
		user-select: none;
		list-style: none;
	}

	.provider-header::-webkit-details-marker {
		display: none;
	}

	.provider-header::marker {
		display: none;
		content: '';
	}

	.provider-title {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.provider-name {
		font-weight: 600;
		font-size: 1rem;
	}

	.provider-summary {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		background: var(--color-bg);
		padding: 2px 8px;
		border-radius: 9999px;
	}

	.provider-summary.configured {
		color: var(--color-success);
		background: #f0fdf4;
	}

	.chevron {
		color: var(--color-text-muted);
		transition: transform 0.2s ease;
		flex-shrink: 0;
	}

	.provider-section[open] > .provider-header .chevron {
		transform: rotate(180deg);
	}

	.provider-body {
		padding: 0 var(--spacing-lg) var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		border-top: 1px solid var(--color-border-light, var(--color-border));
		padding-top: var(--spacing-md);
	}

	/* Fields */
	.field-group {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.field-label {
		font-weight: 500;
		font-size: 0.875rem;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.configured-badge {
		font-weight: 400;
		font-size: 0.75rem;
		color: var(--color-success);
	}

	.input-row {
		display: flex;
		gap: var(--spacing-xs);
	}

	.input-row .input {
		flex: 1;
	}

	/* Model list */
	.model-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.model-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
	}

	.model-id {
		font-size: 0.8125rem;
		font-family: monospace;
	}

	.remove-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		border-radius: var(--radius-sm);
		cursor: pointer;
		flex-shrink: 0;
	}

	.remove-btn:hover {
		background: #fef2f2;
		color: var(--color-error);
	}

	.no-models {
		margin: 0;
		font-size: 0.8125rem;
	}

	/* Provider actions */
	.provider-actions {
		display: flex;
		gap: var(--spacing-sm);
		padding-top: var(--spacing-sm);
		border-top: 1px solid var(--color-border-light, var(--color-border));
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.75rem;
	}

	.btn-danger {
		background: transparent;
		color: var(--color-error);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
		cursor: pointer;
		font-weight: 500;
	}

	.btn-danger:hover {
		background: #fef2f2;
	}

	/* System prompt */
	.prompt-textarea {
		width: 100%;
		font-family: monospace;
		font-size: 0.8125rem;
		line-height: 1.5;
		resize: vertical;
	}

	.prompt-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.hint {
		margin: 0;
		font-size: 0.8125rem;
	}

	/* Prompt preview */
	.prompt-preview {
		margin: 0;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border: 1px solid var(--color-border-light, var(--color-border));
		border-radius: var(--radius-sm);
		font-family: monospace;
		font-size: 0.75rem;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 300px;
		overflow-y: auto;
		color: var(--color-text-muted);
	}

	/* Context addenda */
	.context-block {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.context-header {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-sm);
	}

	.context-label {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.context-desc {
		font-size: 0.75rem;
	}
</style>
