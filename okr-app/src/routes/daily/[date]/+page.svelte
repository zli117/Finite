<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import TaskList from '$lib/components/TaskList.svelte';
	import type { Task } from '$lib/types';

	let { data } = $props();

	let newTaskTitle = $state('');
	let loading = $state(false);
	let error = $state('');

	// Reactive derived values
	const dateObj = $derived(new Date(data.date + 'T00:00:00'));
	const formattedDate = $derived(
		dateObj.toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	);

	const isToday = $derived(() => {
		const today = new Date();
		return (
			dateObj.getFullYear() === today.getFullYear() &&
			dateObj.getMonth() === today.getMonth() &&
			dateObj.getDate() === today.getDate()
		);
	});

	function formatDateStr(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function navigateDay(offset: number) {
		const newDate = new Date(dateObj);
		newDate.setDate(newDate.getDate() + offset);
		goto(`/daily/${formatDateStr(newDate)}`);
	}

	function goToToday() {
		goto(`/daily/${formatDateStr(new Date())}`);
	}

	async function addTask() {
		if (!newTaskTitle.trim() || !data.period) return;

		loading = true;
		error = '';

		try {
			const response = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					timePeriodId: data.period.id,
					title: newTaskTitle.trim()
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to create task');
			}

			newTaskTitle = '';
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create task';
		} finally {
			loading = false;
		}
	}

	async function toggleTask(id: string) {
		try {
			const response = await fetch(`/api/tasks/${id}`, {
				method: 'PATCH'
			});

			if (!response.ok) {
				throw new Error('Failed to toggle task');
			}

			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to toggle task';
		}
	}

	async function updateTask(id: string, updates: Partial<Task>) {
		try {
			const response = await fetch(`/api/tasks/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			});

			if (!response.ok) {
				throw new Error('Failed to update task');
			}

			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update task';
		}
	}

	async function deleteTask(id: string) {
		try {
			const response = await fetch(`/api/tasks/${id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete task');
			}

			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete task';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			addTask();
		}
	}
</script>

<svelte:head>
	<title>{formattedDate} - OKR Tracker</title>
</svelte:head>

<div class="daily-page">
	<header class="daily-header">
		<div class="date-nav">
			<button class="btn btn-secondary" onclick={() => navigateDay(-1)} title="Previous day">
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
			</button>

			<div class="date-display">
				<h1>{formattedDate}</h1>
				{#if !isToday()}
					<button class="btn-link" onclick={goToToday}>Go to today</button>
				{/if}
			</div>

			<button class="btn btn-secondary" onclick={() => navigateDay(1)} title="Next day">
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 18 15 12 9 6"/>
				</svg>
			</button>
		</div>
	</header>

	{#if data.error}
		<div class="error-banner">{data.error}</div>
	{/if}

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	<div class="daily-content">
		<section class="card tasks-section">
			<h2 class="section-title">Tasks</h2>

			<TaskList
				tasks={data.tasks}
				onToggle={toggleTask}
				onUpdate={updateTask}
				onDelete={deleteTask}
			/>

			<form class="add-task-form" onsubmit={(e) => { e.preventDefault(); addTask(); }}>
				<input
					type="text"
					class="input"
					placeholder="Add a new task..."
					bind:value={newTaskTitle}
					onkeydown={handleKeydown}
					disabled={loading}
				/>
				<button class="btn btn-primary" type="submit" disabled={loading || !newTaskTitle.trim()}>
					{loading ? 'Adding...' : 'Add'}
				</button>
			</form>
		</section>

		<section class="card metrics-section">
			<h2 class="section-title">Health Metrics</h2>

			{#if data.metrics}
				<div class="metrics-grid">
					{#if data.metrics.sleepLength}
						<div class="metric-item">
							<span class="metric-label">Sleep</span>
							<span class="metric-value">{data.metrics.sleepLength}</span>
						</div>
					{/if}
					{#if data.metrics.wakeUpTime}
						<div class="metric-item">
							<span class="metric-label">Wake Up</span>
							<span class="metric-value">{data.metrics.wakeUpTime}</span>
						</div>
					{/if}
					{#if data.metrics.steps}
						<div class="metric-item">
							<span class="metric-label">Steps</span>
							<span class="metric-value">{data.metrics.steps.toLocaleString()}</span>
						</div>
					{/if}
					{#if data.metrics.cardioLoad}
						<div class="metric-item">
							<span class="metric-label">Cardio Load</span>
							<span class="metric-value">{data.metrics.cardioLoad}</span>
						</div>
					{/if}
					{#if data.metrics.fitbitReadiness}
						<div class="metric-item">
							<span class="metric-label">Readiness</span>
							<span class="metric-value">{data.metrics.fitbitReadiness}</span>
						</div>
					{/if}
					{#if data.metrics.restingHeartRate}
						<div class="metric-item">
							<span class="metric-label">Resting HR</span>
							<span class="metric-value">{data.metrics.restingHeartRate} bpm</span>
						</div>
					{/if}
				</div>
			{:else}
				<p class="text-muted">No health metrics recorded for this day.</p>
			{/if}

			<a href="/daily/{data.date}/metrics" class="btn btn-secondary btn-block">
				Edit Metrics
			</a>
		</section>
	</div>
</div>

<style>
	.daily-page {
		max-width: 900px;
		margin: 0 auto;
		padding: var(--spacing-lg);
	}

	.daily-header {
		margin-bottom: var(--spacing-lg);
	}

	.date-nav {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-md);
	}

	.date-display {
		text-align: center;
	}

	.date-display h1 {
		margin: 0;
		font-size: 1.5rem;
	}

	.btn-link {
		background: none;
		border: none;
		color: var(--color-primary);
		cursor: pointer;
		font-size: 0.875rem;
		padding: 0;
	}

	.btn-link:hover {
		text-decoration: underline;
	}

	.error-banner {
		background-color: #fef2f2;
		border: 1px solid #fecaca;
		color: var(--color-error);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.daily-content {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-lg);
	}

	@media (min-width: 768px) {
		.daily-content {
			grid-template-columns: 2fr 1fr;
		}
	}

	.section-title {
		font-size: 1.125rem;
		margin: 0 0 var(--spacing-md);
	}

	.tasks-section {
		min-height: 300px;
	}

	.add-task-form {
		display: flex;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.add-task-form .input {
		flex: 1;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.metric-item {
		display: flex;
		flex-direction: column;
		padding: var(--spacing-sm);
		background-color: var(--color-bg);
		border-radius: var(--radius-sm);
	}

	.metric-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.metric-value {
		font-size: 1.125rem;
		font-weight: 600;
	}

	.btn-block {
		width: 100%;
	}
</style>
