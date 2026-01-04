<script lang="ts">
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';

	let { data, children } = $props();
</script>

<svelte:head>
	<title>OKR Tracker</title>
	<meta name="description" content="Personal OKR tracking system" />
</svelte:head>

{#if data.user}
	<Nav user={data.user} />
{/if}

{@render children()}
