<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import KRWidget from '$lib/components/KRWidget.svelte';
	import CodeEditorModal from '$lib/components/CodeEditorModal.svelte';
	import CircularProgress from '$lib/components/CircularProgress.svelte';
	import AiChat from '$lib/components/AiChat.svelte';
	import type { AiAction } from '$lib/ai/types';

	const OBJECTIVE_COLORS = [
		{ bg: 'linear-gradient(135deg, #FEE2E2, #FFF1F2)', accent: '#E84057', badge: '#FEE2E2' },
		{ bg: 'linear-gradient(135deg, #CCFBF1, #F0FDFA)', accent: '#0D9488', badge: '#CCFBF1' },
		{ bg: 'linear-gradient(135deg, #E0E7FF, #EEF2FF)', accent: '#6366F1', badge: '#E0E7FF' },
		{ bg: 'linear-gradient(135deg, #FCE7F3, #FDF2F8)', accent: '#DB2777', badge: '#FCE7F3' },
		{ bg: 'linear-gradient(135deg, #DBEAFE, #EFF6FF)', accent: '#2563EB', badge: '#DBEAFE' },
		{ bg: 'linear-gradient(135deg, #FEF3C7, #FFFBEB)', accent: '#D97706', badge: '#FEF3C7' },
	];

	let { data } = $props();

	let showNewObjective = $state(false);
	let showAiAssistant = $state(false);
	let loading = $state(false);
	let error = $state('');

	// Local mutable state for objectives (for optimistic updates)
	let localObjectives: typeof data.objectives = $state([]);
	let localOverallScore = $state(0);

	// Initialize and sync from server data
	$effect.pre(() => {
		localObjectives = structuredClone(data.objectives);
		localOverallScore = data.overallScore;
	});

	// Helper to recalculate objective average score
	function recalculateObjectiveScore(objective: typeof localObjectives[0]): number {
		if (objective.keyResults.length === 0) return 0;
		const totalWeight = objective.keyResults.reduce((sum, kr) => sum + kr.weight, 0);
		if (totalWeight === 0) return 0;
		return objective.keyResults.reduce((sum, kr) => {
			const { score } = getKRScore(kr);
			return sum + score * kr.weight;
		}, 0) / totalWeight;
	}

	// Total planned hours across all KRs
	const totalPlannedHours = $derived(
		localObjectives.reduce((sum, obj) =>
			sum + obj.keyResults.reduce((ksum, kr) => ksum + (kr.expectedHours || 0), 0), 0)
	);

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
	let liveScores = $state<Map<string, { score: number; label?: string }>>(new Map());
	let queryErrors = $state<Map<string, string>>(new Map());

	// Fetch progress for all custom_query KRs when view changes (mount, level/month switch)
	let lastProgressViewKey = '';
	$effect(() => {
		const viewKey = `${data.year}-${data.level}-${data.month}`;
		if (viewKey !== lastProgressViewKey) {
			lastProgressViewKey = viewKey;
			fetchAllCustomQueryKRs();
		}
	});

	function fetchAllCustomQueryKRs() {
		const customQueryKRs = data.objectives.flatMap((obj: typeof localObjectives[0]) =>
			obj.keyResults
				.filter(kr => kr.measurementType === 'custom_query' && kr.progressQueryCode)
				.map(kr => kr.id)
		);
		if (customQueryKRs.length > 0) {
			fetchKRProgress(customQueryKRs);
		}
	}

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
			const newScores = new Map<string, { score: number; label?: string }>();
			const newErrors = new Map<string, string>();

			for (const [krId, result] of Object.entries(results)) {
				const r = result as { score: number | null; scoreLabel?: string; error?: string };
				if (r.score !== null) {
					newScores.set(krId, { score: r.score, label: r.scoreLabel });
				}
				if (r.error) {
					newErrors.set(krId, r.error);
				}
			}

			liveScores = newScores;
			queryErrors = newErrors;

			// Recalculate objective and overall scores from live data
			for (const obj of localObjectives) {
				obj.averageScore = recalculateObjectiveScore(obj);
			}
			localOverallScore = recalculateOverallScore();
		} catch (err) {
			console.error('Failed to fetch KR progress:', err);
		} finally {
			loadingKRs = new Set();
		}
	}

	// Get the display score for a KR (live score if available, otherwise stored score)
	function getKRScore(kr: typeof localObjectives[0]['keyResults'][0]): { score: number; label?: string } {
		if (kr.measurementType === 'custom_query' && liveScores.has(kr.id)) {
			return liveScores.get(kr.id)!;
		}
		return { score: kr.score, label: kr.scoreLabel || undefined };
	}

	// Check if a KR is currently loading
	function isKRLoading(krId: string): boolean {
		return loadingKRs.has(krId);
	}

	// New objective form
	let newTitle = $state('');
	let newDescription = $state('');
	let newWeight = $state('1');
	let newColorIndex = $state(0);

	// Edit objective state
	let editingObjective = $state<typeof localObjectives[0] | null>(null);
	let editObjTitle = $state('');
	let editObjDescription = $state('');
	let editObjWeight = $state('1');
	let editObjColorIndex = $state(0);

	function openEditObjective(objective: typeof localObjectives[0]) {
		editingObjective = objective;
		editObjTitle = objective.title;
		editObjDescription = objective.description || '';
		editObjWeight = objective.weight.toString();
		editObjColorIndex = objective.colorIndex ?? 0;
	}

	function closeEditObjective() {
		editingObjective = null;
	}

	async function updateObjective() {
		if (!editingObjective || !editObjTitle.trim()) return;

		loading = true;
		error = '';

		try {
			const response = await fetch(`/api/objectives/${editingObjective.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: editObjTitle.trim(),
					description: editObjDescription.trim() || null,
					weight: parseFloat(editObjWeight) || 1,
					colorIndex: editObjColorIndex
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to update objective');
			}

			closeEditObjective();
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update objective';
		} finally {
			loading = false;
		}
	}

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
	let codeEditorOpen = $state(false);

	// Computed: is modal open?
	const isKRModalOpen = $derived(krModalObjectiveId !== null || editingKR !== null);

	// Month names for selector
	const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'];

	// Reflection state
	let reflectionText = $state('');
	let reflectionSaving = $state(false);
	let reflectionSaved = $state(false);
	let reflectionDirty = $state(false);

	// Track current view to detect navigation vs SSE reload
	let lastViewKey = $state('');

	// Sync reflection when year/level/month changes (navigation), not on SSE reloads
	$effect(() => {
		const currentKey = `${data.year}-${data.level}-${data.month}`;
		if (currentKey !== lastViewKey) {
			reflectionText = data.reflection;
			reflectionDirty = false;
			reflectionSaved = false;
			lastViewKey = currentKey;
		}
	});

	function handleReflectionChange(text: string) {
		reflectionText = text;
		reflectionDirty = true;
		reflectionSaved = false;
	}

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function asString(value: unknown): string {
		return typeof value === 'string' ? value.trim() : '';
	}

	function asNumber(value: unknown, fallback: number): number {
		return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
	}

	function asNullableString(value: unknown): string | null {
		const text = asString(value);
		return text || null;
	}

	function normalizeCheckboxItems(value: unknown): string | null {
		if (!Array.isArray(value)) return null;
		const items: Array<{ id: string; label: string; completed: boolean }> = [];
		for (const item of value) {
			const label = typeof item === 'string' ? item : isRecord(item) ? asString(item.label) : '';
			if (label) {
				items.push({ id: crypto.randomUUID(), label, completed: false });
			}
		}
		return items.length > 0 ? JSON.stringify(items) : null;
	}

	async function createKeyResultFromAi(objectiveId: string, payload: Record<string, unknown>) {
		const title = asString(payload.title);
		if (!title) throw new Error('AI action is missing a key result title');

		const requestedMeasurementType = asString(payload.measurementType);
		const progressQueryCode = asString(payload.progressQueryCode);
		const measurementType = requestedMeasurementType === 'custom_query' || progressQueryCode
			? 'custom_query'
			: 'checkboxes';
		const checkboxItems = normalizeCheckboxItems(payload.checkboxItems);
		const response = await fetch(`/api/objectives/${objectiveId}/key-results`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title,
				details: asString(payload.details) || null,
				weight: asNumber(payload.weight, 1),
				expectedHours: asNumber(payload.expectedHours, 0),
				measurementType,
				checkboxItems: measurementType === 'checkboxes' ? checkboxItems : null,
				progressQueryId: measurementType === 'custom_query' ? asNullableString(payload.progressQueryId) : null,
				progressQueryCode: measurementType === 'custom_query' ? progressQueryCode || null : null
			})
		});

		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error || 'Failed to create key result from AI action');
		}
	}

	async function updateKeyResultFromAi(objectiveId: string, krId: string, payload: Record<string, unknown>) {
		if (!objectiveId || !krId) throw new Error('AI action needs objectiveId and krId');

		const updates: Record<string, unknown> = {};
		const title = asString(payload.title);
		const details = asString(payload.details);
		const requestedMeasurementType = asString(payload.measurementType);
		const progressQueryCode = asString(payload.progressQueryCode);
		const checkboxItems = normalizeCheckboxItems(payload.checkboxItems);

		if (title) updates.title = title;
		if ('details' in payload) updates.details = details || null;
		if ('weight' in payload) updates.weight = asNumber(payload.weight, 1);
		if ('expectedHours' in payload) updates.expectedHours = asNumber(payload.expectedHours, 0);
		if (requestedMeasurementType === 'custom_query' || progressQueryCode) {
			updates.measurementType = 'custom_query';
			updates.checkboxItems = null;
			updates.progressQueryId = asNullableString(payload.progressQueryId);
			updates.progressQueryCode = progressQueryCode || null;
		} else if (requestedMeasurementType === 'checkboxes' || checkboxItems) {
			updates.measurementType = 'checkboxes';
			updates.checkboxItems = checkboxItems;
			updates.progressQueryId = null;
			updates.progressQueryCode = null;
		}

		const response = await fetch(`/api/objectives/${objectiveId}/key-results/${krId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updates)
		});

		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error || 'Failed to update key result from AI action');
		}
	}

	async function saveReflectionFromAi(reflection: string) {
		const response = await fetch('/api/objectives/reflections', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				level: data.level,
				year: data.year,
				month: data.month,
				reflection
			})
		});

		if (!response.ok) throw new Error('Failed to save reflection from AI action');
		reflectionText = reflection;
		reflectionDirty = false;
		reflectionSaved = true;
	}

	async function handleAiAction(action: AiAction) {
		error = '';
		if (!isRecord(action.payload)) {
			error = 'AI action payload must be an object';
			return;
		}

		try {
			if (action.type === 'create_objective') {
				const title = asString(action.payload.title);
				if (!title) throw new Error('AI action is missing an objective title');

				const payload: Record<string, unknown> = {
					level: data.level,
					year: data.year,
					title,
					description: asString(action.payload.description) || null,
					weight: asNumber(action.payload.weight, 1),
					colorIndex: asNumber(action.payload.colorIndex, localObjectives.length % OBJECTIVE_COLORS.length)
				};
				if (data.level === 'monthly' && data.month) payload.month = data.month;

				const response = await fetch('/api/objectives', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});
				if (!response.ok) {
					const result = await response.json();
					throw new Error(result.error || 'Failed to create objective from AI action');
				}

				const { objective } = await response.json();
				if (objective?.id && Array.isArray(action.payload.keyResults)) {
					for (const kr of action.payload.keyResults) {
						if (isRecord(kr)) {
							await createKeyResultFromAi(objective.id, kr);
						}
					}
				}
				await invalidateAll();
			} else if (action.type === 'update_objective') {
				const objectiveId = asString(action.payload.objectiveId);
				if (!objectiveId) throw new Error('AI action needs objectiveId');
				const updates: Record<string, unknown> = {};
				if (asString(action.payload.title)) updates.title = asString(action.payload.title);
				if ('description' in action.payload) updates.description = asString(action.payload.description) || null;
				if ('weight' in action.payload) updates.weight = asNumber(action.payload.weight, 1);
				if ('colorIndex' in action.payload) updates.colorIndex = asNumber(action.payload.colorIndex, 0);

				const response = await fetch(`/api/objectives/${objectiveId}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(updates)
				});
				if (!response.ok) {
					const result = await response.json();
					throw new Error(result.error || 'Failed to update objective from AI action');
				}
				await invalidateAll();
			} else if (action.type === 'delete_objective') {
				const objectiveId = asString(action.payload.objectiveId);
				if (!objectiveId) throw new Error('AI action needs objectiveId');
				const response = await fetch(`/api/objectives/${objectiveId}`, { method: 'DELETE' });
				if (!response.ok) throw new Error('Failed to delete objective from AI action');
				await invalidateAll();
			} else if (action.type === 'add_key_result') {
				const objectiveId = asString(action.payload.objectiveId) || (localObjectives.length === 1 ? localObjectives[0].id : '');
				if (!objectiveId) throw new Error('AI needs an objectiveId to add a key result');
				await createKeyResultFromAi(objectiveId, action.payload);
				await invalidateAll();
			} else if (action.type === 'update_key_result') {
				const objectiveId = asString(action.payload.objectiveId);
				const krId = asString(action.payload.krId);
				await updateKeyResultFromAi(objectiveId, krId, action.payload);
				await invalidateAll();
			} else if (action.type === 'delete_key_result') {
				const objectiveId = asString(action.payload.objectiveId);
				const krId = asString(action.payload.krId);
				if (!objectiveId || !krId) throw new Error('AI action needs objectiveId and krId');
				const response = await fetch(`/api/objectives/${objectiveId}/key-results/${krId}`, { method: 'DELETE' });
				if (!response.ok) throw new Error('Failed to delete key result from AI action');
				await invalidateAll();
			} else if (action.type === 'draft_reflection') {
				const reflection = asString(action.payload.reflection);
				if (!reflection) throw new Error('AI action is missing reflection text');
				handleReflectionChange(reflection);
			} else if (action.type === 'save_reflection') {
				const reflection = asString(action.payload.reflection);
				if (!reflection) throw new Error('AI action is missing reflection text');
				await saveReflectionFromAi(reflection);
			} else {
				throw new Error(`Unsupported AI action: ${action.type}`);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to apply AI action';
		}
	}

	async function saveReflection() {
		reflectionSaving = true;
		try {
			const response = await fetch('/api/objectives/reflections', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					level: data.level,
					year: data.year,
					month: data.month,
					reflection: reflectionText
				})
			});

			if (!response.ok) {
				throw new Error('Failed to save reflection');
			}

			reflectionDirty = false;
			reflectionSaved = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save reflection';
		} finally {
			reflectionSaving = false;
		}
	}

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
				weight: parseFloat(newWeight) || 1,
				colorIndex: newColorIndex
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
			newColorIndex = 0;
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

			const wasCustomQuery = krMeasurementType === 'custom_query';
			closeKRModal();
			await invalidateAll();
			if (wasCustomQuery) {
				await tick();
				fetchAllCustomQueryKRs();
			}
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
			const query = data.savedQueries.find(q => q.id === queryId);
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

			const wasCustomQuery = krMeasurementType === 'custom_query';
			const updatedKRId = editingKR!.kr.id;
			closeKRModal();
			await invalidateAll();
			if (wasCustomQuery) {
				await tick();
				fetchKRProgress([updatedKRId]);
			}
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
	<title>Objectives {data.year}{data.level === 'monthly' && data.month ? ` - ${monthNames[data.month - 1]}` : ''} - RUOK</title>
</svelte:head>

<div class="objectives-page">
	<header class="page-header">
		<h1 class="page-title">Objectives</h1>
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
					context="objectives"
					contextData={{
						view: { level: data.level, year: data.year, month: data.month },
						objectives: localObjectives.map((objective) => ({
							id: objective.id,
							title: objective.title,
							description: objective.description,
							weight: objective.weight,
							keyResults: objective.keyResults.map((kr) => ({
								id: kr.id,
								title: kr.title,
								details: kr.details,
								weight: kr.weight,
								expectedHours: kr.expectedHours,
								measurementType: kr.measurementType,
								checkboxItems: kr.checkboxItems,
								progressQueryId: kr.progressQueryId,
								progressQueryCode: kr.progressQueryCode
							}))
						})),
						savedQueries: data.savedQueries.map((query) => ({
							id: query.id,
							name: query.name,
							code: query.code
						})),
						reflection: reflectionText
					}}
					onAction={handleAiAction}
					welcomeText="Ask me to draft objectives, key results, or reflections for this period."
				/>
			</div>
		{/if}
	</section>

	<div class="overall-score card">
		<CircularProgress value={localOverallScore} size={120} strokeWidth={8} />
		<span class="score-label">Overall {data.level === 'yearly' ? 'Year' : (data.month ? monthNames[data.month - 1] : 'Month')} Score</span>
		<span class="hours-label">{totalPlannedHours}h planned</span>
	</div>

	<div class="objectives-list">
		{#each localObjectives as objective, i}
			{@const colors = OBJECTIVE_COLORS[(objective.colorIndex ?? i) % OBJECTIVE_COLORS.length]}
			<div class="card objective-card" style="background: {colors.bg}; border-color: transparent;">
				<div class="objective-header">
					<div class="objective-info">
						<h2 class="objective-title">{objective.title}</h2>
						{#if objective.description}
							<p class="objective-desc">{objective.description}</p>
						{/if}
					</div>
					<div class="objective-actions">
						<span class="objective-weight">Weight: {objective.weight}</span>
						<CircularProgress value={objective.averageScore} size={52} strokeWidth={4} color={colors.accent} />
						<button class="btn-icon" onclick={() => openEditObjective(objective)} title="Edit objective">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
								<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
							</svg>
						</button>
						<button class="btn-icon" onclick={() => deleteObjective(objective.id)} title="Delete objective">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polyline points="3 6 5 6 21 6"/>
								<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
							</svg>
						</button>
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
									{@const krResult = getKRScore(kr)}
									<span class="kr-score-badge" style="background: {colors.badge}; color: {colors.accent};">{krResult.label || `${(krResult.score * 100).toFixed(0)}%`}</span>
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
									{/if}
									<div
										class="progress-bar-fill"
										style="width: {isKRLoading(kr.id) ? 0 : getKRScore(kr).score * 100}%; background-color: {colors.accent};"
									></div>
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
				<div class="form-group">
					<span class="label">Color</span>
					<div class="color-picker">
						{#each OBJECTIVE_COLORS as color, i}
							<button
								type="button"
								class="color-swatch"
								class:selected={newColorIndex === i}
								style="background: {color.bg}; border-color: {newColorIndex === i ? color.accent : 'transparent'};"
								onclick={() => newColorIndex = i}
								title="Color {i + 1}"
							>
								{#if newColorIndex === i}
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color.accent} stroke-width="3">
										<polyline points="20 6 9 17 4 12"/>
									</svg>
								{/if}
							</button>
						{/each}
					</div>
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

	<!-- Reflections Section -->
	<section class="card reflections-section">
		<div class="reflections-header">
			<h2 class="section-title">Reflections</h2>
			<div class="reflections-actions">
				{#if reflectionSaved}
					<span class="saved-indicator">Saved</span>
				{/if}
				<button
					class="btn btn-primary btn-sm"
					onclick={saveReflection}
					disabled={reflectionSaving || !reflectionDirty}
				>
					{reflectionSaving ? 'Saving...' : 'Save'}
				</button>
			</div>
		</div>
		<textarea
			class="input textarea reflections-textarea"
			placeholder="Write your reflections for {data.level === 'yearly' ? data.year : `${monthNames[(data.month || 1) - 1]} ${data.year}`}..."
			value={reflectionText}
			oninput={(e) => handleReflectionChange(e.currentTarget.value)}
		></textarea>
	</section>
</div>

{#if isKRModalOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={closeKRModal} onkeydown={(e) => e.key === 'Escape' && closeKRModal()} role="dialog" aria-modal="true" aria-labelledby="kr-modal-title" tabindex="-1">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3 id="kr-modal-title">{editingKR ? 'Edit Key Result' : 'New Key Result'}</h3>
				<button class="btn-icon" onclick={closeKRModal} aria-label="Close modal">
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
						<input type="number" id="kr-hours" class="input" step="any" bind:value={krExpectedHours} placeholder="Optional" />
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
						<span class="label">Checkbox Items</span>
						<div class="checkbox-editor">
							{#each krCheckboxItems as item}
								<div class="checkbox-editor-item">
									<input
										type="text"
										class="input"
										placeholder="Item label"
										value={item.label}
										aria-label="Checkbox item label"
										oninput={(e) => updateCheckboxLabel(item.id, e.currentTarget.value)}
									/>
									<button type="button" class="btn-icon btn-icon-sm" onclick={() => removeCheckboxItem(item.id)} aria-label="Remove item">
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
						<span class="label">Progress Query</span>
						<p class="form-hint">Write a query that calls <code>progress.set(numerator, denominator)</code> to set progress (e.g., <code>progress.set(42, 100)</code>).</p>

						{#if data.savedQueries.length > 0}
							<div class="query-selector">
								<select class="input" value={krProgressQueryId || ''} onchange={(e) => selectProgressQuery(e.currentTarget.value || null)}>
									<option value="">-- Custom query (below) --</option>
									{#each data.savedQueries as query}
										<option value={query.id}>{query.name}</option>
									{/each}
								</select>
							</div>
						{/if}

						<button type="button" class="btn btn-secondary" onclick={() => codeEditorOpen = true}>
							{krProgressQueryCode ? 'Edit Query with AI...' : 'Write Query with AI...'}
						</button>
						{#if krProgressQueryCode}
							<pre class="code-preview"><code>{krProgressQueryCode}</code></pre>
						{/if}
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

<CodeEditorModal
	bind:open={codeEditorOpen}
	bind:value={krProgressQueryCode}
	title="Progress Query Code"
	hasAiConfig={data.aiConfig?.hasAiConfig ?? false}
	configuredProviders={data.aiConfig?.configuredProviders ?? []}
	activeProvider={data.aiConfig?.activeProvider ?? 'anthropic'}
	providerModels={data.aiConfig?.providerModels ?? {}}
	context="kr_progress"
	contextData={{ level: data.level, year: data.year, month: data.month }}
/>

{#if editingObjective}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={closeEditObjective} onkeydown={(e) => e.key === 'Escape' && closeEditObjective()} role="dialog" aria-modal="true" aria-labelledby="edit-obj-title" tabindex="-1">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3 id="edit-obj-title">Edit Objective</h3>
				<button class="btn-icon" onclick={closeEditObjective} aria-label="Close modal">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
			<form class="modal-body" onsubmit={(e) => { e.preventDefault(); updateObjective(); }}>
				<div class="form-group">
					<label class="label" for="edit-obj-title-input">Title</label>
					<input type="text" id="edit-obj-title-input" class="input" bind:value={editObjTitle} />
				</div>
				<div class="form-group">
					<label class="label" for="edit-obj-desc">Description (optional)</label>
					<textarea id="edit-obj-desc" class="input textarea" bind:value={editObjDescription}></textarea>
				</div>
				<div class="form-group">
					<label class="label" for="edit-obj-weight">Weight</label>
					<input type="number" id="edit-obj-weight" class="input" step="0.1" min="0.1" bind:value={editObjWeight} />
				</div>
				<div class="form-group">
					<span class="label">Color</span>
					<div class="color-picker">
						{#each OBJECTIVE_COLORS as color, i}
							<button
								type="button"
								class="color-swatch"
								class:selected={editObjColorIndex === i}
								style="background: {color.bg}; border-color: {editObjColorIndex === i ? color.accent : 'transparent'};"
								onclick={() => editObjColorIndex = i}
								title="Color {i + 1}"
							>
								{#if editObjColorIndex === i}
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color.accent} stroke-width="3">
										<polyline points="20 6 9 17 4 12"/>
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				</div>
				<div class="form-actions">
					<button type="button" class="btn btn-secondary" onclick={closeEditObjective}>Cancel</button>
					<button type="submit" class="btn btn-primary" disabled={loading || !editObjTitle.trim()}>
						{loading ? 'Saving...' : 'Save Changes'}
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

	.page-title {
		margin: 0;
		font-size: 2rem;
		font-weight: 800;
		letter-spacing: -0.02em;
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
		border-radius: 9999px;
		padding: 3px;
	}

	.tab {
		padding: var(--spacing-xs) var(--spacing-md);
		border: none;
		background: transparent;
		border-radius: 9999px;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.15s ease;
	}

	.tab.active {
		background-color: white;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.1);
		font-weight: 600;
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
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-lg);
		padding: var(--spacing-lg);
	}

	.score-label {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.hours-label {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		opacity: 0.7;
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
		font-weight: 700;
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

	.kr-score-badge {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 9999px;
		white-space: nowrap;
	}

	.key-results {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding-left: var(--spacing-md);
		border-left: 2px solid rgb(0 0 0 / 0.08);
	}

	.kr-item {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm);
		background-color: rgba(255, 255, 255, 0.6);
		border-radius: var(--radius-md);
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

	.kr-score-loading {
		font-size: 0.875rem;
		font-weight: 600;
		min-width: 40px;
		text-align: right;
	}

	.kr-progress {
		width: 100%;
	}

	.kr-progress .progress-bar {
		height: 6px;
		background-color: var(--color-border);
		border-radius: 3px;
		overflow: hidden;
		position: relative;
	}

	.kr-progress .progress-bar-fill {
		height: 100%;
		transition: width 0.6s ease, background-color 0.3s ease;
		border-radius: 3px;
		position: relative;
		z-index: 1;
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

	.ai-assistant-section {
		margin-bottom: var(--spacing-lg);
	}

	.ai-assistant-section .section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	.ai-assistant-section .section-title {
		margin: 0;
		font-size: 1rem;
	}

	.ai-chat-shell {
		height: 520px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
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

	.color-picker {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.color-swatch {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		padding: 0;
	}

	.color-swatch:hover {
		transform: scale(1.1);
	}

	.color-swatch.selected {
		box-shadow: 0 0 0 2px white, 0 0 0 4px currentColor;
	}

	.add-objective-btn {
		margin-top: var(--spacing-md);
	}

	/* Modal styles */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: var(--spacing-md);
		animation: fadeIn 0.15s ease;
	}

	.modal {
		background-color: var(--color-surface);
		border-radius: 20px;
		box-shadow: 0 20px 60px -12px rgb(0 0 0 / 0.2);
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		animation: slideUp 0.2s ease;
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

	/* Code preview */
	.code-preview {
		margin-top: var(--spacing-sm);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		max-height: 150px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-all;
	}

	.code-preview code {
		color: var(--color-text-muted);
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

	/* Reflections section */
	.reflections-section {
		margin-top: var(--spacing-lg);
	}

	.reflections-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-md);
	}

	.reflections-header .section-title {
		font-size: 1.125rem;
		margin: 0;
	}

	.reflections-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.saved-indicator {
		font-size: 0.75rem;
		color: var(--color-success);
	}

	.reflections-textarea {
		min-height: 150px;
		resize: vertical;
		width: 100%;
	}
</style>
