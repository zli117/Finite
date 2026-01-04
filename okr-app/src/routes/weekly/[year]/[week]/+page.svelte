<script lang="ts">
	import { goto } from '$app/navigation';

	let { data } = $props();

	function getWeekNumber(date: Date): number {
		const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
		const dayNum = d.getUTCDay() || 7;
		d.setUTCDate(d.getUTCDate() + 4 - dayNum);
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
		return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
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
		goto(`/weekly/${today.getFullYear()}/${getWeekNumber(today)}`);
	}

	const isCurrentWeek = $derived(() => {
		const today = new Date();
		return data.year === today.getFullYear() && data.week === getWeekNumber(today);
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
		<div class="stat-item">
			<span class="stat-value">{data.stats.completedTasks} / {data.stats.totalTasks}</span>
			<span class="stat-label">Tasks Completed</span>
		</div>
		<div class="stat-item">
			<div class="progress-bar">
				<div class="progress-bar-fill" style="width: {completionPercent}%"></div>
			</div>
			<span class="stat-label">{completionPercent}% Complete</span>
		</div>
		<div class="stat-item">
			<span class="stat-value">{data.stats.totalHours}h</span>
			<span class="stat-label">Hours Logged</span>
		</div>
	</div>

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
		grid-template-columns: repeat(3, 1fr);
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
		text-align: center;
	}

	.stat-item {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 600;
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
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
</style>
