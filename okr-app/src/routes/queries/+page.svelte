<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { marked } from 'marked';

	interface RenderOutput {
		type: 'markdown' | 'table' | 'plotly';
		content: unknown;
	}

	interface TableData {
		headers: string[];
		rows: (string | number)[][];
	}

	interface PlotlyData {
		data: unknown[];
		layout?: Record<string, unknown>;
	}

	let { data } = $props();

	// Query type filter and selection
	type QueryTypeFilter = 'all' | 'progress' | 'widget' | 'general';
	type QueryType = 'progress' | 'widget' | 'general';
	let selectedTypeFilter = $state<QueryTypeFilter>('all');
	let queryType = $state<QueryType>('general');

	// Plotly containers for charts
	let plotContainers: Record<number, HTMLDivElement> = {};

	// Filtered queries based on selected type
	const filteredQueries = $derived(
		selectedTypeFilter === 'all'
			? data.savedQueries
			: data.savedQueries.filter(q => q.queryType === selectedTypeFilter)
	);

	// Sample code templates for each query type
	const sampleCode: Record<QueryType, string> = {
		general: `// General Query - Use render API to display results
// Available methods:
//   q.daily({ year, month, week, from, to })
//   q.tasks({ year, tag, completed })
//   q.objectives({ year, level })
//
// Render API:
//   render.markdown(text) - Render markdown
//   render.table({ headers, rows }) - Render table
//   render.plot.bar/line/pie/multi(opts) - Render Plotly charts

// Example: Show sleep data with table and chart
const days = await q.daily({ year: 2025, month: 1 });

const sleepData = days.filter(d => d.sleepLength).slice(-7);
const avgSleep = q.avg(sleepData.map(d => q.parseTime(d.sleepLength)));

render.markdown(\`## Sleep Analysis
Average: **\${q.formatDuration(avgSleep)}**\`);

render.table({
  headers: ['Date', 'Sleep Duration'],
  rows: sleepData.map(d => [d.date, d.sleepLength])
});

render.plot.bar({
  x: sleepData.map(d => d.date),
  y: sleepData.map(d => q.parseTime(d.sleepLength) / 60),
  name: 'Hours of Sleep'
});`,
		progress: `// Progress Query - Return a number between 0 and 1
// Used for Key Result progress tracking
//
// Examples:
// - Task completion rate: completed / total
// - Habit streak: daysCompleted / targetDays
// - Reading goal: booksRead / targetBooks

// Example: Calculate progress for tasks with a specific tag
const tasks = await q.tasks({ tag: 'Read_Books', year: 2025 });

if (tasks.length === 0) return 0;

const completed = tasks.filter(t => t.completed).length;
return completed / tasks.length; // Returns 0.0 to 1.0`,
		widget: `// Widget Query - Use render API for custom display
//
// Render API:
//   render.markdown(text) - Markdown with tables, lists, etc.
//   render.table({ headers, rows }) - Structured table
//   render.plot.bar/line/pie(opts) - Plotly charts

// Example: Dashboard with steps chart
const days = await q.daily({ year: 2025, month: 1 });
const recent = days.filter(d => d.steps).slice(-7);

render.markdown('### Weekly Steps');

render.plot.line({
  x: recent.map(d => d.date),
  y: recent.map(d => d.steps),
  name: 'Steps'
});

const total = q.sum(recent, 'steps');
render.markdown(\`Total: **\${total.toLocaleString()}** steps\`);`
	};

	let code = $state(sampleCode.general);

	// Track if the user has modified the code (to avoid overwriting their work)
	let codeModified = $state(false);

	function setQueryTypeWithSample(type: QueryType) {
		// Only update sample code if creating new query and code hasn't been modified
		if (!selectedQuery && !codeModified) {
			code = sampleCode[type];
		}
		queryType = type;
	}

	function startNewQuery(type: QueryType) {
		selectedQuery = null;
		queryName = '';
		queryDescription = '';
		queryType = type;
		code = sampleCode[type];
		codeModified = false;
	}

	let result = $state<unknown>(null);
	let renders = $state<RenderOutput[]>([]);
	let error = $state('');
	let loading = $state(false);

	// Save query form
	let showSaveForm = $state(false);
	let queryName = $state('');
	let queryDescription = $state('');
	let saveLoading = $state(false);

	// Selected query for editing
	let selectedQuery = $state<typeof data.savedQueries[0] | null>(null);

	async function runQuery() {
		loading = true;
		error = '';
		result = null;
		renders = [];
		plotContainers = {};

		try {
			const response = await fetch('/api/queries/execute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});

			const responseData = await response.json();

			if (!response.ok) {
				throw new Error(responseData.error || 'Query failed');
			}

			result = responseData.result;
			renders = responseData.renders || [];

			// Render Plotly charts after DOM update
			await tick();
			renderPlotlyCharts();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Query execution failed';
		} finally {
			loading = false;
		}
	}

	async function renderPlotlyCharts() {
		if (!renders.some(r => r.type === 'plotly')) return;

		// Dynamically import Plotly only when needed (client-side only)
		const Plotly = await import('plotly.js-basic-dist-min');

		renders.forEach((render, index) => {
			if (render.type === 'plotly' && plotContainers[index]) {
				const plotData = render.content as PlotlyData;
				Plotly.newPlot(
					plotContainers[index],
					plotData.data as Plotly.Data[],
					{
						...plotData.layout,
						autosize: true,
						margin: { t: 40, r: 20, b: 40, l: 50 }
					} as Plotly.Layout,
					{ responsive: true, displayModeBar: false }
				);
			}
		});
	}

	function renderMarkdown(text: string): string {
		return marked.parse(text) as string;
	}

	async function saveQuery() {
		if (!queryName.trim()) return;

		saveLoading = true;

		try {
			const response = await fetch('/api/queries', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: queryName.trim(),
					description: queryDescription.trim() || null,
					queryType,
					code
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to save query');
			}

			queryName = '';
			queryDescription = '';
			queryType = 'general';
			showSaveForm = false;
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save query';
		} finally {
			saveLoading = false;
		}
	}

	async function updateQuery() {
		if (!selectedQuery) return;

		saveLoading = true;

		try {
			const response = await fetch(`/api/queries/${selectedQuery.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: queryName.trim(),
					description: queryDescription.trim() || null,
					queryType,
					code
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to update query');
			}

			selectedQuery = null;
			queryName = '';
			queryDescription = '';
			queryType = 'general';
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update query';
		} finally {
			saveLoading = false;
		}
	}

	async function deleteQuery(id: string) {
		if (!confirm('Delete this saved query?')) return;

		try {
			const response = await fetch(`/api/queries/${id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete query');
			}

			if (selectedQuery?.id === id) {
				selectedQuery = null;
			}
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete query';
		}
	}

	function loadQuery(query: typeof data.savedQueries[0]) {
		code = query.code;
		selectedQuery = query;
		queryName = query.name;
		queryDescription = query.description || '';
		queryType = (query.queryType as QueryType) || 'general';
	}

	function formatResult(value: unknown): string {
		return JSON.stringify(value, null, 2);
	}
</script>

<svelte:head>
	<title>Query Playground - OKR Tracker</title>
</svelte:head>

<div class="queries-page">
	<header class="page-header">
		<h1>Query Playground</h1>
		<p class="text-muted">Write custom JavaScript queries to analyze your OKR data</p>
	</header>

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	<div class="query-layout">
		<div class="editor-section">
			<div class="card editor-card">
				<div class="editor-header">
					<h2>Code Editor</h2>
					<div class="editor-actions">
						{#if selectedQuery}
							<button class="btn btn-secondary btn-sm" onclick={() => startNewQuery('general')}>
								New Query
							</button>
							<button class="btn btn-primary btn-sm" onclick={updateQuery} disabled={saveLoading}>
								Update "{selectedQuery.name}"
							</button>
						{:else}
							<button class="btn btn-secondary btn-sm" onclick={() => showSaveForm = !showSaveForm}>
								{showSaveForm ? 'Cancel' : 'Save As...'}
							</button>
						{/if}
						<button class="btn btn-primary" onclick={runQuery} disabled={loading}>
							{loading ? 'Running...' : 'Run Query'}
						</button>
					</div>
				</div>

				{#if !selectedQuery}
					<div class="new-query-type-tabs">
						<span class="type-label">New:</span>
						<button
							class="type-tab"
							class:active={queryType === 'general'}
							onclick={() => startNewQuery('general')}
						>General</button>
						<button
							class="type-tab"
							class:active={queryType === 'progress'}
							onclick={() => startNewQuery('progress')}
						>Progress (0-1)</button>
						<button
							class="type-tab"
							class:active={queryType === 'widget'}
							onclick={() => startNewQuery('widget')}
						>Widget (Markdown)</button>
					</div>
				{/if}

				{#if showSaveForm && !selectedQuery}
					<div class="save-form">
						<input
							type="text"
							class="input"
							placeholder="Query name"
							bind:value={queryName}
						/>
						<input
							type="text"
							class="input"
							placeholder="Description (optional)"
							bind:value={queryDescription}
						/>
						<button class="btn btn-primary btn-sm" onclick={saveQuery} disabled={saveLoading || !queryName.trim()}>
							{saveLoading ? 'Saving...' : 'Save'}
						</button>
					</div>
				{/if}

				{#if selectedQuery}
					<div class="edit-type-row">
						<label>Type:</label>
						<select class="input type-select" bind:value={queryType}>
							<option value="general">General</option>
							<option value="progress">Progress (0-1)</option>
							<option value="widget">Widget (Markdown)</option>
						</select>
					</div>
				{/if}

				<textarea
					class="code-editor"
					bind:value={code}
					oninput={() => codeModified = true}
					spellcheck="false"
					placeholder="Write your query here..."
				></textarea>
			</div>

			<div class="card result-card">
				<h2>Result</h2>
				{#if loading}
					<p class="text-muted">Running query...</p>
				{:else if renders.length > 0}
					<div class="renders">
						{#each renders as render, index}
							{#if render.type === 'markdown'}
								<div class="render-markdown">
									{@html renderMarkdown(render.content as string)}
								</div>
							{:else if render.type === 'table'}
								{@const tableData = render.content as TableData}
								<div class="render-table">
									<table>
										<thead>
											<tr>
												{#each tableData.headers as header}
													<th>{header}</th>
												{/each}
											</tr>
										</thead>
										<tbody>
											{#each tableData.rows as row}
												<tr>
													{#each row as cell}
														<td>{cell}</td>
													{/each}
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{:else if render.type === 'plotly'}
								<div class="render-plotly" bind:this={plotContainers[index]}></div>
							{/if}
						{/each}
					</div>
					{#if result !== null && result !== undefined}
						<div class="return-value">
							<h3>Return Value</h3>
							<pre class="result-output">{formatResult(result)}</pre>
						</div>
					{/if}
				{:else if result !== null}
					<pre class="result-output">{formatResult(result)}</pre>
				{:else}
					<p class="text-muted">Run a query to see results</p>
				{/if}
			</div>
		</div>

		<div class="saved-section">
			<div class="card">
				<h2>Saved Queries</h2>

				<div class="type-tabs">
					<button
						class="type-tab"
						class:active={selectedTypeFilter === 'all'}
						onclick={() => selectedTypeFilter = 'all'}
					>All</button>
					<button
						class="type-tab"
						class:active={selectedTypeFilter === 'progress'}
						onclick={() => selectedTypeFilter = 'progress'}
					>Progress</button>
					<button
						class="type-tab"
						class:active={selectedTypeFilter === 'widget'}
						onclick={() => selectedTypeFilter = 'widget'}
					>Widget</button>
					<button
						class="type-tab"
						class:active={selectedTypeFilter === 'general'}
						onclick={() => selectedTypeFilter = 'general'}
					>General</button>
				</div>

				{#if filteredQueries.length === 0}
					<p class="text-muted">No {selectedTypeFilter === 'all' ? '' : selectedTypeFilter + ' '}queries yet</p>
				{:else}
					<ul class="saved-queries-list">
						{#each filteredQueries as query}
							<li class:active={selectedQuery?.id === query.id}>
								<button class="query-item" onclick={() => loadQuery(query)}>
									<div class="query-header">
										<span class="query-name">{query.name}</span>
										<span class="query-type-badge" class:type-progress={query.queryType === 'progress'} class:type-widget={query.queryType === 'widget'}>
											{query.queryType || 'general'}
										</span>
									</div>
									{#if query.description}
										<span class="query-desc">{query.description}</span>
									{/if}
								</button>
								<button
									class="btn-icon btn-icon-sm"
									onclick={() => deleteQuery(query.id)}
									title="Delete"
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<line x1="18" y1="6" x2="6" y2="18"/>
										<line x1="6" y1="6" x2="18" y2="18"/>
									</svg>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="card">
				<h2>API Reference</h2>
				<div class="api-docs">
					<h3>Render API</h3>
					<code>render.markdown(text)</code>
					<p>Render markdown text (supports tables, lists, etc.)</p>

					<code>render.table(&#123; headers, rows &#125;)</code>
					<p>Render a structured table</p>

					<code>render.plot.bar(&#123; x, y, name &#125;)</code>
					<code>render.plot.line(&#123; x, y, name &#125;)</code>
					<code>render.plot.pie(&#123; labels, values &#125;)</code>
					<code>render.plot.multi([&#123;...&#125;])</code>
					<p>Render Plotly charts</p>

					<h3>Data Fetching</h3>
					<code>q.daily(&#123; year, month, week, from, to &#125;)</code>
					<p>Get daily records with metrics and tasks</p>

					<code>q.tasks(&#123; year, tag, completed &#125;)</code>
					<p>Get tasks with attributes and tags</p>

					<code>q.objectives(&#123; year, level &#125;)</code>
					<p>Get objectives with key results</p>

					<h3>Helpers</h3>
					<code>q.sum(items, 'field')</code>
					<code>q.avg(items, 'field')</code>
					<code>q.count(items)</code>
					<code>q.parseTime('7:30')</code>
					<code>q.formatDuration(450)</code>
					<code>q.formatPercent(3, 10)</code>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.queries-page {
		max-width: 1400px;
		margin: 0 auto;
		padding: var(--spacing-lg);
	}

	.page-header {
		margin-bottom: var(--spacing-lg);
	}

	.page-header h1 {
		margin: 0 0 var(--spacing-xs);
	}

	.error-banner {
		background-color: #fef2f2;
		border: 1px solid #fecaca;
		color: var(--color-error);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.query-layout {
		display: grid;
		grid-template-columns: 1fr 300px;
		gap: var(--spacing-lg);
	}

	@media (max-width: 1024px) {
		.query-layout {
			grid-template-columns: 1fr;
		}
	}

	.editor-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.editor-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
	}

	.editor-header h2 {
		margin: 0;
		font-size: 1rem;
	}

	.editor-actions {
		display: flex;
		gap: var(--spacing-sm);
	}

	.save-form {
		display: flex;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		background-color: var(--color-bg);
		border-radius: var(--radius-sm);
	}

	.save-form .input {
		flex: 1;
	}

	.save-form .type-select {
		flex: 0 0 auto;
		width: auto;
		min-width: 120px;
	}

	.edit-type-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		background-color: var(--color-bg);
		border-radius: var(--radius-sm);
	}

	.edit-type-row label {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.edit-type-row .type-select {
		flex: 1;
	}

	.new-query-type-tabs {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		background-color: var(--color-bg);
		border-radius: var(--radius-sm);
	}

	.new-query-type-tabs .type-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.new-query-type-tabs .type-tab {
		flex: none;
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.75rem;
	}

	.type-tabs {
		display: flex;
		gap: 2px;
		margin-bottom: var(--spacing-md);
		background-color: var(--color-bg);
		border-radius: var(--radius-sm);
		padding: 2px;
	}

	.type-tab {
		flex: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
		border: none;
		background: transparent;
		font-size: 0.75rem;
		cursor: pointer;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		transition: all 0.15s ease;
	}

	.type-tab:hover {
		color: var(--color-text);
	}

	.type-tab.active {
		background-color: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-sm);
	}

	.query-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.query-type-badge {
		font-size: 0.625rem;
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		background-color: var(--color-bg);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.query-type-badge.type-progress {
		background-color: rgb(59 130 246 / 0.15);
		color: rgb(59 130 246);
	}

	.query-type-badge.type-widget {
		background-color: rgb(139 92 246 / 0.15);
		color: rgb(139 92 246);
	}

	.code-editor {
		width: 100%;
		min-height: 400px;
		padding: var(--spacing-md);
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
		font-size: 0.875rem;
		line-height: 1.5;
		background-color: #1e1e1e;
		color: #d4d4d4;
		border: none;
		border-radius: var(--radius-md);
		resize: vertical;
		tab-size: 2;
	}

	.code-editor:focus {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	.result-card h2 {
		margin: 0 0 var(--spacing-md);
		font-size: 1rem;
	}

	.result-output {
		padding: var(--spacing-md);
		background-color: var(--color-bg);
		border-radius: var(--radius-md);
		font-family: monospace;
		font-size: 0.875rem;
		overflow-x: auto;
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.saved-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.saved-section h2 {
		margin: 0 0 var(--spacing-md);
		font-size: 1rem;
	}

	.saved-queries-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.saved-queries-list li {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		border-bottom: 1px solid var(--color-border);
	}

	.saved-queries-list li:last-child {
		border-bottom: none;
	}

	.saved-queries-list li.active {
		background-color: rgb(59 130 246 / 0.1);
		margin: 0 calc(-1 * var(--spacing-lg));
		padding: 0 var(--spacing-lg);
	}

	.query-item {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--spacing-sm) 0;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
	}

	.query-item:hover {
		color: var(--color-primary);
	}

	.query-name {
		font-weight: 500;
		font-size: 0.875rem;
	}

	.query-desc {
		font-size: 0.75rem;
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

	.btn-icon-sm {
		width: 24px;
		height: 24px;
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.75rem;
	}

	.api-docs {
		font-size: 0.875rem;
	}

	.api-docs h3 {
		margin: var(--spacing-md) 0 var(--spacing-xs);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.api-docs h3:first-child {
		margin-top: 0;
	}

	.api-docs code {
		display: block;
		padding: var(--spacing-xs) var(--spacing-sm);
		background-color: var(--color-bg);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		margin-bottom: var(--spacing-xs);
	}

	.api-docs p {
		margin: 0 0 var(--spacing-sm);
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}

	/* Render output styles */
	.renders {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.render-markdown {
		font-size: 0.875rem;
		line-height: 1.6;
	}

	.render-markdown :global(h1),
	.render-markdown :global(h2),
	.render-markdown :global(h3) {
		margin: 0 0 var(--spacing-sm);
	}

	.render-markdown :global(h1) { font-size: 1.5rem; }
	.render-markdown :global(h2) { font-size: 1.25rem; }
	.render-markdown :global(h3) { font-size: 1rem; }

	.render-markdown :global(p) {
		margin: 0 0 var(--spacing-sm);
	}

	.render-markdown :global(p:last-child) {
		margin-bottom: 0;
	}

	.render-markdown :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	.render-markdown :global(th),
	.render-markdown :global(td) {
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid var(--color-border);
		text-align: left;
	}

	.render-markdown :global(th) {
		background: var(--color-bg);
		font-weight: 600;
	}

	.render-table {
		overflow-x: auto;
	}

	.render-table table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	.render-table th,
	.render-table td {
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid var(--color-border);
		text-align: left;
	}

	.render-table th {
		background: var(--color-bg);
		font-weight: 600;
	}

	.render-plotly {
		min-height: 250px;
	}

	.return-value {
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.return-value h3 {
		margin: 0 0 var(--spacing-sm);
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}
</style>
