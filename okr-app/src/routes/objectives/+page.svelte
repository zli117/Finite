<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import KRWidget from '$lib/components/KRWidget.svelte';

	let { data } = $props();

	let showNewObjective = $state(false);
	let loading = $state(false);
	let error = $state('');

	// Local mutable state for objectives (for optimistic updates)
	let localObjectives = $state(structuredClone(data.objectives));
	let localOverallScore = $state(data.overallScore);

	// Sync from server data when it changes (year/level switch, create/delete operations)
	$effect(() => {
		// This runs when data.objectives reference changes (from server reload)
		localObjectives = structuredClone(data.objectives);
		localOverallScore = data.overallScore;
	});

	// Helper to recalculate objective average score
	function recalculateObjectiveScore(objective: typeof localObjectives[0]): number {
		if (objective.keyResults.length === 0) return 0;
		const totalWeight = objective.keyResults.reduce((sum, kr) => sum + kr.weight, 0);
		if (totalWeight === 0) return 0;
		return objective.keyResults.reduce((sum, kr) => {
			const score = getKRScore(kr);
			return sum + score * kr.weight;
		}, 0) / totalWeight;
	}

	// Helper to recalculate overall score
	function recalculateOverallScore(): number {
		if (localObjectives.length === 0) return 0;
		const totalWeight = localObjectives.reduce((sum, obj) => sum + obj.weight, 0);
		if (totalWeight === 0) return 0;
		return localObjectives.reduce((sum, obj) => {
			return sum + obj.averageScore * obj.weight;
		}, 0) / totalWeight;
	}

	// Track loading state and live scores for custom_query KRs
	let loadingKRs = $state<Set<string>>(new Set());
	let liveScores = $state<Map<string, number>>(new Map());
	let queryErrors = $state<Map<string, string>>(new Map());

	// Fetch progress for all custom_query KRs when data changes
	$effect(() => {
		const customQueryKRs = localObjectives.flatMap(obj =>
			obj.keyResults
				.filter(kr => kr.measurementType === 'custom_query' && kr.progressQueryCode)
				.map(kr => kr.id)
		);

		if (customQueryKRs.length > 0) {
			fetchKRProgress(customQueryKRs);
		}
	});

	async function fetchKRProgress(krIds: string[]) {
		// Mark all as loading
		loadingKRs = new Set(krIds);
		queryErrors = new Map();

		try {
			const response = await fetch('/api/objectives/kr-progress', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ krIds })
			});

			if (!response.ok) {
				throw new Error('Failed to fetch progress');
			}

			const { results } = await response.json();

			// Update live scores
			const newScores = new Map<string, number>();
			const newErrors = new Map<string, string>();

			for (const [krId, result] of Object.entries(results)) {
				const r = result as { score: number | null; error?: string };
				if (r.score !== null) {
					newScores.set(krId, r.score);
				}
				if (r.error) {
					newErrors.set(krId, r.error);
				}
			}

			liveScores = newScores;
			queryErrors = newErrors;
		} catch (err) {
			console.error('Failed to fetch KR progress:', err);
		} finally {
			loadingKRs = new Set();
		}
	}

	// Get the display score for a KR (live score if available, otherwise stored score)
	function getKRScore(kr: typeof localObjectives[0]['keyResults'][0]): number {
		if (kr.measurementType === 'custom_query' && liveScores.has(kr.id)) {
			return liveScores.get(kr.id)!;
		}
		return kr.score;
	}

	// Check if a KR is currently loading
	function isKRLoading(krId: string): boolean {
		return loadingKRs.has(krId);
	}

	// New objective form
	let newTitle = $state('');
	let newDescription = $state('');
	let newWeight = $state('1');

	// KR form (shared for both new and edit)
	let krTitle = $state('');
	let krWeight = $state('1');
	let krExpectedHours = $state('');
	let krDetails = $state('');
	let krMeasurementType = $state<'checkboxes' | 'custom_query'>('checkboxes');
	let krCheckboxItems = $state<Array<{id: string, label: string, completed: boolean}>>([]);
	let krProgressQueryId = $state<string | null>(null);
	let krProgressQueryCode = $state('');

	// KR modal state (for both new and edit)
	let krModalObjectiveId = $state<string | null>(null);
	let editingKR = $state<{objectiveId: string, kr: typeof localObjectives[0]['keyResults'][0]} | null>(null);

	// Computed: is modal open?
	const isKRModalOpen = $derived(krModalObjectiveId !== null || editingKR !== null);

	// Month names for selector
	const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'];

	function changeYear(year: number) {
		const params = new URLSearchParams({ year: String(year), level: data.level });
		if (data.level === 'monthly' && data.month) {
			params.set('month', String(data.month));
		}
		goto(`/objectives?${params.toString()}`);
	}

	function changeLevel(level: string) {
		const params = new URLSearchParams({ year: String(data.year), level });
		if (level === 'monthly') {
			// Default to current month when switching to monthly
			params.set('month', String(data.month || new Date().getMonth() + 1));
		}
		goto(`/objectives?${params.toString()}`);
	}

	function changeMonth(month: number) {
		goto(`/objectives?year=${data.year}&level=monthly&month=${month}`);
	}

	async function createObjective() {
		if (!newTitle.trim()) return;

		loading = true;
		error = '';

		try {
			const payload: Record<string, unknown> = {
				level: data.level,
				year: data.year,
				title: newTitle.trim(),
				description: newDescription.trim() || null,
				weight: parseFloat(newWeight) || 1
			};

			// Include month for monthly objectives
			if (data.level === 'monthly' && data.month) {
				payload.month = data.month;
			}

			const response = await fetch('/api/objectives', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
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

	async function createKeyResult() {
		if (!krModalObjectiveId || !krTitle.trim()) return;

		loading = true;
		error = '';

		try {
			const response = await fetch(`/api/objectives/${krModalObjectiveId}/key-results`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: krTitle.trim(),
					weight: parseFloat(krWeight) || 1,
					expectedHours: krExpectedHours ? parseFloat(krExpectedHours) : null,
					details: krDetails.trim() || null,
					measurementType: krMeasurementType,
					checkboxItems: krMeasurementType === 'checkboxes' ? JSON.stringify(krCheckboxItems) : null,
					progressQueryId: krMeasurementType === 'custom_query' ? krProgressQueryId : null,
					progressQueryCode: krMeasurementType === 'custom_query' ? krProgressQueryCode : null
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to create key result');
			}

			closeKRModal();
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create key result';
		} finally {
			loading = false;
		}
	}

	function resetKRForm() {
		krTitle = '';
		krWeight = '1';
		krExpectedHours = '';
		krDetails = '';
		krMeasurementType = 'checkboxes';
		krCheckboxItems = [];
		krProgressQueryId = null;
		krProgressQueryCode = '';
	}

	function openNewKR(objectiveId: string) {
		resetKRForm();
		krModalObjectiveId = objectiveId;
		editingKR = null;
	}

	function openEditKR(objectiveId: string, kr: typeof localObjectives[0]['keyResults'][0]) {
		editingKR = { objectiveId, kr };
		krModalObjectiveId = null;
		krTitle = kr.title;
		krWeight = kr.weight.toString();
		krExpectedHours = kr.expectedHours?.toString() || '';
		krDetails = kr.details || '';
		// Default to checkboxes if slider or undefined (slider is removed)
		const mt = kr.measurementType as string | undefined;
		krMeasurementType = (mt === 'checkboxes' || mt === 'custom_query') ? mt : 'checkboxes';
		krCheckboxItems = kr.checkboxItems ? JSON.parse(kr.checkboxItems) : [];
		krProgressQueryId = kr.progressQueryId || null;
		krProgressQueryCode = kr.progressQueryCode || '';
	}

	function closeKRModal() {
		krModalObjectiveId = null;
		editingKR = null;
		resetKRForm();
	}

	function selectProgressQuery(queryId: string | null) {
		krProgressQueryId = queryId;
		if (queryId) {
			const query = data.progressQueries.find(q => q.id === queryId);
			if (query) {
				krProgressQueryCode = query.code;
			}
		}
	}

	async function updateKeyResult() {
		if (!editingKR || !krTitle.trim()) return;

		loading = true;
		error = '';

		try {
			const response = await fetch(`/api/objectives/${editingKR.objectiveId}/key-results/${editingKR.kr.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: krTitle.trim(),
					weight: parseFloat(krWeight) || 1,
					expectedHours: krExpectedHours ? parseFloat(krExpectedHours) : null,
					details: krDetails.trim() || null,
					measurementType: krMeasurementType,
					checkboxItems: krMeasurementType === 'checkboxes' ? JSON.stringify(krCheckboxItems) : null,
					progressQueryId: krMeasurementType === 'custom_query' ? krProgressQueryId : null,
					progressQueryCode: krMeasurementType === 'custom_query' ? krProgressQueryCode : null
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to update key result');
			}

			closeKRModal();
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update key result';
		} finally {
			loading = false;
		}
	}

	function addCheckboxItem() {
		krCheckboxItems = [...krCheckboxItems, { id: crypto.randomUUID(), label: '', completed: false }];
	}

	function removeCheckboxItem(id: string) {
		krCheckboxItems = krCheckboxItems.filter(item => item.id !== id);
	}

	function updateCheckboxLabel(id: string, label: string) {
		krCheckboxItems = krCheckboxItems.map(item =>
			item.id === id ? { ...item, label } : item
		);
	}

	async function toggleCheckboxItem(objectiveId: string, krId: string, itemId: string) {
		const objectiveIndex = localObjectives.findIndex(o => o.id === objectiveId);
		if (objectiveIndex === -1) return;

		const objective = localObjectives[objectiveIndex];
		const krIndex = objective.keyResults.findIndex(k => k.id === krId);
		if (krIndex === -1) return;

		const kr = objective.keyResults[krIndex];
		if (!kr.checkboxItems) return;

		const items = JSON.parse(kr.checkboxItems) as Array<{id: string, label: string, completed: boolean}>;
		const updatedItems = items.map(item =>
			item.id === itemId ? { ...item, completed: !item.completed } : item
		);

		// Calculate score from checkbox completion
		const newScore = updatedItems.filter(i => i.completed).length / updatedItems.length;

		// Optimistic update: Update local state immediately
		localObjectives[objectiveIndex].keyResults[krIndex].checkboxItems = JSON.stringify(updatedItems);
		localObjectives[objectiveIndex].keyResults[krIndex].score = newScore;

		// Recalculate objective's average score
		localObjectives[objectiveIndex].averageScore = recalculateObjectiveScore(localObjectives[objectiveIndex]);

		// Recalculate overall score
		localOverallScore = recalculateOverallScore();

		try {
			const response = await fetch(`/api/objectives/${objectiveId}/key-results/${krId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					checkboxItems: JSON.stringify(updatedItems),
					score: newScore
				})
			});

			if (!response.ok) {
				throw new Error('Failed to update checkbox');
			}
			// No invalidateAll() - we already updated local state
		} catch (err) {
			error = 'Failed to update checkbox';
			// Revert on error by reloading from server
			await invalidateAll();
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
	<title>Objectives {data.year}{data.level === 'monthly' && data.month ? ` - ${monthNames[data.month - 1]}` : ''} - OKR Tracker</title>
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
			{#if data.level === 'monthly'}
				<select class="input select-sm" value={data.month} onchange={(e) => changeMonth(parseInt(e.currentTarget.value))}>
					{#each monthNames as name, index}
						<option value={index + 1}>{name}</option>
					{/each}
				</select>
			{/if}
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
			<span class="score-value">{(localOverallScore * 100).toFixed(0)}%</span>
			<span class="score-label">Overall {data.level === 'yearly' ? 'Year' : (data.month ? monthNames[data.month - 1] : 'Month')} Score</span>
		</div>
		<div class="progress-bar progress-bar-lg">
			<div class="progress-bar-fill" style="width: {localOverallScore * 100}%;"></div>
		</div>
	</div>

	<div class="objectives-list">
		{#each localObjectives as objective}
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
									<span class="kr-meta">
										Weight: {kr.weight}
										{kr.expectedHours ? ` | ${kr.expectedHours}h expected` : ''}
										{#if kr.measurementType === 'checkboxes'}
											| Checkboxes
										{:else if kr.measurementType === 'custom_query'}
											| Custom Query
										{/if}
									</span>
									{#if kr.details}
										<span class="kr-details">{kr.details}</span>
									{/if}
								</div>
								<div class="kr-controls">
								{#if isKRLoading(kr.id)}
									<span class="kr-score kr-score-loading">...</span>
								{:else}
									{@const score = getKRScore(kr)}
									<span class="kr-score" class:score-low={score < 0.3} class:score-mid={score >= 0.3 && score < 0.7} class:score-high={score >= 0.7}>{(score * 100).toFixed(0)}%</span>
								{/if}
									<button class="btn-icon btn-icon-sm" onclick={() => openEditKR(objective.id, kr)} title="Edit">
										<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
											<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
										</svg>
									</button>
									<button class="btn-icon btn-icon-sm" onclick={() => deleteKeyResult(objective.id, kr.id)} title="Delete">
										<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<line x1="18" y1="6" x2="6" y2="18"/>
											<line x1="6" y1="6" x2="18" y2="18"/>
										</svg>
									</button>
								</div>
							</div>

							{#if kr.measurementType === 'checkboxes' && kr.checkboxItems}
								{@const items = JSON.parse(kr.checkboxItems) as Array<{id: string, label: string, completed: boolean}>}
								<div class="kr-checkboxes">
									{#each items as item}
										<label class="checkbox-item">
											<input
												type="checkbox"
												checked={item.completed}
												onchange={() => toggleCheckboxItem(objective.id, kr.id, item.id)}
											/>
											<span class:completed={item.completed}>{item.label}</span>
										</label>
									{/each}
								</div>
							{/if}

							{#if kr.widgetQueryId || kr.widgetQueryCode}
								<div class="kr-widget">
									<KRWidget queryId={kr.widgetQueryId} queryCode={kr.widgetQueryCode} />
								</div>
							{/if}

							<div class="kr-progress">
								<div class="progress-bar" class:progress-bar-loading={isKRLoading(kr.id)}>
									{#if isKRLoading(kr.id)}
										<div class="progress-bar-indeterminate"></div>
									{:else}
										{@const progressScore = getKRScore(kr)}
										<div
											class="progress-bar-fill"
											class:fill-low={progressScore < 0.3}
											class:fill-mid={progressScore >= 0.3 && progressScore < 0.7}
											class:fill-high={progressScore >= 0.7}
											style="width: {progressScore * 100}%;"
										></div>
									{/if}
								</div>
								{#if queryErrors.has(kr.id)}
									<span class="kr-query-error" title={queryErrors.get(kr.id)}>Query error</span>
								{/if}
							</div>
						</div>
					{/each}

					<button class="btn btn-secondary btn-sm add-kr-btn" onclick={() => openNewKR(objective.id)}>
						+ Add Key Result
					</button>
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

{#if isKRModalOpen}
	<div class="modal-overlay" onclick={closeKRModal}>
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>{editingKR ? 'Edit Key Result' : 'New Key Result'}</h3>
				<button class="btn-icon" onclick={closeKRModal}>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
			<form class="modal-body" onsubmit={(e) => { e.preventDefault(); editingKR ? updateKeyResult() : createKeyResult(); }}>
				<div class="form-group">
					<label class="label" for="kr-title">Title</label>
					<input type="text" id="kr-title" class="input" bind:value={krTitle} placeholder="What do you want to achieve?" />
				</div>

				<div class="form-row">
					<div class="form-group">
						<label class="label" for="kr-weight">Weight</label>
						<input type="number" id="kr-weight" class="input" step="0.1" min="0.1" bind:value={krWeight} />
					</div>
					<div class="form-group">
						<label class="label" for="kr-hours">Expected Hours</label>
						<input type="number" id="kr-hours" class="input" step="0.5" bind:value={krExpectedHours} placeholder="Optional" />
					</div>
				</div>

				<div class="form-group">
					<label class="label" for="kr-details">Details (optional)</label>
					<textarea id="kr-details" class="input textarea" bind:value={krDetails} placeholder="Additional context or notes..."></textarea>
				</div>

				<div class="form-group">
					<label class="label" for="kr-measurement">Measurement Type</label>
					<select id="kr-measurement" class="input" bind:value={krMeasurementType}>
						<option value="checkboxes">Checkboxes (auto-calculated from completion)</option>
						<option value="custom_query">Custom Query (JavaScript code)</option>
					</select>
				</div>

				{#if krMeasurementType === 'checkboxes'}
					<div class="form-group">
						<label class="label">Checkbox Items</label>
						<div class="checkbox-editor">
							{#each krCheckboxItems as item}
								<div class="checkbox-editor-item">
									<input
										type="text"
										class="input"
										placeholder="Item label"
										value={item.label}
										oninput={(e) => updateCheckboxLabel(item.id, e.currentTarget.value)}
									/>
									<button type="button" class="btn-icon btn-icon-sm" onclick={() => removeCheckboxItem(item.id)}>
										<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<line x1="18" y1="6" x2="6" y2="18"/>
											<line x1="6" y1="6" x2="18" y2="18"/>
										</svg>
									</button>
								</div>
							{/each}
							<button type="button" class="btn btn-secondary btn-sm" onclick={addCheckboxItem}>+ Add Item</button>
						</div>
					</div>
				{/if}

				{#if krMeasurementType === 'custom_query'}
					<div class="form-group">
						<label class="label">Progress Query</label>
						<p class="form-hint">Select a saved progress query or write custom code that returns a value between 0 and 1.</p>

						{#if data.progressQueries.length > 0}
							<div class="query-selector">
								<select class="input" value={krProgressQueryId || ''} onchange={(e) => selectProgressQuery(e.currentTarget.value || null)}>
									<option value="">-- Custom code (below) --</option>
									{#each data.progressQueries as query}
										<option value={query.id}>{query.name}</option>
									{/each}
								</select>
							</div>
						{/if}

						<textarea
							id="kr-query"
							class="input code-textarea"
							placeholder="// Return a value between 0 and 1
const tasks = await q.tasks(&#123; tag: 'MyTag' &#125;);
if (tasks.length === 0) return 0;
return tasks.filter(t => t.completed).length / tasks.length;"
							bind:value={krProgressQueryCode}
						></textarea>
					</div>
				{/if}

				<div class="form-actions">
					<button type="button" class="btn btn-secondary" onclick={closeKRModal}>Cancel</button>
					<button type="submit" class="btn btn-primary" disabled={loading || !krTitle.trim()}>
						{loading ? 'Saving...' : (editingKR ? 'Save Changes' : 'Create Key Result')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

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

	/* Modal styles */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: var(--spacing-md);
	}

	.modal {
		background-color: var(--color-surface);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.modal-header h3 {
		margin: 0;
	}

	.modal-body {
		padding: var(--spacing-lg);
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-md);
	}

	/* KR details */
	.kr-details {
		display: block;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: 2px;
	}

	/* Checkbox display */
	.kr-checkboxes {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		margin-top: var(--spacing-xs);
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.checkbox-item input[type="checkbox"] {
		width: 16px;
		height: 16px;
		cursor: pointer;
	}

	.checkbox-item span.completed {
		text-decoration: line-through;
		color: var(--color-text-muted);
	}

	/* Checkbox editor */
	.checkbox-editor {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.checkbox-editor-item {
		display: flex;
		gap: var(--spacing-sm);
		align-items: center;
	}

	.checkbox-editor-item .input {
		flex: 1;
	}

	/* Code textarea */
	.code-textarea {
		min-height: 120px;
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
		font-size: 0.875rem;
		resize: vertical;
	}

	/* Form hint */
	.form-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0 0 var(--spacing-sm);
	}

	/* Query selector */
	.query-selector {
		margin-bottom: var(--spacing-sm);
	}

	/* KR Widget display */
	.kr-widget {
		margin-top: var(--spacing-xs);
		border-top: 1px solid var(--color-border);
		padding-top: var(--spacing-xs);
	}

	/* Loading states */
	.kr-score-loading {
		color: var(--color-text-muted);
		animation: pulse 1.5s ease-in-out infinite;
	}

	.progress-bar-loading {
		position: relative;
		overflow: hidden;
	}

	.progress-bar-indeterminate {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		width: 30%;
		background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
		animation: indeterminate 1.5s ease-in-out infinite;
	}

	@keyframes indeterminate {
		0% {
			left: -30%;
		}
		100% {
			left: 100%;
		}
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}

	/* Query error display */
	.kr-query-error {
		display: inline-block;
		font-size: 0.7rem;
		color: var(--color-error);
		margin-top: 2px;
		cursor: help;
	}
</style>
