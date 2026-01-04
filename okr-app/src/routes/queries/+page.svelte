<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let code = $state(`// Query API Example
// Available methods:
//   q.daily({ year, month, week, from, to })
//   q.tasks({ year, tag, completed })
//   q.objectives({ year, level })
//
// Helper functions:
//   q.sum(items, field)
//   q.avg(items, field)
//   q.count(items)
//   q.parseTime("7:30") -> 450 (minutes)
//   q.formatDuration(450) -> "7h 30m"
//   q.formatPercent(3, 10) -> "30%"

// Example: Get this month's sleep data
const days = await q.daily({ year: 2025, month: 1 });

const sleepData = days.map(d => ({
  date: d.date,
  sleep: d.sleepLength,
  sleepMinutes: q.parseTime(d.sleepLength || "0:00")
}));

const avgSleep = q.avg(sleepData, 'sleepMinutes');

return {
  days: sleepData.length,
  avgSleep: q.formatDuration(avgSleep),
  goodSleepDays: sleepData.filter(d => d.sleepMinutes >= 420).length
};`);

	let result = $state<unknown>(null);
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

		try {
			const response = await fetch('/api/queries/execute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Query failed');
			}

			result = data.result;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Query execution failed';
		} finally {
			loading = false;
		}
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
					code
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to save query');
			}

			queryName = '';
			queryDescription = '';
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
							<button class="btn btn-secondary btn-sm" onclick={() => { selectedQuery = null; queryName = ''; queryDescription = ''; }}>
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

				<textarea
					class="code-editor"
					bind:value={code}
					spellcheck="false"
					placeholder="Write your query here..."
				></textarea>
			</div>

			<div class="card result-card">
				<h2>Result</h2>
				{#if loading}
					<p class="text-muted">Running query...</p>
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

				{#if data.savedQueries.length === 0}
					<p class="text-muted">No saved queries yet</p>
				{:else}
					<ul class="saved-queries-list">
						{#each data.savedQueries as query}
							<li class:active={selectedQuery?.id === query.id}>
								<button class="query-item" onclick={() => loadQuery(query)}>
									<span class="query-name">{query.name}</span>
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
</style>
