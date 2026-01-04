<script lang="ts">
	import { goto } from '$app/navigation';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		loading = true;

		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || 'Login failed';
				return;
			}

			// Redirect to dashboard
			goto('/');
		} catch (err) {
			error = 'An error occurred. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="auth-page">
	<div class="auth-card card">
		<h1 class="text-center mb-lg">Login</h1>

		<form onsubmit={handleSubmit}>
			<div class="form-group">
				<label class="label" for="username">Username</label>
				<input
					class="input"
					type="text"
					id="username"
					bind:value={username}
					required
					autocomplete="username"
				/>
			</div>

			<div class="form-group">
				<label class="label" for="password">Password</label>
				<input
					class="input"
					type="password"
					id="password"
					bind:value={password}
					required
					autocomplete="current-password"
				/>
			</div>

			{#if error}
				<p class="error mb-md">{error}</p>
			{/if}

			<button class="btn btn-primary" style="width: 100%;" type="submit" disabled={loading}>
				{loading ? 'Logging in...' : 'Login'}
			</button>
		</form>

		<p class="text-center text-muted" style="margin-top: var(--spacing-lg);">
			Don't have an account? <a href="/register">Register</a>
		</p>
	</div>
</div>
