<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';

	let { data } = $props();

	let showNewObjective = $state(false);
	let showNewKR = $state<string | null>(null);
	let loading = $state(false);
	let error = $state('');

	// New objective form
	let newTitle = $state('');
	let newDescription = $state('');
	let newWeight = $state('1');

	// New key result form
	let krTitle = $state('');
	let krWeight = $state('1');
	let krExpectedHours = $state('');

	function changeYear(year: number) {
		goto(`/objectives?year=${year}&level=${data.level}`);
	}

	function changeLevel(level: string) {
		goto(`/objectives?year=${data.year}&level=${level}`);
	}

	async function createObjective() {
		if (!newTitle.trim()) return;

		loading = true;
		error = '';

		try {
			const response = await fetch('/api/objectives', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					level: data.level,
					year: data.year,
					title: newTitle.trim(),
					description: newDescription.trim() || null,
					weight: parseFloat(newWeight) || 1
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to create objective');
			}

			newTitle = '';
			newDescription = '';
			newWeight = '1';
			showNewObjective = false;
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create objective';
		} finally {
			loading = false;
		}
	}

	async function createKeyResult(objectiveId: string) {
		if (!krTitle.trim()) return;

		loading = true;
		error = '';

		try {
			const response = await fetch(`/api/objectives/${objectiveId}/key-results`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: krTitle.trim(),
					weight: parseFloat(krWeight) || 1,
					expectedHours: krExpectedHours ? parseFloat(krExpectedHours) : null
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to create key result');
			}

			krTitle = '';
			krWeight = '1';
			krExpectedHours = '';
			showNewKR = null;
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create key result';
		} finally {
			loading = false;
		}
	}

	async function updateKRScore(objectiveId: string, krId: string, score: number) {
		try {
			const response = await fetch(`/api/objectives/${objectiveId}/key-results/${krId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ score })
			});

			if (!response.ok) {
				throw new Error('Failed to update score');
			}

			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update score';
		}
	}

	async function deleteObjective(id: string) {
		if (!confirm('Delete this objective and all its key results?')) return;

		try {
			const response = await fetch(`/api/objectives/${id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete objective');
			}

			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete objective';
		}
	}

	async function deleteKeyResult(objectiveId: string, krId: string) {
		if (!confirm('Delete this key result?')) return;

		try {
			const response = await fetch(`/api/objectives/${objectiveId}/key-results/${krId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete key result');
			}

			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete key result';
		}
	}
</script>

<svelte:head>
	<title>Objectives {data.year} - OKR Tracker</title>
</svelte:head>

<div class="objectives-page">
	<header class="page-header">
		<h1>Objectives</h1>
		<div class="header-controls">
			<select class="input select-sm" value={data.year} onchange={(e) => changeYear(parseInt(e.currentTarget.value))}>
				{#each data.years as year}
					<option value={year}>{year}</option>
				{/each}
			</select>
			<div class="level-tabs">
				<button
					class="tab"
					class:active={data.level === 'yearly'}
					onclick={() => changeLevel('yearly')}
				>
					Yearly
				</button>
				<button
					class="tab"
					class:active={data.level === 'monthly'}
					onclick={() => changeLevel('monthly')}
				>
					Monthly
				</button>
			</div>
		</div>
	</header>

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	<div class="overall-score card">
		<div class="score-display">
			<span class="score-value">{(data.overallScore * 100).toFixed(0)}%</span>
			<span class="score-label">Overall {data.level === 'yearly' ? 'Year' : 'Month'} Score</span>
		</div>
		<div class="progress-bar progress-bar-lg">
			<div class="progress-bar-fill" style="width: {data.overallScore * 100}%;"></div>
		</div>
	</div>

	<div class="objectives-list">
		{#each data.objectives as objective}
			<div class="card objective-card">
				<div class="objective-header">
					<div class="objective-info">
						<h2 class="objective-title">{objective.title}</h2>
						{#if objective.description}
							<p class="objective-desc">{objective.description}</p>
						{/if}
					</div>
					<div class="objective-actions">
						<span class="objective-weight">Weight: {objective.weight}</span>
						<span class="objective-score" class:score-low={objective.averageScore < 0.3} class:score-mid={objective.averageScore >= 0.3 && objective.averageScore < 0.7} class:score-high={objective.averageScore >= 0.7}>{(objective.averageScore * 100).toFixed(0)}%</span>
						<button class="btn-icon" onclick={() => deleteObjective(objective.id)} title="Delete objective">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polyline points="3 6 5 6 21 6"/>
								<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
							</svg>
						</button>
					</div>
				</div>
				<div class="objective-progress">
					<div class="progress-bar">
						<div
							class="progress-bar-fill"
							class:fill-low={objective.averageScore < 0.3}
							class:fill-mid={objective.averageScore >= 0.3 && objective.averageScore < 0.7}
							class:fill-high={objective.averageScore >= 0.7}
							style="width: {objective.averageScore * 100}%;"
						></div>
					</div>
				</div>

				<div class="key-results">
					{#each objective.keyResults as kr}
						<div class="kr-item">
							<div class="kr-header">
								<div class="kr-info">
									<span class="kr-title">{kr.title}</span>
									<span class="kr-meta">Weight: {kr.weight}{kr.expectedHours ? ` | ${kr.expectedHours}h expected` : ''}</span>
								</div>
								<div class="kr-controls">
									<input
										type="range"
										min="0"
										max="1"
										step="0.05"
										value={kr.score}
										class="score-slider"
										oninput={(e) => updateKRScore(objective.id, kr.id, parseFloat(e.currentTarget.value))}
									/>
									<span class="kr-score" class:score-low={kr.score < 0.3} class:score-mid={kr.score >= 0.3 && kr.score < 0.7} class:score-high={kr.score >= 0.7}>{(kr.score * 100).toFixed(0)}%</span>
									<button class="btn-icon btn-icon-sm" onclick={() => deleteKeyResult(objective.id, kr.id)} title="Delete">
										<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<line x1="18" y1="6" x2="6" y2="18"/>
											<line x1="6" y1="6" x2="18" y2="18"/>
										</svg>
									</button>
								</div>
							</div>
							<div class="kr-progress">
								<div class="progress-bar">
									<div
										class="progress-bar-fill"
										class:fill-low={kr.score < 0.3}
										class:fill-mid={kr.score >= 0.3 && kr.score < 0.7}
										class:fill-high={kr.score >= 0.7}
										style="width: {kr.score * 100}%;"
									></div>
								</div>
							</div>
						</div>
					{/each}

					{#if showNewKR === objective.id}
						<form class="new-kr-form" onsubmit={(e) => { e.preventDefault(); createKeyResult(objective.id); }}>
							<input
								type="text"
								class="input"
								placeholder="Key result title"
								bind:value={krTitle}
							/>
							<input
								type="number"
								class="input input-sm"
								placeholder="Weight"
								bind:value={krWeight}
								step="0.1"
							/>
							<input
								type="number"
								class="input input-sm"
								placeholder="Hours"
								bind:value={krExpectedHours}
								step="0.5"
							/>
							<button type="submit" class="btn btn-primary btn-sm" disabled={loading}>Add</button>
							<button type="button" class="btn btn-secondary btn-sm" onclick={() => showNewKR = null}>Cancel</button>
						</form>
					{:else}
						<button class="btn btn-secondary btn-sm add-kr-btn" onclick={() => showNewKR = objective.id}>
							+ Add Key Result
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	{#if showNewObjective}
		<div class="card new-objective-form">
			<h3>New Objective</h3>
			<form onsubmit={(e) => { e.preventDefault(); createObjective(); }}>
				<div class="form-group">
					<label class="label" for="obj-title">Title</label>
					<input
						type="text"
						id="obj-title"
						class="input"
						placeholder="What do you want to achieve?"
						bind:value={newTitle}
					/>
				</div>
				<div class="form-group">
					<label class="label" for="obj-desc">Description (optional)</label>
					<textarea
						id="obj-desc"
						class="input textarea"
						placeholder="More details about this objective..."
						bind:value={newDescription}
					></textarea>
				</div>
				<div class="form-group">
					<label class="label" for="obj-weight">Weight</label>
					<input
						type="number"
						id="obj-weight"
						class="input"
						step="0.1"
						min="0.1"
						bind:value={newWeight}
					/>
				</div>
				<div class="form-actions">
					<button type="button" class="btn btn-secondary" onclick={() => showNewObjective = false}>Cancel</button>
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{loading ? 'Creating...' : 'Create Objective'}
					</button>
				</div>
			</form>
		</div>
	{:else}
		<button class="btn btn-primary add-objective-btn" onclick={() => showNewObjective = true}>
			+ New Objective
		</button>
	{/if}
</div>

<style>
	.objectives-page {
		max-width: 900px;
		margin: 0 auto;
		padding: var(--spacing-lg);
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-lg);
		flex-wrap: wrap;
		gap: var(--spacing-md);
	}

	.page-header h1 {
		margin: 0;
	}

	.header-controls {
		display: flex;
		gap: var(--spacing-md);
		align-items: center;
	}

	.select-sm {
		width: auto;
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.level-tabs {
		display: flex;
		background-color: var(--color-bg-hover);
		border-radius: var(--radius-md);
		padding: 2px;
	}

	.tab {
		padding: var(--spacing-xs) var(--spacing-md);
		border: none;
		background: transparent;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.875rem;
		transition: all 0.15s ease;
	}

	.tab.active {
		background-color: white;
		box-shadow: var(--shadow-sm);
	}

	.error-banner {
		background-color: #fef2f2;
		border: 1px solid #fecaca;
		color: var(--color-error);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.overall-score {
		text-align: center;
		margin-bottom: var(--spacing-lg);
	}

	.score-display {
		margin-bottom: var(--spacing-md);
	}

	.score-value {
		font-size: 3rem;
		font-weight: 700;
		color: var(--color-primary);
	}

	.score-label {
		display: block;
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.progress-bar-lg {
		height: 12px;
	}

	.objectives-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.objective-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.objective-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-md);
	}

	.objective-info {
		flex: 1;
	}

	.objective-title {
		font-size: 1.125rem;
		margin: 0 0 var(--spacing-xs);
	}

	.objective-desc {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin: 0;
	}

	.objective-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.objective-weight {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.objective-score {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-primary);
	}

	.objective-score.score-low {
		color: var(--color-error);
	}

	.objective-score.score-mid {
		color: var(--color-warning);
	}

	.objective-score.score-high {
		color: var(--color-success);
	}

	.objective-progress {
		margin-top: var(--spacing-sm);
	}

	.objective-progress .progress-bar {
		height: 8px;
	}

	.objective-progress .progress-bar-fill.fill-low {
		background-color: var(--color-error);
	}

	.objective-progress .progress-bar-fill.fill-mid {
		background-color: var(--color-warning);
	}

	.objective-progress .progress-bar-fill.fill-high {
		background-color: var(--color-success);
	}

	.key-results {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding-left: var(--spacing-md);
		border-left: 2px solid var(--color-border);
	}

	.kr-item {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm);
		background-color: var(--color-bg);
		border-radius: var(--radius-sm);
	}

	.kr-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--spacing-md);
	}

	.kr-info {
		flex: 1;
	}

	.kr-title {
		display: block;
		font-size: 0.875rem;
	}

	.kr-meta {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.kr-controls {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.score-slider {
		width: 100px;
		cursor: pointer;
	}

	.kr-score {
		font-size: 0.875rem;
		font-weight: 600;
		min-width: 40px;
		text-align: right;
	}

	.kr-score.score-low {
		color: var(--color-error);
	}

	.kr-score.score-mid {
		color: var(--color-warning);
	}

	.kr-score.score-high {
		color: var(--color-success);
	}

	.kr-progress {
		width: 100%;
	}

	.kr-progress .progress-bar {
		height: 6px;
		background-color: var(--color-border);
		border-radius: 3px;
		overflow: hidden;
	}

	.kr-progress .progress-bar-fill {
		height: 100%;
		transition: width 0.3s ease, background-color 0.3s ease;
		border-radius: 3px;
	}

	.kr-progress .progress-bar-fill.fill-low {
		background-color: var(--color-error);
	}

	.kr-progress .progress-bar-fill.fill-mid {
		background-color: var(--color-warning);
	}

	.kr-progress .progress-bar-fill.fill-high {
		background-color: var(--color-success);
	}

	.btn-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-icon:hover {
		background-color: var(--color-bg-hover);
		color: var(--color-error);
	}

	.btn-icon-sm {
		width: 24px;
		height: 24px;
	}

	.add-kr-btn {
		align-self: flex-start;
	}

	.new-kr-form {
		display: flex;
		gap: var(--spacing-sm);
		align-items: center;
		flex-wrap: wrap;
	}

	.new-kr-form .input {
		flex: 1;
		min-width: 150px;
	}

	.new-kr-form .input-sm {
		flex: 0;
		width: 80px;
		min-width: 80px;
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.75rem;
	}

	.new-objective-form {
		margin-top: var(--spacing-md);
	}

	.new-objective-form h3 {
		margin: 0 0 var(--spacing-md);
	}

	.textarea {
		min-height: 80px;
		resize: vertical;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-md);
	}

	.add-objective-btn {
		margin-top: var(--spacing-md);
	}
</style>
