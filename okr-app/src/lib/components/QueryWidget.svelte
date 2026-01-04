<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		title: string;
		code?: string;
		queryId?: string;
		params?: Record<string, unknown>;
	}

	let { title, code, queryId, params = {} }: Props = $props();

	let result = $state<unknown>(null);
	let error = $state('');
	let loading = $state(true);

	onMount(() => {
		loadData();
	});

	async function loadData() {
		loading = true;
		error = '';

		try {
			let response: Response;

			if (queryId) {
				// Run saved query
				response = await fetch(`/api/queries/${queryId}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ params })
				});
			} else if (code) {
				// Run inline code
				response = await fetch('/api/queries/execute', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ code, params })
				});
			} else {
				throw new Error('No query code or ID provided');
			}

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Query failed');
			}

			result = data.result;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load widget';
		} finally {
			loading = false;
		}
	}

	function formatValue(value: unknown): string {
		if (value === null || value === undefined) return '-';
		if (typeof value === 'number') return value.toLocaleString();
		if (typeof value === 'string') return value;
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	function isSimpleResult(value: unknown): boolean {
		if (value === null || value === undefined) return true;
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
		if (typeof value === 'object' && !Array.isArray(value)) {
			const keys = Object.keys(value);
			return keys.length <= 4 && keys.every(k => {
				const v = (value as Record<string, unknown>)[k];
				return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
			});
		}
		return false;
	}
</script>

<div class="widget card">
	<h3 class="widget-title">{title}</h3>

	{#if loading}
		<div class="widget-loading">Loading...</div>
	{:else if error}
		<div class="widget-error">{error}</div>
	{:else if result !== null}
		{#if isSimpleResult(result)}
			{#if typeof result === 'object' && result !== null}
				<div class="widget-stats">
					{#each Object.entries(result) as [key, value]}
						<div class="stat-item">
							<span class="stat-value">{formatValue(value)}</span>
							<span class="stat-label">{key.replace(/_/g, ' ')}</span>
						</div>
					{/each}
				</div>
			{:else}
				<div class="widget-value">{formatValue(result)}</div>
			{/if}
		{:else}
			<pre class="widget-json">{JSON.stringify(result, null, 2)}</pre>
		{/if}
	{:else}
		<div class="widget-empty">No data</div>
	{/if}

	<button class="refresh-btn" onclick={loadData} title="Refresh">
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
			<path d="M3 3v5h5"/>
			<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
			<path d="M16 16h5v5"/>
		</svg>
	</button>
</div>

<style>
	.widget {
		position: relative;
		min-height: 100px;
	}

	.widget-title {
		margin: 0 0 var(--spacing-md);
		font-size: 0.875rem;
		font-weight: 600;
	}

	.widget-loading,
	.widget-empty {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.widget-error {
		color: var(--color-error);
		font-size: 0.875rem;
	}

	.widget-value {
		font-size: 2rem;
		font-weight: 700;
		color: var(--color-primary);
	}

	.widget-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
		gap: var(--spacing-md);
	}

	.stat-item {
		display: flex;
		flex-direction: column;
		text-align: center;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-primary);
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-transform: capitalize;
	}

	.widget-json {
		font-family: monospace;
		font-size: 0.75rem;
		background-color: var(--color-bg);
		padding: var(--spacing-sm);
		border-radius: var(--radius-sm);
		overflow-x: auto;
		margin: 0;
		max-height: 200px;
		overflow-y: auto;
	}

	.refresh-btn {
		position: absolute;
		top: var(--spacing-md);
		right: var(--spacing-md);
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

	.widget:hover .refresh-btn {
		opacity: 1;
	}

	.refresh-btn:hover {
		background-color: var(--color-bg-hover);
		color: var(--color-text);
	}
</style>
