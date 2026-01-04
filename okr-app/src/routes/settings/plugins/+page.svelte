<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let syncing = $state<string | null>(null);
	let syncResult = $state<{ success: boolean; message: string } | null>(null);

	async function connectPlugin(pluginId: string) {
		// Redirect to OAuth flow
		window.location.href = `/api/plugins/${pluginId}/auth`;
	}

	async function disconnectPlugin(pluginId: string) {
		if (!confirm('Disconnect this plugin? Your data will be preserved but no new data will sync.')) {
			return;
		}

		try {
			const response = await fetch(`/api/plugins/${pluginId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to disconnect');
			}

			await invalidateAll();
		} catch (error) {
			console.error('Failed to disconnect:', error);
		}
	}

	async function syncPlugin(pluginId: string) {
		syncing = pluginId;
		syncResult = null;

		try {
			const response = await fetch(`/api/plugins/${pluginId}/sync`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Sync failed');
			}

			syncResult = {
				success: result.success,
				message: result.success
					? `Imported ${result.recordsImported} records`
					: `Partial sync: ${result.recordsImported} records, ${result.errors?.length || 0} errors`
			};

			await invalidateAll();
		} catch (error) {
			syncResult = {
				success: false,
				message: error instanceof Error ? error.message : 'Sync failed'
			};
		} finally {
			syncing = null;
		}
	}

	function formatDate(date: Date | string | null): string {
		if (!date) return 'Never';
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Plugin Settings - OKR Tracker</title>
</svelte:head>

<div class="settings-page">
	<header class="page-header">
		<h1>Integrations</h1>
		<p class="text-muted">Connect external services to automatically import your health and fitness data.</p>
	</header>

	{#if data.success}
		<div class="success-banner">
			{data.success === 'fitbit' ? 'Fitbit connected successfully!' : 'Plugin connected successfully!'}
		</div>
	{/if}

	{#if data.error}
		<div class="error-banner">
			{#if data.error === 'invalid_state'}
				Authorization failed. Please try again.
			{:else if data.error === 'expired'}
				Authorization expired. Please try again.
			{:else if data.error === 'token_exchange_failed'}
				Failed to connect. Please check your Fitbit credentials and try again.
			{:else}
				{data.error}
			{/if}
		</div>
	{/if}

	{#if syncResult}
		<div class="result-banner" class:success={syncResult.success} class:error={!syncResult.success}>
			{syncResult.message}
		</div>
	{/if}

	<div class="plugins-list">
		{#each data.plugins as plugin}
			<div class="card plugin-card">
				<div class="plugin-header">
					<div class="plugin-icon">{plugin.icon || '🔌'}</div>
					<div class="plugin-info">
						<h2 class="plugin-name">{plugin.name}</h2>
						<p class="plugin-desc">{plugin.description}</p>
					</div>
					<div class="plugin-status">
						{#if plugin.connected}
							<span class="status-badge connected">Connected</span>
						{:else}
							<span class="status-badge disconnected">Not Connected</span>
						{/if}
					</div>
				</div>

				{#if plugin.connected}
					<div class="plugin-details">
						<div class="sync-info">
							<span class="sync-label">Last sync:</span>
							<span class="sync-value">{formatDate(plugin.lastSync)}</span>
						</div>

						<div class="plugin-fields">
							<h3>Available Data</h3>
							<div class="fields-grid">
								{#each plugin.fields as field}
									<div class="field-item">
										<span class="field-name">{field.name}</span>
										{#if field.unit}
											<span class="field-unit">{field.unit}</span>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					</div>

					<div class="plugin-actions">
						<button
							class="btn btn-primary"
							onclick={() => syncPlugin(plugin.id)}
							disabled={syncing === plugin.id}
						>
							{syncing === plugin.id ? 'Syncing...' : 'Sync Now'}
						</button>
						<button
							class="btn btn-secondary"
							onclick={() => disconnectPlugin(plugin.id)}
						>
							Disconnect
						</button>
					</div>
				{:else}
					<div class="plugin-fields">
						<h3>Available Data</h3>
						<div class="fields-grid">
							{#each plugin.fields as field}
								<div class="field-item">
									<span class="field-name">{field.name}</span>
									<span class="field-desc">{field.description}</span>
								</div>
							{/each}
						</div>
					</div>

					<div class="plugin-actions">
						<button
							class="btn btn-primary"
							onclick={() => connectPlugin(plugin.id)}
						>
							Connect {plugin.name}
						</button>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<section class="setup-info card">
		<h2>Setup Instructions</h2>
		<p class="text-muted mb-md">To use the Fitbit integration, you need to:</p>
		<ol>
			<li>Create a Fitbit Developer account at <a href="https://dev.fitbit.com" target="_blank" rel="noopener">dev.fitbit.com</a></li>
			<li>Register a new application with:
				<ul>
					<li>OAuth 2.0 Application Type: <strong>Personal</strong></li>
					<li>Callback URL: <code>YOUR_DOMAIN/api/plugins/fitbit/callback</code></li>
				</ul>
			</li>
			<li>Add the following environment variables:
				<ul>
					<li><code>FITBIT_CLIENT_ID</code> - Your Fitbit OAuth 2.0 Client ID</li>
					<li><code>FITBIT_CLIENT_SECRET</code> - Your Fitbit Client Secret</li>
					<li><code>PUBLIC_BASE_URL</code> - Your app's public URL (e.g., https://okr.example.com)</li>
				</ul>
			</li>
		</ol>
	</section>
</div>

<style>
	.settings-page {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--spacing-lg);
	}

	.page-header {
		margin-bottom: var(--spacing-lg);
	}

	.page-header h1 {
		margin: 0 0 var(--spacing-xs);
	}

	.success-banner {
		background-color: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: var(--color-success);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.error-banner {
		background-color: #fef2f2;
		border: 1px solid #fecaca;
		color: var(--color-error);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.result-banner {
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.result-banner.success {
		background-color: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: var(--color-success);
	}

	.result-banner.error {
		background-color: #fef2f2;
		border: 1px solid #fecaca;
		color: var(--color-error);
	}

	.plugins-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-xl);
	}

	.plugin-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.plugin-header {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-md);
	}

	.plugin-icon {
		font-size: 2rem;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.plugin-info {
		flex: 1;
	}

	.plugin-name {
		margin: 0;
		font-size: 1.125rem;
	}

	.plugin-desc {
		margin: var(--spacing-xs) 0 0;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.status-badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 500;
	}

	.status-badge.connected {
		background-color: #dcfce7;
		color: #166534;
	}

	.status-badge.disconnected {
		background-color: var(--color-bg-hover);
		color: var(--color-text-muted);
	}

	.plugin-details {
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.sync-info {
		display: flex;
		gap: var(--spacing-sm);
		font-size: 0.875rem;
		margin-bottom: var(--spacing-md);
	}

	.sync-label {
		color: var(--color-text-muted);
	}

	.plugin-fields {
		margin-top: var(--spacing-md);
	}

	.plugin-fields h3 {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		margin: 0 0 var(--spacing-sm);
	}

	.fields-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--spacing-sm);
	}

	.field-item {
		display: flex;
		flex-direction: column;
		padding: var(--spacing-sm);
		background-color: var(--color-bg);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
	}

	.field-name {
		font-weight: 500;
	}

	.field-unit {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.field-desc {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.plugin-actions {
		display: flex;
		gap: var(--spacing-sm);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.setup-info {
		font-size: 0.875rem;
	}

	.setup-info h2 {
		font-size: 1rem;
		margin: 0 0 var(--spacing-md);
	}

	.setup-info ol {
		margin: 0;
		padding-left: var(--spacing-lg);
	}

	.setup-info li {
		margin-bottom: var(--spacing-sm);
	}

	.setup-info ul {
		margin: var(--spacing-xs) 0;
		padding-left: var(--spacing-md);
	}

	.setup-info code {
		background-color: var(--color-bg);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
	}

	.setup-info a {
		color: var(--color-primary);
	}
</style>
