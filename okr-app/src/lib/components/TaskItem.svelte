<script lang="ts">
	import type { Task, Tag } from '$lib/types';

	interface Props {
		task: Task;
		tags?: Tag[];
		onToggle: (id: string) => void;
		onUpdate: (id: string, updates: Partial<Task>) => void;
		onDelete: (id: string) => void;
		onTimerToggle: (id: string, action: 'start' | 'stop') => void;
	}

	let { task, tags = [], onToggle, onUpdate, onDelete, onTimerToggle }: Props = $props();

	let editing = $state(false);
	let editTitle = $state(task.title);
	let showAttributes = $state(false);
	let showTagPicker = $state(false);

	// Sync editTitle when task.title changes (for when props update)
	$effect(() => {
		if (!editing) {
			editTitle = task.title;
		}
	});

	// Timer state for live updates
	let liveElapsed = $state(0);

	// Check if timer is running - use explicit null check
	const isTimerRunning = $derived(task.timerStartedAt !== null && task.timerStartedAt !== undefined);

	// Calculate total time (saved + live elapsed)
	const totalTimeMs = $derived((task.timeSpentMs || 0) + liveElapsed);

	// Store the timerStartedAt value for use in effect
	const timerStartedAt = $derived(task.timerStartedAt);

	// Start interval when timer is running
	$effect(() => {
		// Access timerStartedAt to establish dependency
		const startedAt = timerStartedAt;

		if (isTimerRunning && startedAt) {
			// Calculate initial elapsed time
			liveElapsed = Date.now() - new Date(startedAt).getTime();

			// Start interval to update every second
			const interval = setInterval(() => {
				// Access the current timerStartedAt from derived
				if (task.timerStartedAt) {
					liveElapsed = Date.now() - new Date(task.timerStartedAt).getTime();
				}
			}, 1000);

			return () => {
				clearInterval(interval);
			};
		} else {
			liveElapsed = 0;
			return undefined;
		}
	});

	function formatTime(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		if (hours > 0) {
			return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
		}
		return `${minutes}:${String(seconds).padStart(2, '0')}`;
	}

	function handleToggle() {
		onToggle(task.id);
	}

	function handleSave() {
		if (editTitle.trim() && editTitle !== task.title) {
			onUpdate(task.id, { title: editTitle.trim() });
		}
		editing = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSave();
		} else if (e.key === 'Escape') {
			editTitle = task.title;
			editing = false;
		}
	}

	function handleAttributeChange(key: string, value: string) {
		const newAttributes = { ...task.attributes, [key]: value };
		onUpdate(task.id, { attributes: newAttributes });
	}

	function handleTimerClick() {
		onTimerToggle(task.id, isTimerRunning ? 'stop' : 'start');
	}

	function handleTagToggle(tagId: string) {
		const currentTagIds = task.tagIds || [];
		const newTagIds = currentTagIds.includes(tagId)
			? currentTagIds.filter((id) => id !== tagId)
			: [...currentTagIds, tagId];
		onUpdate(task.id, { tagIds: newTagIds } as Partial<Task>);
	}

	// Get assigned tags
	const assignedTags = $derived(
		(task.tagIds || [])
			.map((tagId) => tags.find((t) => t.id === tagId))
			.filter((t): t is Tag => t !== undefined)
	);
</script>

<div class="task-item" class:task-completed={task.completed}>
	<input
		type="checkbox"
		class="task-checkbox"
		checked={task.completed}
		onchange={handleToggle}
	/>

	<div class="task-content">
		{#if editing}
			<input
				type="text"
				class="input task-edit-input"
				bind:value={editTitle}
				onblur={handleSave}
				onkeydown={handleKeydown}
			/>
		{:else}
			<span
				class="task-title"
				ondblclick={() => (editing = true)}
				role="button"
				tabindex="0"
				onkeydown={(e) => e.key === 'Enter' && (editing = true)}
			>
				{task.title}
			</span>
		{/if}

		<div class="task-meta">
			<!-- Timer display -->
			{#if totalTimeMs > 0 || isTimerRunning}
				<span class="task-time" class:running={isTimerRunning}>
					{formatTime(totalTimeMs)}
				</span>
			{/if}

			<!-- Tags -->
			{#if assignedTags.length > 0}
				<div class="task-tags">
					{#each assignedTags as tag}
						<span
							class="task-tag"
							style={tag.color ? `background-color: ${tag.color}20; color: ${tag.color}; border-color: ${tag.color}` : ''}
						>
							{tag.name}
						</span>
					{/each}
				</div>
			{/if}

			<!-- Other attributes (progress, expected_hours) -->
			{#if task.attributes && (task.attributes.progress || task.attributes.expected_hours)}
				<div class="task-attributes">
					{#if task.attributes.progress}
						<span class="task-attribute">progress: {task.attributes.progress}</span>
					{/if}
					{#if task.attributes.expected_hours}
						<span class="task-attribute">est: {task.attributes.expected_hours}h</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<div class="task-actions">
		<!-- Timer button -->
		<button
			class="btn-icon btn-timer"
			class:running={isTimerRunning}
			onclick={handleTimerClick}
			title={isTimerRunning ? 'Stop timer' : 'Start timer'}
		>
			{#if isTimerRunning}
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
					<rect x="6" y="4" width="4" height="16" rx="1"/>
					<rect x="14" y="4" width="4" height="16" rx="1"/>
				</svg>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
					<polygon points="5 3 19 12 5 21 5 3"/>
				</svg>
			{/if}
		</button>

		<!-- Tag picker -->
		{#if tags.length > 0}
			<button
				class="btn-icon"
				onclick={() => (showTagPicker = !showTagPicker)}
				title="Manage tags"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
					<line x1="7" y1="7" x2="7.01" y2="7"/>
				</svg>
			</button>
		{/if}

		<button
			class="btn-icon"
			onclick={() => (showAttributes = !showAttributes)}
			title="Edit attributes"
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M12 20h9"/>
				<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
			</svg>
		</button>
		<button
			class="btn-icon btn-icon-danger"
			onclick={() => onDelete(task.id)}
			title="Delete task"
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="3 6 5 6 21 6"/>
				<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
			</svg>
		</button>
	</div>
</div>

{#if showTagPicker}
	<div class="task-tag-picker">
		<span class="picker-label">Tags:</span>
		<div class="tag-options">
			{#each tags as tag}
				<label class="tag-option">
					<input
						type="checkbox"
						checked={(task.tagIds || []).includes(tag.id)}
						onchange={() => handleTagToggle(tag.id)}
					/>
					<span
						class="tag-chip"
						style={tag.color ? `background-color: ${tag.color}20; color: ${tag.color}; border-color: ${tag.color}` : ''}
					>
						{tag.name}
					</span>
				</label>
			{/each}
		</div>
	</div>
{/if}

{#if showAttributes}
	<div class="task-attribute-editor">
		<div class="attribute-row">
			<label class="label">Progress</label>
			<input
				type="number"
				class="input input-sm"
				value={task.attributes?.progress || ''}
				onchange={(e) => handleAttributeChange('progress', e.currentTarget.value)}
				placeholder="0"
				min="0"
			/>
		</div>
		<div class="attribute-row">
			<label class="label">Expected Hours</label>
			<input
				type="number"
				class="input input-sm"
				value={task.attributes?.expected_hours || ''}
				onchange={(e) => handleAttributeChange('expected_hours', e.currentTarget.value)}
				placeholder="0"
				step="0.5"
				min="0"
			/>
		</div>
	</div>
{/if}

<style>
	.task-item {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.task-item:last-child {
		border-bottom: none;
	}

	.task-content {
		flex: 1;
		min-width: 0;
	}

	.task-title {
		display: block;
		cursor: pointer;
	}

	.task-completed .task-title {
		text-decoration: line-through;
		color: var(--color-text-muted);
	}

	.task-edit-input {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: inherit;
	}

	.task-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--spacing-xs);
		margin-top: var(--spacing-xs);
	}

	.task-time {
		display: inline-flex;
		align-items: center;
		padding: 2px 6px;
		font-size: 0.75rem;
		font-family: monospace;
		background-color: var(--color-bg-hover);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
	}

	.task-time.running {
		background-color: #fef3c7;
		color: #b45309;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	.task-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.task-tag {
		display: inline-block;
		padding: 2px 6px;
		font-size: 0.7rem;
		background-color: var(--color-bg-hover);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.task-attributes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.task-attribute {
		display: inline-block;
		padding: 2px 6px;
		font-size: 0.75rem;
		background-color: var(--color-bg-hover);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
	}

	.task-actions {
		display: flex;
		gap: var(--spacing-xs);
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.task-item:hover .task-actions {
		opacity: 1;
	}

	/* Always show timer button when running */
	.btn-timer.running {
		opacity: 1 !important;
	}

	.task-item:has(.btn-timer.running) .task-actions {
		opacity: 1;
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
		color: var(--color-text);
	}

	.btn-timer {
		color: var(--color-success);
	}

	.btn-timer.running {
		color: #b45309;
		background-color: #fef3c7;
	}

	.btn-timer:hover {
		background-color: #f0fdf4;
	}

	.btn-timer.running:hover {
		background-color: #fde68a;
	}

	.btn-icon-danger:hover {
		background-color: #fef2f2;
		color: var(--color-error);
	}

	.task-tag-picker {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) 0 var(--spacing-sm) 28px;
		border-bottom: 1px solid var(--color-border);
		background-color: var(--color-bg);
	}

	.picker-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.tag-options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.tag-option {
		display: flex;
		align-items: center;
		cursor: pointer;
	}

	.tag-option input {
		display: none;
	}

	.tag-chip {
		display: inline-block;
		padding: 2px 8px;
		font-size: 0.75rem;
		background-color: var(--color-bg-hover);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		transition: all 0.15s ease;
	}

	.tag-option input:checked + .tag-chip {
		background-color: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.task-attribute-editor {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) 0 var(--spacing-sm) 28px;
		border-bottom: 1px solid var(--color-border);
		background-color: var(--color-bg);
	}

	.attribute-row {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.attribute-row .label {
		font-size: 0.75rem;
		margin-bottom: 0;
	}

	.input-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.875rem;
	}
</style>
