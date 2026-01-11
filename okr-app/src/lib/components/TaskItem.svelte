<script lang="ts">
	import type { Task, Tag } from '$lib/types';
	import TagInput from './TagInput.svelte';

	interface Props {
		task: Task;
		tags?: Tag[];
		onToggle: (id: string) => void;
		onUpdate: (id: string, updates: Partial<Task>) => void;
		onDelete: (id: string) => void;
		onTimerToggle?: (id: string, action: 'start' | 'stop') => void;
		onCreateTag?: (name: string) => Promise<Tag | null>;
		hideTimer?: boolean;
	}

	let { task, tags = [], onToggle, onUpdate, onDelete, onTimerToggle, onCreateTag, hideTimer = false }: Props = $props();

	let editing = $state(false);
	let editTitle = $state(task.title);
	let editProgress = $state(task.attributes?.progress || '');
	let editExpectedHours = $state(task.attributes?.expected_hours || '');
	let showTagPicker = $state(false);

	// Sync edit values when task changes (for when props update)
	$effect(() => {
		if (!editing) {
			editTitle = task.title;
			editProgress = task.attributes?.progress || '';
			editExpectedHours = task.attributes?.expected_hours || '';
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
		const updates: Partial<Task> = {};
		let hasChanges = false;

		// Check title change
		if (editTitle.trim() && editTitle.trim() !== task.title) {
			updates.title = editTitle.trim();
			hasChanges = true;
		}

		// Check attribute changes
		const currentProgress = task.attributes?.progress || '';
		const currentHours = task.attributes?.expected_hours || '';
		if (editProgress !== currentProgress || editExpectedHours !== currentHours) {
			const newAttributes = { ...task.attributes };
			if (editProgress) {
				newAttributes.progress = editProgress;
			} else {
				delete newAttributes.progress;
			}
			if (editExpectedHours) {
				newAttributes.expected_hours = editExpectedHours;
			} else {
				delete newAttributes.expected_hours;
			}
			updates.attributes = newAttributes;
			hasChanges = true;
		}

		if (hasChanges) {
			onUpdate(task.id, updates);
		}
		editing = false;
	}

	function handleCancel() {
		editTitle = task.title;
		editProgress = task.attributes?.progress || '';
		editExpectedHours = task.attributes?.expected_hours || '';
		editing = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSave();
		} else if (e.key === 'Escape') {
			handleCancel();
		}
	}

	function handleTimerClick() {
		onTimerToggle(task.id, isTimerRunning ? 'stop' : 'start');
	}

	function handleTagsChange(tagIds: string[]) {
		onUpdate(task.id, { tagIds } as Partial<Task>);
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
		<span class="task-title">
			{task.title}
		</span>

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
		<!-- Timer button (only show for incomplete tasks, unless hideTimer is true) -->
		{#if !task.completed && !hideTimer && onTimerToggle}
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
		{/if}

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
			onclick={() => (editing = !editing)}
			title="Edit task"
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
		<TagInput
			{tags}
			selectedTagIds={task.tagIds || []}
			onChange={handleTagsChange}
			placeholder="Search or create tags..."
			allowCreate={!!onCreateTag}
			onCreateTag={onCreateTag}
		/>
	</div>
{/if}

{#if editing}
	<div class="task-edit-panel">
		<div class="edit-row edit-row-title">
			<label class="label">Title</label>
			<input
				type="text"
				class="input"
				bind:value={editTitle}
				onkeydown={handleKeydown}
				placeholder="Task title"
			/>
		</div>
		<div class="edit-row-group">
			<div class="edit-row">
				<label class="label">Progress</label>
				<input
					type="number"
					class="input input-sm"
					bind:value={editProgress}
					onkeydown={handleKeydown}
					placeholder="0"
					min="0"
				/>
			</div>
			<div class="edit-row">
				<label class="label">Expected Hours</label>
				<input
					type="number"
					class="input input-sm"
					bind:value={editExpectedHours}
					onkeydown={handleKeydown}
					placeholder="0"
					step="any"
					min="0"
				/>
			</div>
		</div>
		<div class="edit-actions">
			<button class="btn btn-secondary btn-sm" type="button" onclick={handleCancel}>
				Cancel
			</button>
			<button class="btn btn-primary btn-sm" type="button" onclick={handleSave}>
				Save
			</button>
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

	.task-checkbox {
		width: 18px;
		height: 18px;
		margin: 0;
		margin-top: 2px;
		flex-shrink: 0;
		cursor: pointer;
		accent-color: var(--color-primary);
	}

	.task-content {
		flex: 1;
		min-width: 0;
	}

	.task-title {
		display: block;
	}

	.task-completed .task-title {
		text-decoration: line-through;
		color: var(--color-text-muted);
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
		padding: var(--spacing-sm) 0 var(--spacing-sm) 28px;
		border-bottom: 1px solid var(--color-border);
		background-color: var(--color-bg);
	}

	.task-edit-panel {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) 0 var(--spacing-sm) 28px;
		border-bottom: 1px solid var(--color-border);
		background-color: var(--color-bg);
	}

	.edit-row {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.edit-row .label {
		font-size: 0.75rem;
		margin-bottom: 0;
	}

	.edit-row-group {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--spacing-sm);
	}

	.edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-sm);
		padding-top: var(--spacing-xs);
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.875rem;
	}

	.input-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.875rem;
	}
</style>
