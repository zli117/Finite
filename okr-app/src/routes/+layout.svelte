<script lang="ts">
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';
	import AssistantSidebar from '$lib/components/AssistantSidebar.svelte';
	import { invalidate } from '$app/navigation';
	import { browser } from '$app/environment';

	let { data, children } = $props();

	// Apply user's background color preference
	$effect(() => {
		if (!browser) return;
		const color = data.user?.bgColor;
		if (color) {
			document.documentElement.style.setProperty('--color-bg', color);
		} else {
			document.documentElement.style.removeProperty('--color-bg');
		}
	});

	// Connect to SSE for real-time sync across devices
	$effect(() => {
		if (!browser || !data.user) return;

		const eventSource = new EventSource('/api/events');

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				// Invalidate the corresponding data dependency
				if (data.type && data.type.startsWith('data:')) {
					invalidate(data.type);
				}
			} catch {
				// Ignore parse errors (e.g., heartbeats)
			}
		};

		eventSource.onerror = () => {
			// EventSource will automatically reconnect
		};

		return () => {
			eventSource.close();
		};
	});
</script>

<svelte:head>
	<title>RUOK</title>
	<meta name="description" content="Track goals. Connect your data. Query your life." />
</svelte:head>

<div class="app-bg-decor">
	<div class="blob blob-1"></div>
	<div class="blob blob-2"></div>
	<div class="blob blob-3"></div>
</div>

{#if data.user}
	<Nav user={data.user} />
{/if}

{@render children()}

{#if data.user}
	<AssistantSidebar
		hasAiConfig={data.aiConfig.hasAiConfig}
		configuredProviders={data.aiConfig.configuredProviders}
		activeProvider={data.aiConfig.activeProvider}
		providerModels={data.aiConfig.providerModels}
	/>
{/if}

<style>
	.app-bg-decor {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: -1;
		overflow: hidden;
	}
	.blob {
		position: absolute;
		border-radius: 50%;
	}
	.blob-1 {
		width: 500px;
		height: 500px;
		background: radial-gradient(circle, rgb(191 219 254 / 0.35), transparent 70%);
		top: -180px;
		right: -100px;
	}
	.blob-2 {
		width: 400px;
		height: 400px;
		background: radial-gradient(circle, rgb(199 210 254 / 0.3), transparent 70%);
		bottom: -120px;
		left: -120px;
	}
	.blob-3 {
		width: 450px;
		height: 450px;
		background: radial-gradient(circle, rgb(153 246 228 / 0.15), transparent 70%);
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}

	@media (max-width: 768px) {
		.app-bg-decor {
			display: none;
		}
	}
</style>
