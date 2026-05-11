<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import TaskList from '$lib/components/TaskList.svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';
	import AiChat from '$lib/components/AiChat.svelte';
	import type { Task, Tag } from '$lib/types';
	import type { MetricDefinition } from '$lib/db/schema';
	import type { AiAction } from '$lib/ai/types';

	let { data } = $props();

	let error = $state('');
	let showAiAssistant = $state(false);

	// Client-side flexible metrics loading (avoids blocking page on slow plugin API calls)
	let flexibleMetrics = $state<{
		template: { id: string; name: string; effectiveFrom: string } | null;
		metricsDefinition: MetricDefinition[];
		values: Record<string, string | number | boolean | null>;
		errors: Record<string, string>;
	} | null>(null);
	let metricsLoading = $state(true);

	$effect(() => {
		const date = data.date;
		metricsLoading = true;
		flexibleMetrics = null;
		fetch(`/api/metrics/flexible/${date}`)
			.then(res => res.json())
			.then(flexData => {
				flexibleMetrics = {
					template: flexData.template ?? null,
					metricsDefinition: flexData.metrics ?? [],
					values: flexData.values ?? {},
					errors: flexData.errors ?? {}
				};
			})
			.catch(() => {
				flexibleMetrics = null;
			})
			.finally(() => {
				metricsLoading = false;
			});
	});

	// Store local tags state for inline creation
	let localTags = $state<Tag[]>([]);

	// Keep local tags in sync with server data
	$effect(() => {
		localTags = data.tags || [];
	});

	function handleTagCreated(tag: Tag) {
		localTags = [...localTags, tag];
	}

	function handleError(message: string) {
		error = message;
	}

	async function handleTaskSuccess() {
		await invalidateAll();
	}

	// Create tag for TaskList (TaskForm handles its own tag creation)
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
			handleTagCreated(tag);
			return tag;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create tag';
			return null;
		}
	}

	// Calculate total expected hours for the day
	const totalExpectedHours = $derived(() => {
		return data.tasks.reduce((sum: number, task: Task) => {
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

	// --- Journal Entry ---
	let journalText = $state('');
	let journalSaving = $state(false);
	let journalSaved = $state(false);
	let journalDirty = $state(false);

	// Track current date to detect navigation
	let lastJournalDate = $state('');

	$effect(() => {
		if (data.date !== lastJournalDate) {
			journalText = data.period?.notes || '';
			journalDirty = false;
			journalSaved = false;
			lastJournalDate = data.date;
		}
	});

	function handleJournalChange(text: string) {
		journalText = text;
		journalDirty = true;
		journalSaved = false;
	}

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function asString(value: unknown): string {
		return typeof value === 'string' ? value.trim() : '';
	}

	function asNumber(value: unknown): number | null {
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	async function resolveTagIds(tagNames: unknown): Promise<string[]> {
		if (!Array.isArray(tagNames)) return [];
		const ids: string[] = [];
		for (const rawName of tagNames) {
			const name = asString(rawName);
			if (!name) continue;
			const existing = localTags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
			if (existing) {
				ids.push(existing.id);
				continue;
			}
			const created = await createTag(name);
			if (created) ids.push(created.id);
		}
		return ids;
	}

	async function createTaskFromAi(periodId: string, payload: Record<string, unknown>) {
		const title = asString(payload.title);
		if (!title) throw new Error('AI action is missing a task title');

		const attributes: Record<string, string> = {};
		const expectedHours = asNumber(payload.expectedHours);
		if (expectedHours !== null && expectedHours > 0) {
			attributes.expected_hours = String(expectedHours);
		}

		const response = await fetch('/api/tasks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				timePeriodId: periodId,
				title,
				attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
				tagIds: await resolveTagIds(payload.tagNames)
			})
		});

		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error || 'Failed to create task from AI action');
		}
	}

	function findVisibleTask(taskId: string): Task | undefined {
		return [...data.tasks, ...data.weeklyInitiatives].find((task: Task) => task.id === taskId);
	}

	async function updateTaskFromAi(payload: Record<string, unknown>) {
		const taskId = asString(payload.taskId);
		if (!taskId) throw new Error('AI action needs taskId');

		const existing = findVisibleTask(taskId);
		const attributes = { ...(existing?.attributes ?? {}) };
		if ('expectedHours' in payload) {
			const expectedHours = asNumber(payload.expectedHours);
			if (expectedHours !== null && expectedHours > 0) {
				attributes.expected_hours = String(expectedHours);
			} else {
				delete attributes.expected_hours;
			}
		}

		const updates: Partial<Task> & { tagIds?: string[] } = {};
		const title = asString(payload.title);
		if (title) updates.title = title;
		if (typeof payload.completed === 'boolean') updates.completed = payload.completed;
		if ('expectedHours' in payload) updates.attributes = attributes;
		if ('tagNames' in payload) updates.tagIds = await resolveTagIds(payload.tagNames);

		const response = await fetch(`/api/tasks/${taskId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updates)
		});

		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error || 'Failed to update task from AI action');
		}
	}

	async function saveJournalFromAi(journal: string) {
		if (!data.period?.id) throw new Error('No daily period available');
		const response = await fetch(`/api/periods/${data.period.id}/journal`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ notes: journal })
		});

		if (!response.ok) throw new Error('Failed to save journal from AI action');
		journalText = journal;
		journalDirty = false;
		journalSaved = true;
	}

	async function handleAiAction(action: AiAction) {
		error = '';
		if (!isRecord(action.payload)) {
			error = 'AI action payload must be an object';
			return;
		}

		try {
			if (action.type === 'add_daily_tasks') {
				const periodId = data.period?.id;
				if (!periodId) throw new Error('No daily period available');
				if (!Array.isArray(action.payload.tasks)) throw new Error('AI action is missing tasks');
				for (const task of action.payload.tasks) {
					if (isRecord(task)) {
						await createTaskFromAi(periodId, task);
					}
				}
				await invalidateAll();
			} else if (action.type === 'update_task') {
				await updateTaskFromAi(action.payload);
				await invalidateAll();
			} else if (action.type === 'toggle_task') {
				const taskId = asString(action.payload.taskId);
				if (!taskId) throw new Error('AI action needs taskId');
				await toggleTask(taskId);
			} else if (action.type === 'delete_task') {
				const taskId = asString(action.payload.taskId);
				if (!taskId) throw new Error('AI action needs taskId');
				await deleteTask(taskId);
			} else if (action.type === 'draft_journal') {
				const journal = asString(action.payload.journal);
				if (!journal) throw new Error('AI action is missing journal text');
				handleJournalChange(journal);
			} else if (action.type === 'save_journal') {
				const journal = asString(action.payload.journal);
				if (!journal) throw new Error('AI action is missing journal text');
				await saveJournalFromAi(journal);
			} else {
				throw new Error(`Unsupported AI action: ${action.type}`);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to apply AI action';
		}
	}

	async function saveJournal() {
		if (!data.period?.id) return;
		journalSaving = true;
		try {
			const response = await fetch(`/api/periods/${data.period.id}/journal`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notes: journalText })
			});

			if (!response.ok) {
				throw new Error('Failed to save journal entry');
			}

			journalDirty = false;
			journalSaved = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save journal entry';
		} finally {
			journalSaving = false;
		}
	}

	// --- Weekly Initiative Functions ---

	async function getOrCreateWeeklyPeriod(): Promise<string | null> {
		// If we already have a weekly period, return its id
		if (data.weeklyPeriod) {
			return data.weeklyPeriod.id;
		}

		// Create the weekly period
		try {
			const response = await fetch('/api/periods', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					periodType: 'weekly',
					year: data.weekYear,
					week: data.weekNumber
				})
			});

			if (!response.ok) {
				throw new Error('Failed to create weekly period');
			}

			const result = await response.json();
			return result.period.id;
		} catch (err) {
			console.error('Failed to create weekly period:', err);
			return null;
		}
	}

	async function toggleInitiative(id: string) {
		try {
			const response = await fetch(`/api/tasks/${id}`, {
				method: 'PATCH'
			});

			if (!response.ok) {
				throw new Error('Failed to toggle initiative');
			}

			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to toggle initiative';
		}
	}

	async function updateInitiative(id: string, updates: Partial<Task>) {
		try {
			const response = await fetch(`/api/tasks/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			});

			if (!response.ok) {
				throw new Error('Failed to update initiative');
			}

			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update initiative';
		}
	}

	async function deleteInitiative(id: string) {
		try {
			const response = await fetch(`/api/tasks/${id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete initiative');
			}

			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete initiative';
		}
	}
</script>

<svelte:head>
	<title>{formattedDate} - RUOK</title>
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
		<section class="card ai-assistant-section">
			<div class="section-header">
				<h2 class="section-title">AI Assistant</h2>
				<button class="btn btn-secondary btn-sm" onclick={() => showAiAssistant = !showAiAssistant}>
					{showAiAssistant ? 'Hide' : 'Open'}
				</button>
			</div>
			{#if showAiAssistant}
				<div class="ai-chat-shell">
					<AiChat
						hasConfig={data.aiConfig?.hasAiConfig ?? false}
						configuredProviders={data.aiConfig?.configuredProviders ?? []}
						activeProvider={data.aiConfig?.activeProvider ?? 'anthropic'}
						providerModels={data.aiConfig?.providerModels ?? {}}
						context="daily_plan"
						contextData={{
							date: data.date,
							tasks: data.tasks.map((task: Task) => ({
								id: task.id,
								title: task.title,
								completed: task.completed,
								expectedHours: task.attributes?.expected_hours,
								tagIds: task.tagIds
							})),
							weeklyInitiatives: data.weeklyInitiatives.map((task: Task) => ({
								id: task.id,
								title: task.title,
								completed: task.completed,
								expectedHours: task.attributes?.expected_hours,
								tagIds: task.tagIds
							})),
							tags: localTags.map((tag) => ({ id: tag.id, name: tag.name, category: tag.category })),
							journal: journalText,
							metrics: flexibleMetrics
						}}
						onAction={handleAiAction}
						welcomeText="Ask me to plan this day, create tasks, or draft the journal."
					/>
				</div>
			{/if}
		</section>

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

			<TaskForm
				periodId={data.period?.id}
				tags={localTags}
				placeholder="Add a new task..."
				buttonLabel="Add Task"
				loadingLabel="Adding..."
				onSuccess={handleTaskSuccess}
				onError={handleError}
				onTagCreated={handleTagCreated}
			/>
		</section>

		<!-- Metrics Card -->
		<section class="card metrics-section">
			<div class="section-header">
				<h2 class="section-title">Metrics</h2>
				<a href="/daily/{data.date}/metrics" class="btn-link">Edit</a>
			</div>

			{#if metricsLoading}
				<div class="metrics-loading">
					<div class="spinner"></div>
					<span class="text-muted text-sm">Loading metrics...</span>
				</div>
			{:else if flexibleMetrics?.template && flexibleMetrics.metricsDefinition.length > 0}
				<div class="metrics-grid">
					{#each flexibleMetrics.metricsDefinition as metric}
						{@const value = flexibleMetrics?.values[metric.name]}
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
			{:else}
				<p class="text-muted text-sm">No metrics template configured. <a href="/settings/metrics">Create one</a> to start tracking.</p>
			{/if}
		</section>

		<!-- Journal Entry Card -->
		<section class="card journal-section">
			<div class="section-header">
				<h2 class="section-title">Journal</h2>
				<div class="journal-actions">
					{#if journalSaved}
						<span class="saved-indicator">Saved</span>
					{/if}
					<button
						class="btn btn-primary btn-sm"
						onclick={saveJournal}
						disabled={journalSaving || !journalDirty}
					>
						{journalSaving ? 'Saving...' : 'Save'}
					</button>
				</div>
			</div>
			<textarea
				class="input textarea journal-textarea"
				placeholder="Write your thoughts for today..."
				value={journalText}
				oninput={(e) => handleJournalChange(e.currentTarget.value)}
			></textarea>
		</section>

		<!-- Weekly Initiatives Card -->
		<section class="card initiatives-section">
			<div class="section-header">
				<h2 class="section-title">Weekly Initiatives (Mirror)</h2>
				<span class="week-label">Week {data.weekNumber}, {data.weekYear}</span>
			</div>

			<TaskList
				tasks={data.weeklyInitiatives}
				tags={localTags}
				onToggle={toggleInitiative}
				onUpdate={updateInitiative}
				onDelete={deleteInitiative}
				onCreateTag={createTag}
				hideTimer={true}
				emptyMessage="No weekly initiatives yet."
			/>

			<TaskForm
				getPeriodId={getOrCreateWeeklyPeriod}
				tags={localTags}
				placeholder="Add a weekly initiative..."
				buttonLabel="Add Initiative"
				loadingLabel="Adding..."
				onSuccess={handleTaskSuccess}
				onError={handleError}
				onTagCreated={handleTagCreated}
			/>
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
		font-weight: 800;
		letter-spacing: -0.02em;
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
		font-weight: 700;
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

	.ai-chat-shell {
		height: 520px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	/* Metrics section */
	.metrics-section {
		min-height: 100px;
	}

	/* Weekly Initiatives section */
	.initiatives-section {
		min-height: 150px;
	}

	.week-label {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		background-color: var(--color-bg);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
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

	.metrics-loading {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md) 0;
	}

	.spinner {
		width: 18px;
		height: 18px;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Journal section */
	.journal-section {
		min-height: 120px;
	}

	.journal-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.saved-indicator {
		font-size: 0.75rem;
		color: var(--color-success);
	}

	.journal-textarea {
		min-height: 150px;
		resize: vertical;
		width: 100%;
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.75rem;
	}

	.text-sm {
		font-size: 0.875rem;
	}
</style>
