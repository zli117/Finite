<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import TaskList from '$lib/components/TaskList.svelte';
	import TagInput from '$lib/components/TagInput.svelte';
	import type { Task, Tag } from '$lib/types';

	let { data } = $props();

	// Weekly initiative form state
	let newInitiativeTitle = $state('');
	let newInitiativeProgress = $state('');
	let newInitiativeExpectedHours = $state('');
	let newInitiativeTagIds = $state<string[]>([]);
	let initiativeLoading = $state(false);
	let error = $state('');

	// Store local tags state for inline creation
	let localTags = $state<Tag[]>([]);

	// Keep local tags in sync with server data
	$effect(() => {
		localTags = data.tags || [];
	});

	// ISO week number (Monday-first, week 1 contains Jan 4)
	function getISOWeekNumber(date: Date): number {
		const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
		const dayNum = d.getUTCDay() || 7;
		d.setUTCDate(d.getUTCDate() + 4 - dayNum);
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
		return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
	}

	// US week number (Sunday-first, week 1 contains Jan 1)
	function getUSWeekNumber(date: Date): number {
		const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
		const yearStartDay = yearStart.getUTCDay();
		const firstSunday = new Date(yearStart);
		firstSunday.setUTCDate(yearStart.getUTCDate() - yearStartDay);
		const daysSinceFirstSunday = Math.floor((d.getTime() - firstSunday.getTime()) / 86400000);
		return Math.floor(daysSinceFirstSunday / 7) + 1;
	}

	function getWeekNumber(date: Date): number {
		return data.weekStartDay === 'sunday' ? getUSWeekNumber(date) : getISOWeekNumber(date);
	}

	function getWeekYear(date: Date): number {
		if (data.weekStartDay === 'monday') {
			const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
			const dayNum = d.getUTCDay() || 7;
			d.setUTCDate(d.getUTCDate() + 4 - dayNum);
			return d.getUTCFullYear();
		}
		return date.getFullYear();
	}

	function navigateWeek(offset: number) {
		let newWeek = data.week + offset;
		let newYear = data.year;

		if (newWeek < 1) {
			newYear--;
			newWeek = 52; // Approximate - could be 52 or 53
		} else if (newWeek > 52) {
			newYear++;
			newWeek = 1;
		}

		goto(`/weekly/${newYear}/${newWeek}`);
	}

	function goToCurrentWeek() {
		const today = new Date();
		goto(`/weekly/${getWeekYear(today)}/${getWeekNumber(today)}`);
	}

	const isCurrentWeek = $derived(() => {
		const today = new Date();
		return data.year === getWeekYear(today) && data.week === getWeekNumber(today);
	});

	const completionPercent = $derived(
		data.stats.totalTasks > 0
			? Math.round((data.stats.completedTasks / data.stats.totalTasks) * 100)
			: 0
	);

	function isToday(dateStr: string): boolean {
		const today = new Date();
		const year = today.getFullYear();
		const month = String(today.getMonth() + 1).padStart(2, '0');
		const day = String(today.getDate()).padStart(2, '0');
		return dateStr === `${year}-${month}-${day}`;
	}

	// --- Weekly Initiative Functions ---

	async function getOrCreateWeeklyPeriod(): Promise<string | null> {
		if (data.weeklyPeriod) {
			return data.weeklyPeriod.id;
		}

		try {
			const response = await fetch('/api/periods', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					periodType: 'weekly',
					year: data.year,
					week: data.week
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

	async function addInitiative() {
		if (!newInitiativeTitle.trim()) return;

		initiativeLoading = true;
		error = '';

		try {
			const periodId = await getOrCreateWeeklyPeriod();
			if (!periodId) {
				throw new Error('Failed to get weekly period');
			}

			const attributes: Record<string, string> = {};
			const progressStr = String(newInitiativeProgress).trim();
			const expectedHoursStr = String(newInitiativeExpectedHours).trim();
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
					timePeriodId: periodId,
					title: newInitiativeTitle.trim(),
					attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
					tagIds: newInitiativeTagIds.length > 0 ? newInitiativeTagIds : undefined
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to create initiative');
			}

			newInitiativeTitle = '';
			newInitiativeProgress = '';
			newInitiativeExpectedHours = '';
			newInitiativeTagIds = [];
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create initiative';
		} finally {
			initiativeLoading = false;
		}
	}

	async function toggleInitiative(id: string) {
		try {
			const response = await fetch(`/api/tasks/${id}`, { method: 'PATCH' });
			if (!response.ok) throw new Error('Failed to toggle initiative');
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
			if (!response.ok) throw new Error('Failed to update initiative');
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update initiative';
		}
	}

	async function deleteInitiative(id: string) {
		try {
			const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
			if (!response.ok) throw new Error('Failed to delete initiative');
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete initiative';
		}
	}

	function handleInitiativeKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			addInitiative();
		}
	}

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
			localTags = [...localTags, tag];
			return tag;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create tag';
			return null;
		}
	}

	const initiativeCompletionPercent = $derived(
		data.stats.totalInitiatives > 0
			? Math.round((data.stats.completedInitiatives / data.stats.totalInitiatives) * 100)
			: 0
	);
</script>

<svelte:head>
	<title>Week {data.week}, {data.year} - OKR Tracker</title>
</svelte:head>

<div class="weekly-page">
	<header class="weekly-header">
		<div class="week-nav">
			<button class="btn btn-secondary" onclick={() => navigateWeek(-1)} title="Previous week">
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
			</button>

			<div class="week-display">
				<h1>Week {data.week}, {data.year}</h1>
				{#if !isCurrentWeek()}
					<button class="btn-link" onclick={goToCurrentWeek}>Go to current week</button>
				{/if}
			</div>

			<button class="btn btn-secondary" onclick={() => navigateWeek(1)} title="Next week">
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 18 15 12 9 6"/>
				</svg>
			</button>
		</div>
	</header>

	<div class="weekly-stats card">
		<div class="stat-group">
			<div class="stat-group-header">
				<span class="stat-group-title">Weekly Initiatives</span>
				<span class="stat-group-count">{data.stats.completedInitiatives} / {data.stats.totalInitiatives}</span>
			</div>
			<div class="progress-bar">
				<div class="progress-bar-fill" style="width: {initiativeCompletionPercent}%"></div>
			</div>
			<div class="stat-group-footer">
				<span>{initiativeCompletionPercent}% complete</span>
				<span>{data.stats.initiativePlannedHours}h planned | {data.stats.initiativeTrackedHours}h tracked</span>
			</div>
		</div>
		<div class="stat-group">
			<div class="stat-group-header">
				<span class="stat-group-title">Daily Tasks</span>
				<span class="stat-group-count">{data.stats.completedTasks} / {data.stats.totalTasks}</span>
			</div>
			<div class="progress-bar">
				<div class="progress-bar-fill" style="width: {completionPercent}%"></div>
			</div>
			<div class="stat-group-footer">
				<span>{completionPercent}% complete</span>
				<span>{data.stats.totalPlannedHours}h planned | {data.stats.totalTrackedHours}h tracked</span>
			</div>
		</div>
	</div>

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	<!-- Weekly Initiatives Section -->
	<section class="card initiatives-section">
		<div class="section-header">
			<h2 class="section-title">Weekly Initiatives</h2>
			{#if data.stats.totalInitiatives > 0}
				<span class="initiative-progress">{initiativeCompletionPercent}% complete</span>
			{/if}
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

		<form class="add-initiative-form" onsubmit={(e) => { e.preventDefault(); addInitiative(); }}>
			<input
				type="text"
				class="input"
				placeholder="Add a weekly initiative..."
				bind:value={newInitiativeTitle}
				onkeydown={handleInitiativeKeydown}
				disabled={initiativeLoading}
			/>
			<div class="add-initiative-options">
				<div class="option-row">
					<label class="option-label" for="new-initiative-progress">Progress</label>
					<input
						id="new-initiative-progress"
						type="number"
						class="input input-sm"
						bind:value={newInitiativeProgress}
						placeholder="0"
						min="0"
						disabled={initiativeLoading}
					/>
				</div>
				<div class="option-row">
					<label class="option-label" for="new-initiative-hours">Expected Hours</label>
					<input
						id="new-initiative-hours"
						type="number"
						class="input input-sm"
						bind:value={newInitiativeExpectedHours}
						placeholder="0"
						step="any"
						min="0"
						disabled={initiativeLoading}
					/>
				</div>
				<div class="option-row option-row-tags">
					<span class="option-label">Tags</span>
					<TagInput
						tags={localTags}
						selectedTagIds={newInitiativeTagIds}
						onChange={(tagIds) => (newInitiativeTagIds = tagIds)}
						placeholder="Search or create tags..."
						disabled={initiativeLoading}
						allowCreate={true}
						onCreateTag={createTag}
					/>
				</div>
				<div class="option-row option-row-submit">
					<button class="btn btn-primary" type="submit" disabled={initiativeLoading || !newInitiativeTitle.trim()}>
						{initiativeLoading ? 'Adding...' : 'Add Initiative'}
					</button>
				</div>
			</div>
		</form>
	</section>

	<h2 class="days-title">Daily Tasks</h2>

	<div class="week-days">
		{#each data.days as day}
			<a href="/daily/{day.date}" class="day-card card" class:today={isToday(day.date)}>
				<div class="day-header">
					<span class="day-name">{day.dayName}</span>
					<span class="day-date">{new Date(day.date + 'T00:00:00').getDate()}</span>
				</div>

				{#if day.tasks.length > 0}
					<ul class="day-tasks">
						{#each day.tasks.slice(0, 5) as task}
							<li class:completed={task.completed}>
								<span class="task-check">{task.completed ? '✓' : '○'}</span>
								<span class="task-title">{task.title}</span>
							</li>
						{/each}
						{#if day.tasks.length > 5}
							<li class="more-tasks">+{day.tasks.length - 5} more</li>
						{/if}
					</ul>
				{:else}
					<p class="no-tasks">No tasks</p>
				{/if}

				<div class="day-footer">
					<span class="task-count">
						{day.tasks.filter((t) => t.completed).length} / {day.tasks.length}
					</span>
				</div>
			</a>
		{/each}
	</div>
</div>

<style>
	.weekly-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--spacing-lg);
	}

	.weekly-header {
		margin-bottom: var(--spacing-lg);
	}

	.week-nav {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-md);
	}

	.week-display {
		text-align: center;
	}

	.week-display h1 {
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

	.weekly-stats {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--spacing-lg);
		margin-bottom: var(--spacing-lg);
	}

	.stat-group {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.stat-group-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.stat-group-title {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.stat-group-count {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-primary);
	}

	.stat-group-footer {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.week-days {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: var(--spacing-sm);
	}

	@media (max-width: 1024px) {
		.week-days {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	@media (max-width: 768px) {
		.week-days {
			grid-template-columns: repeat(2, 1fr);
		}

		.weekly-stats {
			grid-template-columns: 1fr;
		}
	}

	.day-card {
		display: flex;
		flex-direction: column;
		min-height: 180px;
		padding: var(--spacing-sm);
		text-decoration: none;
		color: inherit;
		transition: all 0.15s ease;
	}

	.day-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}

	.day-card.today {
		border: 2px solid var(--color-primary);
	}

	.day-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: var(--spacing-xs);
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--spacing-sm);
	}

	.day-name {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.day-date {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.day-tasks {
		list-style: none;
		padding: 0;
		margin: 0;
		flex: 1;
		font-size: 0.75rem;
	}

	.day-tasks li {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-xs);
		padding: 2px 0;
	}

	.day-tasks li.completed {
		color: var(--color-text-muted);
		text-decoration: line-through;
	}

	.task-check {
		flex-shrink: 0;
	}

	.task-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.more-tasks {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.no-tasks {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		flex: 1;
	}

	.day-footer {
		margin-top: auto;
		padding-top: var(--spacing-xs);
		border-top: 1px solid var(--color-border);
	}

	.task-count {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	/* Weekly Initiatives Section */
	.initiatives-section {
		margin-bottom: var(--spacing-lg);
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

	.initiative-progress {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.days-title {
		font-size: 1.125rem;
		margin: 0 0 var(--spacing-md) 0;
	}

	.error-banner {
		background-color: #fef2f2;
		border: 1px solid #fecaca;
		color: var(--color-error);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.add-initiative-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.add-initiative-options {
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

	@media (max-width: 768px) {
		.weekly-stats {
			grid-template-columns: 1fr;
		}

		.add-initiative-options {
			grid-template-columns: 1fr;
		}
	}
</style>
