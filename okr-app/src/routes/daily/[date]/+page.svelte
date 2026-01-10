<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import TaskList from '$lib/components/TaskList.svelte';
	import TagInput from '$lib/components/TagInput.svelte';
	import type { Task, Tag } from '$lib/types';
	import type { MetricDefinition } from '$lib/db/schema';

	let { data } = $props();

	let newTaskTitle = $state('');
	let newTaskProgress = $state('');
	let newTaskExpectedHours = $state('');
	let newTaskTagIds = $state<string[]>([]);
	let loading = $state(false);
	let error = $state('');

	// Calculate total expected hours for the day
	const totalExpectedHours = $derived(() => {
		return data.tasks.reduce((sum, task) => {
			const hours = parseFloat(task.attributes?.expected_hours || '0');
			return sum + (isNaN(hours) ? 0 : hours);
		}, 0);
	});

	// Format metric value for display
	function formatMetricValue(metric: MetricDefinition, value: string | number | boolean | null): string {
		if (value === null || value === undefined || value === '') return '-';

		if (metric.inputType === 'boolean') {
			return value ? 'Yes' : 'No';
		}
		if (metric.inputType === 'time') {
			return String(value);
		}
		if (metric.inputType === 'number' && typeof value === 'number') {
			// Format large numbers with locale
			if (value >= 1000) return value.toLocaleString();
			// Round decimals
			if (value % 1 !== 0) return value.toFixed(1);
		}
		return String(value);
	}

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
			// Build attributes object
			const attributes: Record<string, string> = {};
			const progressStr = String(newTaskProgress).trim();
			const expectedHoursStr = String(newTaskExpectedHours).trim();
			if (progressStr && progressStr !== '0') {
				attributes.progress = progressStr;
			}
			if (expectedHoursStr && expectedHoursStr !== '0') {
				attributes.expected_hours = expectedHoursStr;
			}

			const response = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					timePeriodId: data.period.id,
					title: newTaskTitle.trim(),
					attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
					tagIds: newTaskTagIds.length > 0 ? newTaskTagIds : undefined
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to create task');
			}

			// Reset form
			newTaskTitle = '';
			newTaskProgress = '';
			newTaskExpectedHours = '';
			newTaskTagIds = [];
			showNewTaskOptions = false;
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

	async function toggleTimer(id: string, action: 'start' | 'stop') {
		try {
			const response = await fetch(`/api/tasks/${id}/timer`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action })
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to toggle timer');
			}

			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to toggle timer';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			addTask();
		}
	}

	// Store local tags state for inline creation
	let localTags = $state<Tag[]>(data.tags || []);

	// Keep local tags in sync with server data
	$effect(() => {
		localTags = data.tags || [];
	});

	async function createTag(name: string): Promise<Tag | null> {
		try {
			const response = await fetch('/api/tags', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name })
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to create tag');
			}

			const { tag } = await response.json();
			// Add to local tags immediately for better UX
			localTags = [...localTags, tag];
			return tag;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create tag';
			return null;
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
		<!-- Tasks Card -->
		<section class="card tasks-section">
			<div class="section-header">
				<h2 class="section-title">Tasks</h2>
				{#if totalExpectedHours() > 0}
					<span class="total-hours">{totalExpectedHours().toFixed(1)}h planned</span>
				{/if}
			</div>

			<TaskList
				tasks={data.tasks}
				tags={localTags}
				onToggle={toggleTask}
				onUpdate={updateTask}
				onDelete={deleteTask}
				onTimerToggle={toggleTimer}
				onCreateTag={createTag}
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
				<div class="add-task-options">
					<div class="option-row">
						<label class="option-label" for="new-task-progress">Progress</label>
						<input
							id="new-task-progress"
							type="number"
							class="input input-sm"
							bind:value={newTaskProgress}
							placeholder="0"
							min="0"
							disabled={loading}
						/>
					</div>
					<div class="option-row">
						<label class="option-label" for="new-task-hours">Expected Hours</label>
						<input
							id="new-task-hours"
							type="number"
							class="input input-sm"
							bind:value={newTaskExpectedHours}
							placeholder="0"
							step="0.5"
							min="0"
							disabled={loading}
						/>
					</div>
					<div class="option-row option-row-tags">
						<label class="option-label">Tags</label>
						<TagInput
							tags={localTags}
							selectedTagIds={newTaskTagIds}
							onChange={(tagIds) => (newTaskTagIds = tagIds)}
							placeholder="Search or create tags..."
							disabled={loading}
							allowCreate={true}
							onCreateTag={createTag}
						/>
					</div>
					<div class="option-row option-row-submit">
						<button class="btn btn-primary" type="submit" disabled={loading || !newTaskTitle.trim()}>
							{loading ? 'Adding...' : 'Add Task'}
						</button>
					</div>
				</div>
			</form>
		</section>

		<!-- Metrics Card -->
		<section class="card metrics-section">
			<div class="section-header">
				<h2 class="section-title">Metrics</h2>
				<a href="/daily/{data.date}/metrics" class="btn-link">Edit</a>
			</div>

			{#if data.flexibleMetrics?.template && data.flexibleMetrics.metricsDefinition.length > 0}
				<div class="metrics-grid">
					{#each data.flexibleMetrics.metricsDefinition as metric}
						{@const value = data.flexibleMetrics?.values[metric.name]}
						<div class="metric-item">
							<span class="metric-label">{metric.label}</span>
							<span class="metric-value" class:empty={value === null || value === undefined || value === ''}>
								{#if value !== null && value !== undefined && value !== ''}
									{formatMetricValue(metric, value)}{metric.unit ? ` ${metric.unit}` : ''}
								{:else}
									-
								{/if}
							</span>
						</div>
					{/each}
				</div>
			{:else if data.metrics}
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
				<p class="text-muted text-sm">No metrics recorded for this day.</p>
			{/if}
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
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
		max-width: 700px;
		margin: 0 auto;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-md);
	}

	.section-title {
		font-size: 1.125rem;
		margin: 0;
	}

	.total-hours {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.tasks-section {
		min-height: 200px;
	}

	.add-task-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.add-task-options {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--spacing-sm);
	}

	.option-row {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.option-row-tags {
		grid-column: 1 / -1;
	}

	.option-row-submit {
		grid-column: 1 / -1;
		display: flex;
		justify-content: flex-end;
	}

	.option-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.input-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.875rem;
	}

	/* Metrics section */
	.metrics-section {
		min-height: 100px;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: var(--spacing-sm);
	}

	.metric-item {
		display: flex;
		flex-direction: column;
		padding: var(--spacing-sm);
		background-color: var(--color-bg);
		border-radius: var(--radius-sm);
	}

	.metric-label {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.metric-value {
		font-size: 1rem;
		font-weight: 600;
	}

	.metric-value.empty {
		color: var(--color-text-muted);
		font-weight: 400;
	}

	.text-sm {
		font-size: 0.875rem;
	}
</style>
