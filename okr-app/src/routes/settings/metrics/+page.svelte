<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { MetricDefinition } from '$lib/db/schema';
	import MonacoEditor from '$lib/components/MonacoEditor.svelte';

	let { data } = $props();

	let showNewTemplate = $state(false);
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
	<title>Metrics Template - Settings - OKR Tracker</title>
</svelte:head>

<div class="metrics-page">
	<header class="page-header">
		<a href="/settings" class="back-link">← Settings</a>
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
								<label class="label" for="expression">Expression</label>
								<MonacoEditor
									bind:value={newMetricExpression}
									height="120px"
								/>
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
									{#each template.metricsDefinition.slice(0, 5) as metric}
										<span class="metric-badge" class:input={metric.type === 'input'} class:computed={metric.type === 'computed'} class:external={metric.type === 'external'}>
											{metric.label}
										</span>
									{/each}
									{#if template.metricsDefinition.length > 5}
										<span class="metric-badge more">+{template.metricsDefinition.length - 5} more</span>
									{/if}
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
		display: inline-block;
		margin-bottom: var(--spacing-sm);
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: 0.875rem;
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

	.metric-badge.input {
		background-color: #e0f2fe;
		color: #0369a1;
	}

	.metric-badge.computed {
		background-color: #fef3c7;
		color: #92400e;
	}

	.metric-badge.external {
		background-color: #f3e8ff;
		color: #7c3aed;
	}

	.metric-badge.more {
		background-color: var(--color-bg-hover);
		color: var(--color-text-muted);
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
