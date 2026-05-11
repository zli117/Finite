<script lang="ts">
	import { page } from '$app/state';
	import AiChat from './AiChat.svelte';

	interface Props {
		hasAiConfig: boolean;
		configuredProviders: string[];
		activeProvider: string;
		providerModels?: Record<string, string[]>;
	}

	let {
		hasAiConfig,
		configuredProviders,
		activeProvider,
		providerModels = {}
	}: Props = $props();

	let open = $state(false);

	// Derive page-context from the current route
	const pageContext = $derived.by(() => {
		const route = page.route.id || '';
		const params = page.params;
		const ctx: Record<string, unknown> = { route };
		if (route.startsWith('/daily/') && params.date) {
			ctx.day = params.date;
		} else if (route.startsWith('/weekly/') && params.year && params.week) {
			ctx.year = parseInt(params.year, 10);
			ctx.week = parseInt(params.week, 10);
		} else if (route.startsWith('/objectives')) {
			const yearParam = page.url.searchParams.get('year');
			if (yearParam) ctx.year = parseInt(yearParam, 10);
			const monthParam = page.url.searchParams.get('month');
			if (monthParam) ctx.month = parseInt(monthParam, 10);
		}
		return ctx;
	});

	function toggle() {
		open = !open;
	}

	function handleKeydown(e: KeyboardEvent) {
		// Cmd+J / Ctrl+J to toggle (similar to many AI sidebars)
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
			e.preventDefault();
			toggle();
		}
		if (e.key === 'Escape' && open) {
			open = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if !open}
	<button
		class="assistant-fab"
		onclick={toggle}
		title="Open AI Assistant (Ctrl+J)"
		aria-label="Open AI Assistant"
	>
		<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
		</svg>
	</button>
{:else}
	<aside class="assistant-panel" aria-label="AI Assistant">
		<AiChat
			hasConfig={hasAiConfig}
			{configuredProviders}
			{activeProvider}
			{providerModels}
			context="assistant"
			contextData={{ page: pageContext }}
			onClose={() => (open = false)}
		/>
	</aside>
{/if}

<style>
	.assistant-fab {
		position: fixed;
		bottom: 20px;
		right: 20px;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: none;
		background: var(--color-primary, #3b82f6);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
		z-index: 1001;
		transition: transform 0.15s, box-shadow 0.15s;
	}

	.assistant-fab:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
	}

	.assistant-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(420px, 100vw);
		background: var(--color-surface, white);
		border-left: 1px solid var(--color-border);
		box-shadow: -8px 0 24px rgba(0, 0, 0, 0.08);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	@media (max-width: 640px) {
		.assistant-panel {
			width: 100vw;
			border-left: none;
		}
	}
</style>
