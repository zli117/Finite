<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';

	let { data } = $props();

	let loading = $state(false);
	let error = $state('');
	let success = $state('');

	// Form fields
	let previousNightBedTime = $state(data.metrics?.previousNightBedTime || '');
	let wakeUpTime = $state(data.metrics?.wakeUpTime || '');
	let sleepLength = $state(data.metrics?.sleepLength || '');
	let cardioLoad = $state(data.metrics?.cardioLoad?.toString() || '');
	let fitbitReadiness = $state(data.metrics?.fitbitReadiness?.toString() || '');
	let steps = $state(data.metrics?.steps?.toString() || '');
	let heartPoints = $state(data.metrics?.heartPoints?.toString() || '');
	let restingHeartRate = $state(data.metrics?.restingHeartRate?.toString() || '');

	const dateObj = $derived(new Date(data.date + 'T00:00:00'));
	const formattedDate = $derived(
		dateObj.toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	);

	async function saveMetrics() {
		loading = true;
		error = '';
		success = '';

		try {
			const response = await fetch(`/api/metrics/daily/${data.date}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					previousNightBedTime: previousNightBedTime || null,
					wakeUpTime: wakeUpTime || null,
					sleepLength: sleepLength || null,
					cardioLoad: cardioLoad ? parseInt(cardioLoad) : null,
					fitbitReadiness: fitbitReadiness ? parseInt(fitbitReadiness) : null,
					steps: steps ? parseInt(steps) : null,
					heartPoints: heartPoints ? parseInt(heartPoints) : null,
					restingHeartRate: restingHeartRate ? parseInt(restingHeartRate) : null
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save metrics');
			}

			success = 'Metrics saved successfully!';
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save metrics';
		} finally {
			loading = false;
		}
	}

	function goBack() {
		goto(`/daily/${data.date}`);
	}
</script>

<svelte:head>
	<title>Edit Metrics - {formattedDate} - OKR Tracker</title>
</svelte:head>

<div class="metrics-page">
	<header class="page-header">
		<button class="btn btn-secondary" onclick={goBack}>
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
			Back
		</button>
		<h1>Edit Metrics</h1>
		<div></div>
	</header>

	<p class="date-subtitle">{formattedDate}</p>

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	{#if success}
		<div class="success-banner">{success}</div>
	{/if}

	<form class="card metrics-form" onsubmit={(e) => { e.preventDefault(); saveMetrics(); }}>
		<h2 class="section-title">Sleep</h2>
		<div class="form-row">
			<div class="form-group">
				<label class="label" for="bedTime">Previous Night Bed Time</label>
				<input
					type="time"
					id="bedTime"
					class="input"
					bind:value={previousNightBedTime}
				/>
			</div>
			<div class="form-group">
				<label class="label" for="wakeUp">Wake Up Time</label>
				<input
					type="time"
					id="wakeUp"
					class="input"
					bind:value={wakeUpTime}
				/>
			</div>
			<div class="form-group">
				<label class="label" for="sleepLength">Sleep Length (HH:MM)</label>
				<input
					type="text"
					id="sleepLength"
					class="input"
					placeholder="7:30"
					bind:value={sleepLength}
				/>
			</div>
		</div>

		<h2 class="section-title">Activity</h2>
		<div class="form-row">
			<div class="form-group">
				<label class="label" for="steps">Steps</label>
				<input
					type="number"
					id="steps"
					class="input"
					placeholder="10000"
					bind:value={steps}
				/>
			</div>
			<div class="form-group">
				<label class="label" for="cardioLoad">Cardio Load (Active Zone Minutes)</label>
				<input
					type="number"
					id="cardioLoad"
					class="input"
					placeholder="30"
					bind:value={cardioLoad}
				/>
			</div>
			<div class="form-group">
				<label class="label" for="heartPoints">Heart Points</label>
				<input
					type="number"
					id="heartPoints"
					class="input"
					placeholder="50"
					bind:value={heartPoints}
				/>
			</div>
		</div>

		<h2 class="section-title">Health</h2>
		<div class="form-row">
			<div class="form-group">
				<label class="label" for="readiness">Fitbit Readiness Score</label>
				<input
					type="number"
					id="readiness"
					class="input"
					placeholder="75"
					min="0"
					max="100"
					bind:value={fitbitReadiness}
				/>
			</div>
			<div class="form-group">
				<label class="label" for="rhr">Resting Heart Rate (bpm)</label>
				<input
					type="number"
					id="rhr"
					class="input"
					placeholder="60"
					bind:value={restingHeartRate}
				/>
			</div>
		</div>

		<div class="form-actions">
			<button type="button" class="btn btn-secondary" onclick={goBack}>Cancel</button>
			<button type="submit" class="btn btn-primary" disabled={loading}>
				{loading ? 'Saving...' : 'Save Metrics'}
			</button>
		</div>
	</form>
</div>

<style>
	.metrics-page {
		max-width: 700px;
		margin: 0 auto;
		padding: var(--spacing-lg);
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-sm);
	}

	.page-header h1 {
		margin: 0;
		font-size: 1.5rem;
	}

	.date-subtitle {
		text-align: center;
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-lg);
	}

	.error-banner {
		background-color: #fef2f2;
		border: 1px solid #fecaca;
		color: var(--color-error);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.success-banner {
		background-color: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: var(--color-success);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.metrics-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.section-title {
		font-size: 1rem;
		margin: 0;
		padding-bottom: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.form-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--spacing-md);
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-sm);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}
</style>
