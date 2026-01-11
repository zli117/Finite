<script lang="ts">
	import TaskList from '$lib/components/TaskList.svelte';

	let { data } = $props();

	// Month selector state
	let selectedMonth = $state(data.currentMonth);
	let loadingMonthly = $state(false);
	let monthlyObjectives = $state(data.monthlyObjectives);

	// Note state
	let note = $state(data.note);
	let editingNote = $state(false);
	let noteValue = $state(data.note);
	let savingNote = $state(false);

	const monthNames = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	// Sync when server data changes
	$effect.pre(() => {
		selectedMonth = data.currentMonth;
		monthlyObjectives = data.monthlyObjectives;
		note = data.note;
		noteValue = data.note;
	});

	async function changeMonth(month: number) {
		if (month === selectedMonth) return;
		selectedMonth = month;
		loadingMonthly = true;

		try {
			const response = await fetch(`/api/friends/${data.friend.id}/dashboard?month=${month}`);
			if (response.ok) {
				const result = await response.json();
				monthlyObjectives = result.monthlyObjectives;
			}
		} catch (err) {
			console.error('Failed to fetch monthly objectives:', err);
		} finally {
			loadingMonthly = false;
		}
	}

	const todayPercent = $derived(() => {
		if (!data.today || data.today.totalCount === 0) return 0;
		return Math.round((data.today.completedCount / data.today.totalCount) * 100);
	});

	const weekPercent = $derived(() => {
		if (!data.week || data.week.totalCount === 0) return 0;
		return Math.round((data.week.completedCount / data.week.totalCount) * 100);
	});

	function startEditNote() {
		noteValue = note;
		editingNote = true;
	}

	function cancelEditNote() {
		noteValue = note;
		editingNote = false;
	}

	async function saveNote() {
		savingNote = true;
		try {
			const response = await fetch(`/api/friends/${data.friend.id}/notes`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note: noteValue })
			});

			if (response.ok) {
				note = noteValue;
				editingNote = false;
			}
		} catch (err) {
			console.error('Failed to save note:', err);
		} finally {
			savingNote = false;
		}
	}

	// No-op handlers for read-only TaskList
	const noOp = () => {};
</script>

<svelte:head>
	<title>{data.friend.username}'s Dashboard | OKR Tracker</title>
</svelte:head>

<main class="main-content">
	<header class="page-header">
		<a href="/friends" class="back-link">
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
			Back to Friends
		</a>
		<h1>{data.friend.username}'s Dashboard</h1>
		<p class="subtitle">Read-only view</p>
	</header>

	<!-- Private Note -->
	<section class="note-section">
		<div class="note-header">
			<h3>Private Note</h3>
			{#if !editingNote}
				<button class="btn btn-secondary btn-sm" onclick={startEditNote}>
					{note ? 'Edit' : 'Add Note'}
				</button>
			{/if}
		</div>
		{#if editingNote}
			<div class="note-editor">
				<textarea
					class="input"
					bind:value={noteValue}
					placeholder="Add a private note about this friend..."
					rows="3"
				></textarea>
				<div class="note-actions">
					<button class="btn btn-secondary btn-sm" onclick={cancelEditNote} disabled={savingNote}>Cancel</button>
					<button class="btn btn-primary btn-sm" onclick={saveNote} disabled={savingNote}>
						{savingNote ? 'Saving...' : 'Save'}
					</button>
				</div>
			</div>
		{:else if note}
			<p class="note-content">{note}</p>
		{:else}
			<p class="note-empty">No private note. Only you can see notes you add here.</p>
		{/if}
	</section>

	<div class="dashboard-grid">
		<div class="card">
			<h2 class="mb-md">Today</h2>
			<div class="date-label mb-sm">{data.today?.date}</div>
			{#if data.today && data.today.totalCount > 0}
				<div class="progress-bar mb-sm">
					<div class="progress-bar-fill" style="width: {todayPercent()}%;"></div>
				</div>
				<p class="text-muted mb-md">{data.today.completedCount} / {data.today.totalCount} tasks completed</p>

				<TaskList
					tasks={data.today.tasks}
					tags={[]}
					onToggle={noOp}
					onUpdate={noOp}
					onDelete={noOp}
					hideTimer={true}
					readOnly={true}
					emptyMessage="No tasks"
				/>
			{:else}
				<p class="text-muted">No tasks for today</p>
			{/if}
		</div>

		<div class="card">
			<h2 class="mb-md">This Week</h2>
			<div class="week-label mb-sm">Week {data.week?.week}, {data.week?.year}</div>
			<div class="progress-bar mb-sm">
				<div class="progress-bar-fill" style="width: {weekPercent()}%;"></div>
			</div>
			<p class="text-muted">{data.week?.completedCount} / {data.week?.totalCount} tasks completed</p>
		</div>
	</div>

	{#if data.yearlyObjectives && data.yearlyObjectives.length > 0}
		<section class="objectives-section">
			<h2 class="mb-md">{data.currentYear} Yearly Objectives</h2>
			<div class="objectives-grid">
				{#each data.yearlyObjectives as objective}
					<div class="card objective-card">
						<h3 class="objective-title">{objective.title}</h3>
						{#if objective.description}
							<p class="objective-desc text-muted">{objective.description}</p>
						{/if}
						<div class="objective-score">
							<div class="progress-bar">
								<div class="progress-bar-fill" style="width: {objective.averageScore * 100}%;"></div>
							</div>
							<span class="score-label">{(objective.averageScore * 100).toFixed(0)}%</span>
						</div>
						{#if objective.keyResults.length > 0}
							<ul class="kr-list">
								{#each objective.keyResults as kr}
									<li>
										<span class="kr-score">{(kr.score * 100).toFixed(0)}%</span>
										<span class="kr-title">{kr.title}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section class="objectives-section">
		<div class="section-header">
			<h2>Monthly Objectives</h2>
			<select class="input select-sm" value={selectedMonth} onchange={(e) => changeMonth(parseInt(e.currentTarget.value))}>
				{#each monthNames as name, index}
					<option value={index + 1}>{name}</option>
				{/each}
			</select>
		</div>
		{#if loadingMonthly}
			<p class="text-muted">Loading...</p>
		{:else if monthlyObjectives.length > 0}
			<div class="objectives-grid">
				{#each monthlyObjectives as objective}
					<div class="card objective-card">
						<h3 class="objective-title">{objective.title}</h3>
						{#if objective.description}
							<p class="objective-desc text-muted">{objective.description}</p>
						{/if}
						<div class="objective-score">
							<div class="progress-bar">
								<div class="progress-bar-fill" style="width: {objective.averageScore * 100}%;"></div>
							</div>
							<span class="score-label">{(objective.averageScore * 100).toFixed(0)}%</span>
						</div>
						{#if objective.keyResults.length > 0}
							<ul class="kr-list">
								{#each objective.keyResults as kr}
									<li>
										<span class="kr-score">{(kr.score * 100).toFixed(0)}%</span>
										<span class="kr-title">{kr.title}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-muted">No monthly objectives for {monthNames[selectedMonth - 1]}.</p>
		{/if}
	</section>
</main>

<style>
	.page-header {
		margin-bottom: var(--spacing-lg);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: 0.875rem;
		margin-bottom: var(--spacing-sm);
	}

	.back-link:hover {
		color: var(--color-primary);
	}

	.page-header h1 {
		font-size: 1.75rem;
		margin: 0;
	}

	.subtitle {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin: var(--spacing-xs) 0 0;
	}

	.note-section {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.note-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-sm);
	}

	.note-header h3 {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-muted);
		margin: 0;
	}

	.note-editor {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.note-actions {
		display: flex;
		gap: var(--spacing-xs);
		justify-content: flex-end;
	}

	.note-content {
		font-size: 0.875rem;
		color: var(--color-text);
		margin: 0;
		white-space: pre-wrap;
	}

	.note-empty {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		font-style: italic;
		margin: 0;
	}

	.dashboard-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-xl);
	}

	.date-label,
	.week-label {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.objectives-section {
		margin-top: var(--spacing-xl);
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	.section-header h2 {
		margin: 0;
	}

	.section-header .select-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.875rem;
		width: auto;
		min-width: 130px;
		max-width: 150px;
	}

	.objectives-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 350px));
		gap: var(--spacing-md);
	}

	.objective-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.objective-title {
		font-size: 1rem;
		margin: 0;
	}

	.objective-desc {
		font-size: 0.875rem;
		margin: 0;
	}

	.objective-score {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.objective-score .progress-bar {
		flex: 1;
	}

	.score-label {
		font-size: 0.875rem;
		font-weight: 600;
		min-width: 40px;
		text-align: right;
	}

	.kr-list {
		list-style: none;
		padding: 0;
		margin: 0;
		font-size: 0.875rem;
	}

	.kr-list li {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) 0;
		border-top: 1px solid var(--color-border);
	}

	.kr-score {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-primary);
		min-width: 35px;
	}

	.kr-title {
		color: var(--color-text-muted);
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.8rem;
	}
</style>
