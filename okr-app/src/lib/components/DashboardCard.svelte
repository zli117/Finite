<script lang="ts">
	import { onMount, tick } from 'svelte';
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

	interface SavedQuery {
		id: string;
		name: string;
		code: string;
	}

	interface Props {
		title: string;
		code: string;
		savedQueries?: SavedQuery[];
		onSave?: (title: string, code: string) => void;
		onDelete?: () => void;
	}

	let { title, code, savedQueries = [], onSave, onDelete }: Props = $props();

	let localTitle = $state(title);
	let localCode = $state(code);
	let selectedQueryId = $state<string | null>(null);
	let editing = $state(false);
	let renders = $state<RenderOutput[]>([]);
	let error = $state('');
	let loading = $state(true);
	let plotContainers: Record<number, HTMLDivElement> = {};

	onMount(() => {
		if (code) {
			executeQuery();
		} else {
			loading = false;
		}
	});

	async function executeQuery() {
		const codeToRun = localCode;
		if (!codeToRun.trim()) {
			loading = false;
			renders = [];
			return;
		}

		loading = true;
		error = '';
		renders = [];

		try {
			const response = await fetch('/api/queries/execute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: codeToRun })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Query failed');
			}

			renders = data.renders || [];

			// Render Plotly charts after DOM update
			await tick();
			renderPlotlyCharts();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to execute query';
		} finally {
			loading = false;
		}
	}

	async function renderPlotlyCharts() {
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

	function handleSavedQuerySelect(e: Event) {
		const id = (e.target as HTMLSelectElement).value;
		selectedQueryId = id || null;

		if (id) {
			const query = savedQueries.find(q => q.id === id);
			if (query) {
				localCode = query.code;
			}
		}
	}

	function startEditing() {
		editing = true;
	}

	function cancelEditing() {
		localTitle = title;
		localCode = code;
		selectedQueryId = null;
		editing = false;
	}

	function saveChanges() {
		onSave?.(localTitle, localCode);
		editing = false;
		executeQuery();
	}

	function renderMarkdown(text: string): string {
		return marked.parse(text) as string;
	}

	$effect(() => {
		// Re-render Plotly when renders change
		if (renders.some(r => r.type === 'plotly') && !loading) {
			tick().then(renderPlotlyCharts);
		}
	});
</script>

<div class="dashboard-card card" class:editing>
	{#if editing}
		<div class="edit-mode">
			<div class="edit-header">
				<input
					type="text"
					class="input title-input"
					bind:value={localTitle}
					placeholder="Card title"
				/>
				<div class="edit-actions">
					<button class="btn btn-sm btn-secondary" onclick={cancelEditing}>Cancel</button>
					<button class="btn btn-sm btn-primary" onclick={saveChanges}>Save</button>
					{#if onDelete}
						<button class="btn btn-sm btn-danger" onclick={onDelete}>Delete</button>
					{/if}
				</div>
			</div>

			{#if savedQueries.length > 0}
				<select class="input" value={selectedQueryId || ''} onchange={handleSavedQuerySelect}>
					<option value="">Write custom code...</option>
					{#each savedQueries as query}
						<option value={query.id}>{query.name}</option>
					{/each}
				</select>
			{/if}

			<textarea
				class="input code-editor"
				bind:value={localCode}
				placeholder={"// Query code using render API\n// render.markdown('# Hello')\n// render.table({ headers: [...], rows: [...] })\n// render.plot.bar({ x: [...], y: [...] })"}
				rows="8"
			></textarea>

			<div class="help-text">
				<strong>Render API:</strong>
				<code>render.markdown(text)</code>,
				<code>render.table(&#123;headers, rows&#125;)</code>,
				<code>render.plot.bar/line/pie(...)</code>
			</div>
		</div>
	{:else}
		<div class="display-mode">
			<div class="card-header">
				<h3 class="card-title">{localTitle || 'Untitled'}</h3>
				<button class="edit-btn" onclick={startEditing} title="Edit">
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z"/>
					</svg>
				</button>
			</div>

			{#if loading}
				<div class="loading">Loading...</div>
			{:else if error}
				<div class="error">{error}</div>
			{:else if renders.length === 0}
				{#if !localCode.trim()}
					<div class="empty" onclick={startEditing}>Click to add a query</div>
				{:else}
					<div class="empty">No output - use render.* functions</div>
				{/if}
			{:else}
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
			{/if}
		</div>
	{/if}
</div>

<style>
	.dashboard-card {
		min-height: 150px;
		transition: box-shadow 0.15s ease;
	}

	.dashboard-card.editing {
		box-shadow: 0 0 0 2px var(--color-primary);
	}

	.edit-mode {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.edit-header {
		display: flex;
		gap: var(--spacing-md);
		align-items: center;
	}

	.title-input {
		flex: 1;
		font-weight: 600;
	}

	.edit-actions {
		display: flex;
		gap: var(--spacing-xs);
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.75rem;
	}

	.btn-danger {
		background-color: var(--color-error);
		color: white;
	}

	.btn-danger:hover {
		opacity: 0.9;
	}

	.code-editor {
		font-family: monospace;
		font-size: 0.8rem;
		resize: vertical;
	}

	.help-text {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.help-text code {
		background: var(--color-bg);
		padding: 2px 4px;
		border-radius: 2px;
		font-size: 0.7rem;
	}

	.display-mode {
		position: relative;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--spacing-md);
	}

	.card-title {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.edit-btn {
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
		opacity: 0;
		transition: all 0.15s ease;
	}

	.dashboard-card:hover .edit-btn {
		opacity: 1;
	}

	.edit-btn:hover {
		background-color: var(--color-bg-hover);
		color: var(--color-text);
	}

	.loading, .empty {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.empty {
		cursor: pointer;
		padding: var(--spacing-lg);
		text-align: center;
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-md);
	}

	.empty:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.error {
		color: var(--color-error);
		font-size: 0.875rem;
	}

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
		min-height: 200px;
	}
</style>
