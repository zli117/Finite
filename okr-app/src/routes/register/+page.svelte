<script lang="ts">
	import { goto } from '$app/navigation';

	let username = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			return;
		}

		loading = true;

		try {
			const response = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || 'Registration failed';
				return;
			}

			// Redirect to dashboard with full invalidation to refresh layout
			goto('/', { invalidateAll: true });
		} catch (err) {
			error = 'An error occurred. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="auth-page">
	<div class="auth-card card">
		<h1 class="text-center mb-lg">Create Account</h1>

		<form onsubmit={handleSubmit}>
			<div class="form-group">
				<label class="label" for="username">Username</label>
				<input
					class="input"
					type="text"
					id="username"
					bind:value={username}
					required
					minlength="3"
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
					minlength="8"
					autocomplete="new-password"
				/>
			</div>

			<div class="form-group">
				<label class="label" for="confirmPassword">Confirm Password</label>
				<input
					class="input"
					type="password"
					id="confirmPassword"
					bind:value={confirmPassword}
					required
					autocomplete="new-password"
				/>
			</div>

			{#if error}
				<p class="error mb-md">{error}</p>
			{/if}

			<button class="btn btn-primary" style="width: 100%;" type="submit" disabled={loading}>
				{loading ? 'Creating account...' : 'Register'}
			</button>
		</form>

		<p class="text-center text-muted" style="margin-top: var(--spacing-lg);">
			Already have an account? <a href="/login">Login</a>
		</p>
	</div>
</div>
