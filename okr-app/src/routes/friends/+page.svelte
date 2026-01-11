<script lang="ts">
	let { data } = $props();

	let activeTab = $state<'friends' | 'requests'>('friends');
	let addFriendUsername = $state('');
	let addFriendLoading = $state(false);
	let addFriendError = $state('');
	let addFriendSuccess = $state('');

	// Local state for optimistic updates
	let friends = $state(data.friends);
	let incomingRequests = $state(data.requests.incoming);
	let outgoingRequests = $state(data.requests.outgoing);

	// Sync from server data
	$effect.pre(() => {
		friends = data.friends;
		incomingRequests = data.requests.incoming;
		outgoingRequests = data.requests.outgoing;
	});

	// Computed: total pending requests for badge
	const pendingCount = $derived(incomingRequests.length);

	async function sendFriendRequest() {
		if (!addFriendUsername.trim()) return;

		addFriendLoading = true;
		addFriendError = '';
		addFriendSuccess = '';

		try {
			const response = await fetch('/api/friends', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: addFriendUsername.trim() })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to send request');
			}

			// Add to outgoing requests
			outgoingRequests = [
				...outgoingRequests,
				{
					id: result.request.id,
					toUserId: result.request.toUserId,
					toUsername: result.request.toUsername,
					createdAt: new Date(result.request.createdAt)
				}
			];

			addFriendSuccess = `Friend request sent to ${result.request.toUsername}`;
			addFriendUsername = '';
		} catch (err) {
			addFriendError = err instanceof Error ? err.message : 'Failed to send request';
		} finally {
			addFriendLoading = false;
		}
	}

	async function acceptRequest(requestId: string, fromUsername: string) {
		try {
			const response = await fetch(`/api/friends/requests/${requestId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'accept' })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to accept request');
			}

			// Remove from incoming, add to friends
			incomingRequests = incomingRequests.filter((r) => r.id !== requestId);
			friends = [
				...friends,
				{
					id: result.friendship.friendId,
					username: result.friendship.friendUsername,
					friendshipCreatedAt: new Date(),
					note: ''
				}
			];
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Failed to accept request');
		}
	}

	async function declineRequest(requestId: string) {
		try {
			const response = await fetch(`/api/friends/requests/${requestId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'decline' })
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to decline request');
			}

			// Remove from incoming
			incomingRequests = incomingRequests.filter((r) => r.id !== requestId);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Failed to decline request');
		}
	}

	async function cancelRequest(requestId: string) {
		try {
			const response = await fetch(`/api/friends/requests/${requestId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to cancel request');
			}

			// Remove from outgoing
			outgoingRequests = outgoingRequests.filter((r) => r.id !== requestId);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Failed to cancel request');
		}
	}

	async function unfriend(friendId: string, friendUsername: string) {
		if (!confirm(`Are you sure you want to unfriend ${friendUsername}?`)) return;

		try {
			const response = await fetch(`/api/friends/${friendId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to unfriend');
			}

			// Remove from friends
			friends = friends.filter((f) => f.id !== friendId);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Failed to unfriend');
		}
	}

	// Note editing state
	let editingNoteFor = $state<string | null>(null);
	let editingNoteValue = $state('');

	function startEditNote(friendId: string, currentNote: string) {
		editingNoteFor = friendId;
		editingNoteValue = currentNote;
	}

	function cancelEditNote() {
		editingNoteFor = null;
		editingNoteValue = '';
	}

	async function saveNote(friendId: string) {
		try {
			const response = await fetch(`/api/friends/${friendId}/notes`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note: editingNoteValue })
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save note');
			}

			// Update local state
			friends = friends.map((f) =>
				f.id === friendId ? { ...f, note: editingNoteValue } : f
			);

			editingNoteFor = null;
			editingNoteValue = '';
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Failed to save note');
		}
	}

	function formatDate(date: Date | undefined): string {
		if (!date) return '';
		return new Date(date).toLocaleDateString();
	}
</script>

<svelte:head>
	<title>Friends | OKR Tracker</title>
</svelte:head>

<div class="friends-page">
	<header class="page-header">
		<h1>Friends</h1>
	</header>

	<!-- Add Friend Form -->
	<section class="add-friend-section">
		<form class="add-friend-form" onsubmit={(e) => { e.preventDefault(); sendFriendRequest(); }}>
			<input
				type="text"
				class="input"
				placeholder="Enter username to add friend..."
				bind:value={addFriendUsername}
				disabled={addFriendLoading}
			/>
			<button class="btn btn-primary" type="submit" disabled={addFriendLoading || !addFriendUsername.trim()}>
				{addFriendLoading ? 'Sending...' : 'Add Friend'}
			</button>
		</form>
		{#if addFriendError}
			<p class="error-message">{addFriendError}</p>
		{/if}
		{#if addFriendSuccess}
			<p class="success-message">{addFriendSuccess}</p>
		{/if}
	</section>

	<!-- Tabs -->
	<div class="tabs">
		<button
			class="tab"
			class:active={activeTab === 'friends'}
			onclick={() => (activeTab = 'friends')}
		>
			Friends ({friends.length})
		</button>
		<button
			class="tab"
			class:active={activeTab === 'requests'}
			onclick={() => (activeTab = 'requests')}
		>
			Requests
			{#if pendingCount > 0}
				<span class="badge">{pendingCount}</span>
			{/if}
		</button>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'friends'}
		<section class="tab-content">
			{#if friends.length === 0}
				<p class="empty-message">No friends yet. Add someone by their username above!</p>
			{:else}
				<div class="friends-list">
					{#each friends as friend}
						<div class="friend-card">
							<div class="friend-info">
								<span class="friend-username">{friend.username}</span>
								<span class="friend-since">Friends since {formatDate(friend.friendshipCreatedAt)}</span>
							</div>

							{#if editingNoteFor === friend.id}
								<div class="note-editor">
									<textarea
										class="input"
										bind:value={editingNoteValue}
										placeholder="Add a private note..."
										rows="2"
									></textarea>
									<div class="note-actions">
										<button class="btn btn-sm btn-secondary" onclick={cancelEditNote}>Cancel</button>
										<button class="btn btn-sm btn-primary" onclick={() => saveNote(friend.id!)}>Save</button>
									</div>
								</div>
							{:else}
								{#if friend.note}
									<p class="friend-note">{friend.note}</p>
								{/if}
							{/if}

							<div class="friend-actions">
								<a href="/friends/{friend.id}" class="btn btn-primary">View Dashboard</a>
								{#if editingNoteFor !== friend.id}
									<button
										class="btn btn-secondary"
										onclick={() => startEditNote(friend.id!, friend.note)}
									>
										{friend.note ? 'Edit Note' : 'Add Note'}
									</button>
								{/if}
								<button
									class="btn btn-danger"
									onclick={() => unfriend(friend.id!, friend.username!)}
								>
									Unfriend
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{:else}
		<section class="tab-content">
			<!-- Incoming Requests -->
			<div class="requests-section">
				<h3>Incoming Requests</h3>
				{#if incomingRequests.length === 0}
					<p class="empty-message">No pending friend requests.</p>
				{:else}
					<div class="requests-list">
						{#each incomingRequests as request}
							<div class="request-card">
								<div class="request-info">
									<span class="request-username">{request.fromUsername}</span>
									<span class="request-date">Sent {formatDate(request.createdAt)}</span>
								</div>
								<div class="request-actions">
									<button
										class="btn btn-primary btn-sm"
										onclick={() => acceptRequest(request.id, request.fromUsername!)}
									>
										Accept
									</button>
									<button
										class="btn btn-secondary btn-sm"
										onclick={() => declineRequest(request.id)}
									>
										Decline
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Outgoing Requests -->
			<div class="requests-section">
				<h3>Outgoing Requests</h3>
				{#if outgoingRequests.length === 0}
					<p class="empty-message">No pending outgoing requests.</p>
				{:else}
					<div class="requests-list">
						{#each outgoingRequests as request}
							<div class="request-card">
								<div class="request-info">
									<span class="request-username">{request.toUsername}</span>
									<span class="request-date">Sent {formatDate(request.createdAt)}</span>
								</div>
								<div class="request-actions">
									<button
										class="btn btn-secondary btn-sm"
										onclick={() => cancelRequest(request.id)}
									>
										Cancel
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	.friends-page {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--spacing-lg);
	}

	.page-header {
		margin-bottom: var(--spacing-lg);
	}

	.page-header h1 {
		font-size: 1.75rem;
		font-weight: 600;
	}

	.add-friend-section {
		margin-bottom: var(--spacing-lg);
	}

	.add-friend-form {
		display: flex;
		gap: var(--spacing-sm);
	}

	.add-friend-form .input {
		flex: 1;
	}

	.error-message {
		color: var(--color-error);
		font-size: 0.875rem;
		margin-top: var(--spacing-xs);
	}

	.success-message {
		color: var(--color-success);
		font-size: 0.875rem;
		margin-top: var(--spacing-xs);
	}

	.tabs {
		display: flex;
		gap: var(--spacing-xs);
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--spacing-lg);
	}

	.tab {
		padding: var(--spacing-sm) var(--spacing-md);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		font-size: 0.9rem;
		color: var(--color-text-muted);
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.tab:hover {
		color: var(--color-text);
	}

	.tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.badge {
		background-color: var(--color-error);
		color: white;
		font-size: 0.75rem;
		padding: 2px 6px;
		border-radius: 10px;
		min-width: 18px;
		text-align: center;
	}

	.tab-content {
		min-height: 200px;
	}

	.empty-message {
		color: var(--color-text-muted);
		text-align: center;
		padding: var(--spacing-xl);
	}

	.friends-list,
	.requests-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.friend-card,
	.request-card {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-md);
	}

	.friend-info,
	.request-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-sm);
	}

	.friend-username,
	.request-username {
		font-weight: 600;
		font-size: 1rem;
	}

	.friend-since,
	.request-date {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.friend-note {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		font-style: italic;
		margin-bottom: var(--spacing-sm);
		padding: var(--spacing-sm);
		background-color: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.note-editor {
		margin-bottom: var(--spacing-sm);
	}

	.note-editor textarea {
		width: 100%;
		margin-bottom: var(--spacing-xs);
	}

	.note-actions {
		display: flex;
		gap: var(--spacing-xs);
		justify-content: flex-end;
	}

	.friend-actions,
	.request-actions {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.requests-section {
		margin-bottom: var(--spacing-xl);
	}

	.requests-section h3 {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: var(--spacing-md);
		color: var(--color-text-muted);
	}

	.btn-danger {
		background-color: var(--color-error);
		color: white;
	}

	.btn-danger:hover {
		opacity: 0.9;
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.8rem;
	}
</style>
