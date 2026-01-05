<script lang="ts">
	import DashboardCard from '$lib/components/DashboardCard.svelte';

	interface Widget {
		id: string;
		title: string;
		widgetType: string;
		config: { code?: string; queryId?: string };
		sortOrder: number;
	}

	let { data } = $props();

	// Month selector state
	let selectedMonth = $state(data.currentMonth || new Date().getMonth() + 1);

	const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'];

	// Monthly objectives - local state for when user changes month
	let monthlyObjectives = $state(data.monthlyObjectives || []);
	let loadingMonthly = $state(false);

	// Dashboard widgets state
	let widgets = $state<Widget[]>(data.widgets || []);

	// Sync when server data changes
	$effect(() => {
		if (data.currentMonth) {
			selectedMonth = data.currentMonth;
		}
		monthlyObjectives = data.monthlyObjectives || [];
		widgets = data.widgets || [];
	});

	async function changeMonth(month: number) {
		if (month === selectedMonth) return;
		selectedMonth = month;
		loadingMonthly = true;

		try {
			const response = await fetch(`/api/objectives?year=${data.currentYear}&level=monthly&month=${month}`);
			if (response.ok) {
				const result = await response.json();
				// Fetch key results for each objective
				const objectivesWithKRs = await Promise.all(
					result.objectives.map(async (obj: any) => {
						const krResponse = await fetch(`/api/objectives/${obj.id}/key-results`);
						const krResult = krResponse.ok ? await krResponse.json() : { keyResults: [] };
						const krs = krResult.keyResults || [];
						const avgScore = krs.length > 0
							? krs.reduce((sum: number, kr: any) => sum + kr.score * kr.weight, 0) / krs.reduce((sum: number, kr: any) => sum + kr.weight, 0)
							: 0;
						return { ...obj, keyResults: krs, averageScore: avgScore };
					})
				);
				monthlyObjectives = objectivesWithKRs;
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

	async function addWidget() {
		try {
			const response = await fetch('/api/dashboard/widgets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'New Widget', code: '' })
			});

			if (response.ok) {
				const result = await response.json();
				widgets = [...widgets, result.widget];
			}
		} catch (err) {
			console.error('Failed to add widget:', err);
		}
	}

	async function saveWidget(id: string, title: string, code: string) {
		try {
			const response = await fetch(`/api/dashboard/widgets/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title, code })
			});

			if (response.ok) {
				const result = await response.json();
				widgets = widgets.map(w => w.id === id ? result.widget : w);
			}
		} catch (err) {
			console.error('Failed to save widget:', err);
		}
	}

	async function deleteWidget(id: string) {
		if (!confirm('Delete this widget?')) return;

		try {
			const response = await fetch(`/api/dashboard/widgets/${id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				widgets = widgets.filter(w => w.id !== id);
			}
		} catch (err) {
			console.error('Failed to delete widget:', err);
		}
	}
</script>

{#if data.user}
	<main class="main-content">
		<h1 class="mb-lg">Dashboard</h1>

		<div class="dashboard-grid">
			<a href="/daily/{data.today?.date}" class="card card-link">
				<h2 class="mb-md">Today</h2>
				{#if data.today && data.today.totalCount > 0}
					<div class="progress-bar mb-sm">
						<div class="progress-bar-fill" style="width: {todayPercent()}%;"></div>
					</div>
					<p class="text-muted">{data.today.completedCount} / {data.today.totalCount} tasks completed</p>

					{#if data.today.tasks.length > 0}
						<ul class="task-preview">
							{#each data.today.tasks.filter(t => !t.completed).slice(0, 3) as task}
								<li>
									<span class="task-bullet">○</span>
									{task.title}
								</li>
							{/each}
							{#if data.today.tasks.filter(t => !t.completed).length > 3}
								<li class="text-muted">+{data.today.tasks.filter(t => !t.completed).length - 3} more</li>
							{/if}
						</ul>
					{/if}
				{:else}
					<p class="text-muted">No tasks yet. Click to add some!</p>
				{/if}
			</a>

			<a href="/weekly/{data.week?.year}/{data.week?.week}" class="card card-link">
				<h2 class="mb-md">This Week</h2>
				<div class="week-label mb-sm">Week {data.week?.week}, {data.week?.year}</div>
				<div class="progress-bar mb-sm">
					<div class="progress-bar-fill" style="width: {weekPercent()}%;"></div>
				</div>
				<p class="text-muted">{data.week?.completedCount} / {data.week?.totalCount} tasks completed</p>
			</a>

			<div class="card">
				<h2 class="mb-md">Quick Actions</h2>
				<div class="quick-actions">
					<a href="/objectives" class="btn btn-primary">Manage Objectives</a>
					<a href="/daily" class="btn btn-secondary">Today's Tasks</a>
					<a href="/weekly" class="btn btn-secondary">Weekly View</a>
				</div>
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
				<p class="text-muted">No monthly objectives for {monthNames[selectedMonth - 1]}. <a href="/objectives?level=monthly&month={selectedMonth}">Create one</a></p>
			{/if}
		</section>

		<section class="widgets-section">
			<div class="widgets-header">
				<h2>Insights</h2>
				<div class="widgets-actions">
					<button class="btn btn-primary btn-sm" onclick={addWidget}>+ Add Widget</button>
					<a href="/queries" class="btn btn-secondary btn-sm">Manage Queries</a>
				</div>
			</div>
			{#if widgets.length > 0}
				<div class="widgets-grid">
					{#each widgets as widget (widget.id)}
						<DashboardCard
							title={widget.title}
							code={widget.config.code || ''}
							savedQueries={data.savedQueries}
							onSave={(title, code) => saveWidget(widget.id, title, code)}
							onDelete={() => deleteWidget(widget.id)}
						/>
					{/each}
				</div>
			{:else}
				<div class="empty-widgets">
					<p class="text-muted">No insight widgets yet.</p>
					<button class="btn btn-primary" onclick={addWidget}>Add your first widget</button>
				</div>
			{/if}
		</section>
	</main>
{:else}
	<div class="auth-page">
		<div class="auth-card card text-center">
			<h1 class="mb-md">OKR Tracker</h1>
			<p class="text-muted mb-lg">
				Personal objectives and key results tracking system with Fitbit integration.
			</p>
			<div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
				<a href="/login" class="btn btn-primary">Login</a>
				<a href="/register" class="btn btn-secondary">Create Account</a>
			</div>
		</div>
	</div>
{/if}

<style>
	.card-link {
		text-decoration: none;
		color: inherit;
		transition: all 0.15s ease;
	}

	.card-link:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 16px -4px rgb(0 0 0 / 0.1);
	}

	.week-label {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.task-preview {
		list-style: none;
		padding: 0;
		margin: var(--spacing-md) 0 0;
		font-size: 0.875rem;
	}

	.task-preview li {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) 0;
	}

	.task-bullet {
		color: var(--color-text-muted);
	}

	.quick-actions {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
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

	.widgets-section {
		margin-top: var(--spacing-xl);
	}

	.widgets-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-md);
	}

	.widgets-header h2 {
		margin: 0;
	}

	.widgets-actions {
		display: flex;
		gap: var(--spacing-sm);
	}

	.widgets-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--spacing-md);
	}

	.empty-widgets {
		text-align: center;
		padding: var(--spacing-xl);
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-md);
	}

	.empty-widgets p {
		margin-bottom: var(--spacing-md);
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.75rem;
	}
</style>
