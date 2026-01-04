<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { User } from '$lib/types';

	interface Props {
		user: User;
	}

	let { user }: Props = $props();
	let menuOpen = $state(false);

	async function handleLogout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		goto('/login');
	}

	function isActive(path: string): boolean {
		return $page.url.pathname.startsWith(path);
	}

	function closeMenu() {
		menuOpen = false;
	}
</script>

<nav class="nav">
	<div class="nav-header">
		<a href="/" class="nav-brand">OKR Tracker</a>
		<button class="menu-toggle" onclick={() => menuOpen = !menuOpen} aria-label="Toggle menu">
			<span class="menu-icon" class:open={menuOpen}>
				<span></span>
				<span></span>
				<span></span>
			</span>
		</button>
	</div>
	<div class="nav-links" class:open={menuOpen}>
		<a href="/daily" class="nav-link" class:active={isActive('/daily')} onclick={closeMenu}>Daily</a>
		<a href="/weekly" class="nav-link" class:active={isActive('/weekly')} onclick={closeMenu}>Weekly</a>
		<a href="/objectives" class="nav-link" class:active={isActive('/objectives')} onclick={closeMenu}>Objectives</a>
		<a href="/queries" class="nav-link" class:active={isActive('/queries')} onclick={closeMenu}>Queries</a>
		<a href="/settings/plugins" class="nav-link" class:active={isActive('/settings')} onclick={closeMenu}>Settings</a>
		<span class="nav-separator"></span>
		<span class="nav-user">{user.username}</span>
		<button class="btn btn-secondary btn-sm" onclick={handleLogout}>Logout</button>
	</div>
</nav>

<style>
	.nav {
		background-color: var(--color-bg-card);
		border-bottom: 1px solid var(--color-border);
		padding: var(--spacing-sm) var(--spacing-lg);
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.nav-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}

	.nav-brand {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		text-decoration: none;
	}

	.nav-brand:hover {
		text-decoration: none;
		color: var(--color-primary);
	}

	.menu-toggle {
		display: none;
		background: none;
		border: none;
		padding: var(--spacing-sm);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.menu-icon {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 24px;
	}

	.menu-icon span {
		display: block;
		height: 2px;
		background-color: var(--color-text);
		border-radius: 1px;
		transition: all 0.3s ease;
	}

	.menu-icon.open span:nth-child(1) {
		transform: translateY(6px) rotate(45deg);
	}

	.menu-icon.open span:nth-child(2) {
		opacity: 0;
	}

	.menu-icon.open span:nth-child(3) {
		transform: translateY(-6px) rotate(-45deg);
	}

	.nav-links {
		display: flex;
		gap: var(--spacing-md);
		align-items: center;
	}

	.nav-link {
		color: var(--color-text);
		text-decoration: none;
		font-size: 0.875rem;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-sm);
		transition: all 0.15s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.nav-link:hover {
		text-decoration: none;
		background-color: var(--color-bg-hover);
	}

	.nav-link.active {
		color: var(--color-primary);
		background-color: rgb(59 130 246 / 0.1);
	}

	.nav-separator {
		width: 1px;
		height: 20px;
		background-color: var(--color-border);
	}

	.nav-user {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.btn-sm {
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: 0.875rem;
		min-height: 44px;
	}

	/* Mobile styles */
	@media (max-width: 768px) {
		.nav {
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.menu-toggle {
			display: block;
		}

		.nav-links {
			display: none;
			flex-direction: column;
			width: 100%;
			padding-top: var(--spacing-md);
			gap: var(--spacing-xs);
		}

		.nav-links.open {
			display: flex;
		}

		.nav-link {
			width: 100%;
			padding: var(--spacing-md);
			font-size: 1rem;
			min-height: 48px;
			display: flex;
			align-items: center;
		}

		.nav-separator {
			width: 100%;
			height: 1px;
			margin: var(--spacing-sm) 0;
		}

		.nav-user {
			padding: var(--spacing-sm) var(--spacing-md);
			font-size: 1rem;
		}

		.btn-sm {
			width: 100%;
			justify-content: center;
			padding: var(--spacing-md);
			font-size: 1rem;
		}
	}
</style>
