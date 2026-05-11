<script lang="ts">
	import CodeWithAi from './CodeWithAi.svelte';
	import type { AiChatContext } from '$lib/ai/types';

	interface Props {
		open: boolean;
		value: string;
		title?: string;
		hasAiConfig: boolean;
		configuredProviders: string[];
		activeProvider: string;
		providerModels?: Record<string, string[]>;
		onSave?: (code: string) => void;
		context?: AiChatContext;
		contextData?: Record<string, unknown>;
	}

	let {
		open = $bindable(false),
		value = $bindable(''),
		title = 'Code Editor',
		hasAiConfig,
		configuredProviders,
		activeProvider,
		providerModels = {},
		onSave,
		context = 'query',
		contextData = {}
	}: Props = $props();

	function handleSave() {
		onSave?.(value);
		open = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
	<div class="modal-overlay" role="dialog" aria-modal="true" onkeydown={handleKeydown} tabindex="-1">
		<button class="modal-backdrop" onclick={() => open = false} aria-label="Close modal" tabindex="-1"></button>
		<div class="code-editor-modal">
			<div class="modal-header">
				<h3>{title}</h3>
				<div class="modal-actions">
					<button class="btn btn-primary btn-sm" onclick={handleSave}>
						Save & Close
					</button>
					<button class="btn-icon" onclick={() => open = false} title="Close">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</button>
				</div>
			</div>
			<div class="modal-content">
				<CodeWithAi
					bind:value
					editorHeight="100%"
					{hasAiConfig}
					{configuredProviders}
					{activeProvider}
					{providerModels}
					aiCollapsed={false}
					{context}
					{contextData}
				/>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		border: none;
		padding: 0;
		cursor: default;
	}

	.code-editor-modal {
		position: relative;
		width: 95vw;
		max-width: 1100px;
		height: 80vh;
		max-height: 85vh;
		background: var(--color-bg-card);
		border-radius: 20px;
		box-shadow: 0 20px 60px -12px rgb(0 0 0 / 0.25);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1rem;
	}

	.modal-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.modal-content {
		flex: 1;
		min-height: 0;
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.75rem;
	}

	.btn-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		border-radius: var(--radius-sm);
		cursor: pointer;
		color: var(--color-text-muted);
	}

	.btn-icon:hover {
		background-color: var(--color-bg-hover, #f3f4f6);
		color: var(--color-text);
	}
</style>
