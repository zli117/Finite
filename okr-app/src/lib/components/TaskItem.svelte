<script lang="ts">
	import type { Task, TaskAttribute } from '$lib/types';

	interface Props {
		task: Task;
		onToggle: (id: string) => void;
		onUpdate: (id: string, updates: Partial<Task>) => void;
		onDelete: (id: string) => void;
	}

	let { task, onToggle, onUpdate, onDelete }: Props = $props();

	let editing = $state(false);
	let editTitle = $state(task.title);
	let showAttributes = $state(false);

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

	function formatAttributeValue(key: string, value: string): string {
		if (key === 'hour' || key === 'expected_hours') {
			return `${value}h`;
		}
		if (key === 'progress') {
			return value;
		}
		return value;
	}
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

		{#if task.attributes && Object.keys(task.attributes).length > 0}
			<div class="task-attributes">
				{#each Object.entries(task.attributes) as [key, value]}
					<span class="task-attribute" title={key}>
						{key}: {formatAttributeValue(key, value)}
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<div class="task-actions">
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

{#if showAttributes}
	<div class="task-attribute-editor">
		<div class="attribute-row">
			<label class="label">Hours</label>
			<input
				type="number"
				class="input input-sm"
				value={task.attributes?.hour || ''}
				onchange={(e) => handleAttributeChange('hour', e.currentTarget.value)}
				placeholder="0"
				step="0.5"
				min="0"
			/>
		</div>
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

	.task-attributes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
		margin-top: var(--spacing-xs);
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

	.btn-icon-danger:hover {
		background-color: #fef2f2;
		color: var(--color-error);
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
