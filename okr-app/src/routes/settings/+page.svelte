<script lang="ts">
	let { data } = $props();

	let restoreFile = $state<File | null>(null);
	let restoring = $state(false);
	let downloading = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	async function downloadBackup() {
		downloading = true;
		message = null;

		try {
			const response = await fetch('/api/backup');

			if (!response.ok) {
				throw new Error('Failed to create backup');
			}

			// Get filename from Content-Disposition header or use default
			const disposition = response.headers.get('Content-Disposition');
			const filenameMatch = disposition?.match(/filename="(.+)"/);
			const filename = filenameMatch?.[1] || `okr-backup-${new Date().toISOString().split('T')[0]}.json`;

			// Download the file
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			message = { type: 'success', text: 'Backup downloaded successfully' };
		} catch (error) {
			message = { type: 'error', text: error instanceof Error ? error.message : 'Failed to download backup' };
		} finally {
			downloading = false;
		}
	}

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		restoreFile = input.files?.[0] || null;
	}

	async function restoreBackup() {
		if (!restoreFile) return;

		if (!confirm('This will import data from the backup file. Existing data with the same IDs will be skipped. Continue?')) {
			return;
		}

		restoring = true;
		message = null;

		try {
			const text = await restoreFile.text();
			const backup = JSON.parse(text);

			const response = await fetch('/api/backup/restore', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(backup)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to restore backup');
			}

			const stats = result.stats;
			const imported = Object.entries(stats)
				.filter(([, count]) => (count as number) > 0)
				.map(([key, count]) => `${count} ${key}`)
				.join(', ');

			message = {
				type: 'success',
				text: imported ? `Restored: ${imported}` : 'Backup processed (no new data to import)'
			};
			restoreFile = null;
		} catch (error) {
			message = { type: 'error', text: error instanceof Error ? error.message : 'Failed to restore backup' };
		} finally {
			restoring = false;
		}
	}
</script>

<svelte:head>
	<title>Settings - OKR Tracker</title>
</svelte:head>

<div class="settings-page">
	<header class="page-header">
		<h1>Settings</h1>
	</header>

	{#if message}
		<div class="message" class:success={message.type === 'success'} class:error={message.type === 'error'}>
			{message.text}
		</div>
	{/if}

	<div class="settings-grid">
		<!-- Navigation Cards -->
		<a href="/settings/plugins" class="card settings-card">
			<div class="card-icon">🔌</div>
			<div class="card-content">
				<h2>Integrations</h2>
				<p class="text-muted">Connect Fitbit and other services to import health data automatically</p>
			</div>
			<span class="card-arrow">→</span>
		</a>

		<!-- Backup Section -->
		<div class="card">
			<h2>Backup & Restore</h2>
			<p class="text-muted mb-md">Export your data or restore from a previous backup</p>

			<div class="backup-section">
				<div class="backup-action">
					<h3>Download Backup</h3>
					<p class="text-muted">Export all your OKRs, tasks, metrics, and queries to a JSON file</p>
					<button class="btn btn-primary" onclick={downloadBackup} disabled={downloading}>
						{downloading ? 'Downloading...' : 'Download Backup'}
					</button>
				</div>

				<div class="backup-action">
					<h3>Restore from Backup</h3>
					<p class="text-muted">Import data from a previously downloaded backup file</p>
					<div class="restore-form">
						<input
							type="file"
							accept=".json"
							onchange={handleFileSelect}
							class="file-input"
							id="restore-file"
						/>
						<label for="restore-file" class="btn btn-secondary file-label">
							{restoreFile ? restoreFile.name : 'Choose File...'}
						</label>
						<button
							class="btn btn-primary"
							onclick={restoreBackup}
							disabled={!restoreFile || restoring}
						>
							{restoring ? 'Restoring...' : 'Restore'}
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Account Info -->
		<div class="card">
			<h2>Account</h2>
			<div class="account-info">
				<div class="info-row">
					<span class="info-label">Username</span>
					<span class="info-value">{data.user?.username}</span>
				</div>
			</div>
		</div>
	</div>
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

	.settings-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.settings-card {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		text-decoration: none;
		color: inherit;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
	}

	.settings-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
		text-decoration: none;
	}

	.card-icon {
		font-size: 2rem;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--color-bg);
		border-radius: var(--radius-md);
		flex-shrink: 0;
	}

	.card-content {
		flex: 1;
	}

	.card-content h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	.card-content p {
		margin: var(--spacing-xs) 0 0;
		font-size: 0.875rem;
	}

	.card-arrow {
		font-size: 1.25rem;
		color: var(--color-text-muted);
	}

	.card h2 {
		margin: 0 0 var(--spacing-xs);
		font-size: 1.125rem;
	}

	.backup-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
		margin-top: var(--spacing-md);
	}

	.backup-action {
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.backup-action:first-child {
		padding-top: 0;
		border-top: none;
	}

	.backup-action h3 {
		margin: 0 0 var(--spacing-xs);
		font-size: 1rem;
	}

	.backup-action p {
		margin: 0 0 var(--spacing-md);
		font-size: 0.875rem;
	}

	.restore-form {
		display: flex;
		gap: var(--spacing-sm);
		align-items: center;
		flex-wrap: wrap;
	}

	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		border: 0;
	}

	.file-label {
		flex: 1;
		min-width: 150px;
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: pointer;
	}

	.account-info {
		margin-top: var(--spacing-md);
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		padding: var(--spacing-sm) 0;
	}

	.info-label {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.info-value {
		font-weight: 500;
	}

	@media (max-width: 768px) {
		.restore-form {
			flex-direction: column;
			align-items: stretch;
		}

		.file-label {
			max-width: none;
		}
	}
</style>
