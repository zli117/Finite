<script lang="ts">
	import type { Task, Tag } from '$lib/types';
	import TaskItem from './TaskItem.svelte';

	interface Props {
		tasks: Task[];
		tags?: Tag[];
		onToggle: (id: string) => void;
		onUpdate: (id: string, updates: Partial<Task>) => void;
		onDelete: (id: string) => void;
		onTimerToggle: (id: string, action: 'start' | 'stop') => void;
	}

	let { tasks, tags = [], onToggle, onUpdate, onDelete, onTimerToggle }: Props = $props();

	const completedTasks = $derived(tasks.filter((t) => t.completed));
	const pendingTasks = $derived(tasks.filter((t) => !t.completed));
	const completionPercent = $derived(
		tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0
	);
</script>

<div class="task-list-container">
	<div class="task-list-header">
		<div class="task-stats">
			<span class="task-count">{completedTasks.length} / {tasks.length} completed</span>
		</div>
		<div class="progress-bar">
			<div class="progress-bar-fill" style="width: {completionPercent}%"></div>
		</div>
	</div>

	{#if tasks.length === 0}
		<p class="text-muted text-center">No tasks yet. Add one below!</p>
	{:else}
		<ul class="task-list">
			{#each pendingTasks as task (task.id)}
				<li>
					<TaskItem {task} {tags} {onToggle} {onUpdate} {onDelete} {onTimerToggle} />
				</li>
			{/each}
			{#if completedTasks.length > 0 && pendingTasks.length > 0}
				<li class="task-divider">
					<span>Completed</span>
				</li>
			{/if}
			{#each completedTasks as task (task.id)}
				<li>
					<TaskItem {task} {tags} {onToggle} {onUpdate} {onDelete} {onTimerToggle} />
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.task-list-container {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.task-list-header {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.task-stats {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.task-count {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.task-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.task-divider {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md) 0 var(--spacing-sm);
		color: var(--color-text-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.task-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background-color: var(--color-border);
	}
</style>
