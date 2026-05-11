<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { MetricDefinition } from '$lib/db/schema';
	import CodeEditorModal from '$lib/components/CodeEditorModal.svelte';
	import AiChat from '$lib/components/AiChat.svelte';
	import type { AiAction } from '$lib/ai/types';

	let { data } = $props();

	// AI config from layout
	const aiConfig = $derived(data.aiConfig ?? { hasAiConfig: false, configuredProviders: [] as string[], activeProvider: 'anthropic', providerModels: {} as Record<string, string[]> });

	// Code editor modal state for computed expressions
	let codeEditorOpen = $state(false);

	// Metrics defined above the currently editing metric (for AI context)
	const availableMetricsForAi = $derived(() => {
		const upTo = editingMetricIndex ?? metrics.length;
		return metrics.slice(0, upTo);
	});

	let showNewTemplate = $state(false);
	let showAiAssistant = $state(false);
	let editingTemplate = $state<typeof data.templates[0] | null>(null);
	let loading = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// Form state
	let templateName = $state('default');
	let effectiveFrom = $state(new Date().toISOString().split('T')[0]);
	let metrics = $state<MetricDefinition[]>([]);

	// New/edit metric form
	let showMetricForm = $state(false);
	let editingMetricIndex = $state<number | null>(null);
	let newMetricName = $state('');
	let newMetricLabel = $state('');
	let newMetricType = $state<'input' | 'computed' | 'external'>('input');
	let newMetricInputType = $state<'number' | 'time' | 'text' | 'boolean'>('number');
	let newMetricUnit = $state('');
	let newMetricExpression = $state('');
	let newMetricSource = $state('');

	function resetForm() {
		templateName = 'default';
		effectiveFrom = new Date().toISOString().split('T')[0];
		metrics = [];
		showNewTemplate = false;
		editingTemplate = null;
	}

	function resetMetricForm() {
		newMetricName = '';
		newMetricLabel = '';
		newMetricType = 'input';
		newMetricInputType = 'number';
		newMetricUnit = '';
		newMetricExpression = '';
		newMetricSource = '';
		showMetricForm = false;
		editingMetricIndex = null;
	}

	function openEditTemplate(template: typeof data.templates[0]) {
		editingTemplate = template;
		templateName = template.name;
		effectiveFrom = template.effectiveFrom;
		metrics = [...template.metricsDefinition];
		showNewTemplate = true;
	}

	function openEditMetric(index: number) {
		const metric = metrics[index];
		editingMetricIndex = index;
		newMetricName = metric.name;
		newMetricLabel = metric.label;
		newMetricType = metric.type;
		if (metric.type === 'input') {
			newMetricInputType = metric.inputType || 'number';
			newMetricUnit = metric.unit || '';
		} else if (metric.type === 'computed') {
			newMetricExpression = metric.expression || '';
		} else if (metric.type === 'external') {
			newMetricSource = metric.source || '';
		}
		showMetricForm = true;
	}

	function saveMetric() {
		if (!newMetricName.trim() || !newMetricLabel.trim()) return;

		const metric: MetricDefinition = {
			name: newMetricName.trim(),
			label: newMetricLabel.trim(),
			type: newMetricType
		};

		if (newMetricType === 'input') {
			metric.inputType = newMetricInputType;
			if (newMetricUnit.trim()) metric.unit = newMetricUnit.trim();
		} else if (newMetricType === 'computed') {
			metric.expression = newMetricExpression;
		} else if (newMetricType === 'external') {
			metric.source = newMetricSource;
		}

		if (editingMetricIndex !== null) {
			// Update existing metric
			metrics = metrics.map((m, i) => i === editingMetricIndex ? metric : m);
		} else {
			// Add new metric
			metrics = [...metrics, metric];
		}
		resetMetricForm();
	}

	function removeMetric(index: number) {
		metrics = metrics.filter((_, i) => i !== index);
	}

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function asString(value: unknown): string {
		return typeof value === 'string' ? value.trim() : '';
	}

	function asIndex(value: unknown): number | null {
		return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
	}

	function normalizeMetric(value: unknown): MetricDefinition | null {
		if (!isRecord(value)) return null;
		const name = asString(value.name);
		const label = asString(value.label);
		const type = value.type;
		if (!name || !label || (type !== 'input' && type !== 'computed' && type !== 'external')) {
			return null;
		}

		const metric: MetricDefinition = { name, label, type };
		if (type === 'input') {
			const inputType = value.inputType;
			metric.inputType = inputType === 'time' || inputType === 'text' || inputType === 'boolean' ? inputType : 'number';
			const unit = asString(value.unit);
			if (unit) metric.unit = unit;
		} else if (type === 'computed') {
			metric.expression = asString(value.expression);
		} else if (type === 'external') {
			metric.source = asString(value.source);
		}
		return metric;
	}

	async function handleAiAction(action: AiAction) {
		message = null;
		if (!isRecord(action.payload)) {
			message = { type: 'error', text: 'AI action payload must be an object' };
			return;
		}

		if (action.type === 'add_metric') {
			const metric = normalizeMetric(action.payload.metric);
			if (!metric) {
				message = { type: 'error', text: 'AI action is missing a valid metric' };
				return;
			}
			metrics = [...metrics, metric];
			message = { type: 'success', text: 'Metric added from AI' };
		} else if (action.type === 'update_metric') {
			const index = asIndex(action.payload.index);
			const metric = normalizeMetric(action.payload.metric);
			if (index === null || index >= metrics.length || !metric) {
				message = { type: 'error', text: 'AI action needs a valid metric index and metric' };
				return;
			}
			metrics = metrics.map((current, i) => (i === index ? metric : current));
			message = { type: 'success', text: 'Metric updated from AI' };
		} else if (action.type === 'remove_metric') {
			const index = asIndex(action.payload.index);
			if (index === null || index >= metrics.length) {
				message = { type: 'error', text: 'AI action needs a valid metric index' };
				return;
			}
			metrics = metrics.filter((_, i) => i !== index);
			message = { type: 'success', text: 'Metric removed from AI' };
		} else if (action.type === 'move_metric') {
			const fromIndex = asIndex(action.payload.fromIndex);
			const toIndex = asIndex(action.payload.toIndex);
			if (
				fromIndex === null ||
				toIndex === null ||
				fromIndex >= metrics.length ||
				toIndex >= metrics.length
			) {
				message = { type: 'error', text: 'AI action needs valid fromIndex and toIndex' };
				return;
			}
			const nextMetrics = [...metrics];
			const [metric] = nextMetrics.splice(fromIndex, 1);
			nextMetrics.splice(toIndex, 0, metric);
			metrics = nextMetrics;
			message = { type: 'success', text: 'Metric moved from AI' };
		} else if (action.type === 'replace_metrics') {
			if (!Array.isArray(action.payload.metrics)) {
				message = { type: 'error', text: 'AI action is missing metrics' };
				return;
			}
			const nextMetrics = action.payload.metrics
				.map(normalizeMetric)
				.filter((metric): metric is MetricDefinition => metric !== null);
			if (nextMetrics.length === 0) {
				message = { type: 'error', text: 'AI action did not include any valid metrics' };
				return;
			}
			metrics = nextMetrics;
			message = { type: 'success', text: 'Metrics replaced from AI' };
		} else if (action.type === 'update_template_details') {
			const name = asString(action.payload.name);
			const nextEffectiveFrom = asString(action.payload.effectiveFrom);
			if (name) templateName = name;
			if (/^\d{4}-\d{2}-\d{2}$/.test(nextEffectiveFrom)) effectiveFrom = nextEffectiveFrom;
			message = { type: 'success', text: 'Template details updated from AI' };
		} else {
			message = { type: 'error', text: `Unsupported AI action: ${action.type}` };
		}
	}

	function moveMetricUp(index: number) {
		if (index === 0) return;
		const newMetrics = [...metrics];
		[newMetrics[index - 1], newMetrics[index]] = [newMetrics[index], newMetrics[index - 1]];
		metrics = newMetrics;
	}

	function moveMetricDown(index: number) {
		if (index === metrics.length - 1) return;
		const newMetrics = [...metrics];
		[newMetrics[index], newMetrics[index + 1]] = [newMetrics[index + 1], newMetrics[index]];
		metrics = newMetrics;
	}

	async function saveTemplate() {
		if (!effectiveFrom || metrics.length === 0) {
			message = { type: 'error', text: 'Please add at least one metric' };
			return;
		}

		loading = true;
		message = null;

		try {
			const url = editingTemplate
				? `/api/metrics/templates/${editingTemplate.id}`
				: '/api/metrics/templates';

			const response = await fetch(url, {
				method: editingTemplate ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: templateName,
					effectiveFrom,
					metricsDefinition: metrics
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save template');
			}

			message = { type: 'success', text: editingTemplate ? 'Template updated' : 'Template created' };
			resetForm();
			await invalidateAll();
		} catch (error) {
			message = { type: 'error', text: error instanceof Error ? error.message : 'Failed to save template' };
		} finally {
			loading = false;
		}
	}

	async function deleteTemplate(id: string) {
		if (!confirm('Delete this template?')) return;

		loading = true;
		message = null;

		try {
			const response = await fetch(`/api/metrics/templates/${id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete template');
			}

			message = { type: 'success', text: 'Template deleted' };
			await invalidateAll();
		} catch (error) {
			message = { type: 'error', text: error instanceof Error ? error.message : 'Failed to delete template' };
		} finally {
			loading = false;
		}
	}

	// Get external source label
	function getSourceLabel(sourceId: string): string {
		for (const plugin of data.externalSources) {
			for (const field of plugin.fields) {
				if (field.id === sourceId) {
					return `${plugin.pluginName}: ${field.name}`;
				}
			}
		}
		return sourceId;
	}
</script>

<svelte:head>
	<title>Metrics Template - Settings - RUOK</title>
</svelte:head>

<div class="metrics-page">
	<header class="page-header">
		<a href="/settings" class="back-link">
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
			Back to Settings
		</a>
		<h1>Metrics Template</h1>
	</header>

	{#if message}
		<div class="message" class:success={message.type === 'success'} class:error={message.type === 'error'}>
			{message.text}
		</div>
	{/if}

	{#if showNewTemplate}
		<div class="card template-form">
			<h2>{editingTemplate ? 'Edit Template' : 'New Template'}</h2>

			<div class="ai-assistant-section">
				<div class="section-header">
					<h3>AI Assistant</h3>
					<button type="button" class="btn btn-secondary btn-sm" onclick={() => showAiAssistant = !showAiAssistant}>
						{showAiAssistant ? 'Hide' : 'Open'}
					</button>
				</div>
				{#if showAiAssistant}
					<div class="ai-chat-shell">
						<AiChat
							hasConfig={aiConfig.hasAiConfig}
							configuredProviders={aiConfig.configuredProviders}
							activeProvider={aiConfig.activeProvider}
							providerModels={aiConfig.providerModels}
							context="metrics_template"
							contextData={{
								templateName,
								effectiveFrom,
								metrics,
								externalSources: data.externalSources
							}}
							onAction={handleAiAction}
							welcomeText="Ask me to design or revise this metrics template."
						/>
					</div>
				{/if}
			</div>

			<div class="form-row">
				<div class="form-group">
					<label class="label" for="template-name">Name</label>
					<input type="text" id="template-name" class="input" bind:value={templateName} />
				</div>
				<div class="form-group">
					<label class="label" for="effective-from">Effective From</label>
					<input type="date" id="effective-from" class="input" bind:value={effectiveFrom} />
				</div>
			</div>

			<div class="metrics-section">
				<h3>Metrics</h3>
				<p class="text-muted">Define the metrics you want to track. Metrics are evaluated top-to-bottom, so computed metrics can reference metrics above them.</p>

				{#if metrics.length > 0}
					<div class="metrics-list">
						{#each metrics as metric, index}
							<div class="metric-item">
								<div class="metric-order">
									<button
										type="button"
										class="btn-icon btn-icon-xs"
										onclick={() => moveMetricUp(index)}
										disabled={index === 0}
										title="Move up"
									>↑</button>
									<button
										type="button"
										class="btn-icon btn-icon-xs"
										onclick={() => moveMetricDown(index)}
										disabled={index === metrics.length - 1}
										title="Move down"
									>↓</button>
								</div>
								<div class="metric-info">
									<span class="metric-label">{metric.label}</span>
									<span class="metric-name">{metric.name}</span>
									<span class="metric-type">
										{#if metric.type === 'input'}
											Input ({metric.inputType}{metric.unit ? `, ${metric.unit}` : ''})
										{:else if metric.type === 'computed'}
											Computed
										{:else if metric.type === 'external'}
											{getSourceLabel(metric.source || '')}
										{/if}
									</span>
								</div>
								<button
									type="button"
									class="btn-icon btn-icon-edit"
									onclick={() => openEditMetric(index)}
									title="Edit metric"
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z"/>
									</svg>
								</button>
								<button
									type="button"
									class="btn-icon"
									onclick={() => removeMetric(index)}
									title="Remove metric"
								>×</button>
							</div>
						{/each}
					</div>
				{:else}
					<p class="empty-state">No metrics defined yet. Add your first metric below.</p>
				{/if}

				{#if showMetricForm}
					<div class="add-metric-form">
						<h4>{editingMetricIndex !== null ? 'Edit Metric' : 'Add Metric'}</h4>
						<div class="form-row">
							<div class="form-group">
								<label class="label" for="metric-name">ID (unique)</label>
								<input type="text" id="metric-name" class="input" placeholder="e.g., sleep_duration" bind:value={newMetricName} />
							</div>
							<div class="form-group">
								<label class="label" for="metric-label">Label</label>
								<input type="text" id="metric-label" class="input" placeholder="e.g., Sleep Duration" bind:value={newMetricLabel} />
							</div>
						</div>

						<div class="form-group">
							<label class="label" for="metric-type">Type</label>
							<select id="metric-type" class="input" bind:value={newMetricType}>
								<option value="input">User Input</option>
								<option value="computed">Computed</option>
								<option value="external">External Source</option>
							</select>
						</div>

						{#if newMetricType === 'input'}
							<div class="form-row">
								<div class="form-group">
									<label class="label" for="input-type">Input Type</label>
									<select id="input-type" class="input" bind:value={newMetricInputType}>
										<option value="number">Number</option>
										<option value="time">Time (HH:MM)</option>
										<option value="text">Text</option>
										<option value="boolean">Yes/No</option>
									</select>
								</div>
								<div class="form-group">
									<label class="label" for="unit">Unit (optional)</label>
									<input type="text" id="unit" class="input" placeholder="e.g., hours, steps, bpm" bind:value={newMetricUnit} />
								</div>
							</div>
						{:else if newMetricType === 'computed'}
							<div class="form-group">
								<label class="label">Expression</label>
								{#if newMetricExpression}
									<div class="expression-preview">
										<code>{newMetricExpression}</code>
									</div>
								{/if}
								<button
									type="button"
									class="btn btn-secondary btn-sm"
									onclick={() => codeEditorOpen = true}
								>
									{newMetricExpression ? 'Edit Code with AI...' : 'Write Code with AI...'}
								</button>
								<p class="help-text">JavaScript expression. Access other metrics via <code>metrics.name</code>. Use <code>q.parseTime()</code> for time conversions.</p>
							</div>
						{:else if newMetricType === 'external'}
							<div class="form-group">
								<label class="label" for="source">External Source</label>
								<select id="source" class="input" bind:value={newMetricSource}>
									<option value="">Select a source...</option>
									{#each data.externalSources as plugin}
										<optgroup label={plugin.pluginName}>
											{#each plugin.fields as field}
												<option value={field.id}>{field.name} {field.unit ? `(${field.unit})` : ''}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
								{#if data.externalSources.length === 0}
									<p class="help-text">No external sources available. Configure integrations in Settings → Integrations.</p>
								{/if}
							</div>
						{/if}

						<div class="form-actions">
							<button type="button" class="btn btn-secondary btn-sm" onclick={resetMetricForm}>Cancel</button>
							<button
								type="button"
								class="btn btn-primary btn-sm"
								onclick={saveMetric}
								disabled={!newMetricName.trim() || !newMetricLabel.trim() || (newMetricType === 'external' && !newMetricSource)}
							>{editingMetricIndex !== null ? 'Save Changes' : 'Add Metric'}</button>
						</div>
					</div>
				{:else}
					<button type="button" class="btn btn-secondary" onclick={() => showMetricForm = true}>
						+ Add Metric
					</button>
				{/if}
			</div>

			<div class="form-actions">
				<button type="button" class="btn btn-secondary" onclick={resetForm}>Cancel</button>
				<button
					type="button"
					class="btn btn-primary"
					onclick={saveTemplate}
					disabled={loading || metrics.length === 0}
				>
					{loading ? 'Saving...' : (editingTemplate ? 'Update Template' : 'Create Template')}
				</button>
			</div>
		</div>
	{:else}
		<div class="templates-section">
			{#if data.templates.length > 0}
				<div class="templates-list">
					{#each data.templates as template}
						<div class="card template-card">
							<div class="template-header">
								<div class="template-info">
									<h3>{template.name}</h3>
									<span class="template-date">Effective from {template.effectiveFrom}</span>
								</div>
								<div class="template-actions">
									<button class="btn btn-secondary btn-sm" onclick={() => openEditTemplate(template)}>Edit</button>
									<button class="btn-icon" onclick={() => deleteTemplate(template.id)} title="Delete">
										<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<polyline points="3 6 5 6 21 6"/>
											<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
										</svg>
									</button>
								</div>
							</div>
							<div class="template-metrics">
								<span class="metrics-count">{template.metricsDefinition.length} metrics</span>
								<div class="metrics-preview">
									{#each template.metricsDefinition as metric}
										<span class="metric-badge" class:type-input={metric.type === 'input'} class:type-computed={metric.type === 'computed'} class:type-external={metric.type === 'external'}>
											{metric.label}
										</span>
									{/each}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="empty-state card">
					<p>No metrics templates yet.</p>
					<p class="text-muted">Create a template to define what daily metrics you want to track.</p>
				</div>
			{/if}

			<button class="btn btn-primary" onclick={() => showNewTemplate = true}>
				+ New Template
			</button>
		</div>
	{/if}
</div>

<CodeEditorModal
	bind:open={codeEditorOpen}
	bind:value={newMetricExpression}
	title="Computed Metric Expression"
	hasAiConfig={aiConfig.hasAiConfig}
	configuredProviders={aiConfig.configuredProviders}
	activeProvider={aiConfig.activeProvider}
	providerModels={aiConfig.providerModels}
	context="metric"
	contextData={{ availableMetrics: availableMetricsForAi() }}
/>

<style>
	.metrics-page {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--spacing-lg);
	}

	.page-header {
		margin-bottom: var(--spacing-lg);
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

	.page-header h1 {
		margin: 0;
	}

	.message {
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
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

	.template-form h2 {
		margin: 0 0 var(--spacing-md);
	}

	.ai-assistant-section {
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-lg);
	}

	.ai-assistant-section .section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	.ai-assistant-section h3 {
		margin: 0;
		font-size: 1rem;
	}

	.ai-chat-shell {
		height: 520px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-md);
	}

	.metrics-section {
		margin-top: var(--spacing-lg);
		padding-top: var(--spacing-lg);
		border-top: 1px solid var(--color-border);
	}

	.metrics-section h3 {
		margin: 0 0 var(--spacing-xs);
	}

	.metrics-section > p {
		margin: 0 0 var(--spacing-md);
		font-size: 0.875rem;
	}

	.metrics-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.metric-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		background-color: var(--color-bg);
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
	}

	.metric-order {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.btn-icon-xs {
		width: 20px;
		height: 20px;
		font-size: 0.75rem;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.btn-icon-xs:hover:not(:disabled) {
		background: var(--color-bg-hover);
	}

	.btn-icon-xs:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.metric-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.metric-label {
		font-weight: 500;
	}

	.metric-name {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
	}

	.metric-type {
		font-size: 0.75rem;
		color: var(--color-primary);
	}

	.empty-state {
		padding: var(--spacing-lg);
		text-align: center;
		color: var(--color-text-muted);
	}

	.empty-state p {
		margin: 0;
	}

	.add-metric-form {
		padding: var(--spacing-md);
		background-color: var(--color-bg);
		border-radius: var(--radius-md);
		border: 1px dashed var(--color-border);
		margin-bottom: var(--spacing-md);
	}

	.add-metric-form h4 {
		margin: 0 0 var(--spacing-md);
		font-size: 0.875rem;
		font-weight: 600;
	}

	.btn-icon-edit {
		color: var(--color-text-muted);
	}

	.btn-icon-edit:hover {
		background-color: var(--color-bg-hover);
		color: var(--color-primary);
	}

	.help-text {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: var(--spacing-xs) 0 0;
	}

	.help-text code {
		background-color: var(--color-bg-hover);
		padding: 1px 4px;
		border-radius: 3px;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-md);
	}

	.templates-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.template-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.template-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}

	.template-info h3 {
		margin: 0;
		font-size: 1rem;
	}

	.template-date {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.template-actions {
		display: flex;
		gap: var(--spacing-xs);
		align-items: center;
	}

	.template-metrics {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.metrics-count {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.metrics-preview {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.metric-badge {
		font-size: 0.75rem;
		padding: 2px 8px;
		border-radius: 12px;
		background-color: var(--color-bg-hover);
	}

	.metric-badge.type-input {
		background-color: #e0f2fe;
		color: #0369a1;
	}

	.metric-badge.type-computed {
		background-color: #fef3c7;
		color: #92400e;
	}

	.metric-badge.type-external {
		background-color: #f3e8ff;
		color: #7c3aed;
	}

	.expression-preview {
		background-color: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
		overflow-x: auto;
	}

	.expression-preview code {
		font-size: 0.8125rem;
		color: var(--color-text);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.btn-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-icon:hover {
		background-color: var(--color-bg-hover);
		color: var(--color-error);
	}

	@media (max-width: 640px) {
		.form-row {
			grid-template-columns: 1fr;
		}
	}
</style>
