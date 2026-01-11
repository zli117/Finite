<script lang="ts">
	import type { Tag } from '$lib/types';

	interface Props {
		tags: Tag[];
		selectedTagIds: string[];
		onChange: (tagIds: string[]) => void;
		placeholder?: string;
		disabled?: boolean;
		allowCreate?: boolean;
		onCreateTag?: (name: string) => Promise<Tag | null>;
	}

	let {
		tags,
		selectedTagIds,
		onChange,
		placeholder = 'Add tags...',
		disabled = false,
		allowCreate = true,
		onCreateTag
	}: Props = $props();

	let searchQuery = $state('');
	let showDropdown = $state(false);
	let inputRef = $state<HTMLInputElement | null>(null);
	let highlightedIndex = $state(-1);
	let creating = $state(false);

	// Get selected tags
	const selectedTags = $derived(
		selectedTagIds
			.map((id) => tags.find((t) => t.id === id))
			.filter((t): t is Tag => t !== undefined)
	);

	// Filter available tags based on search query
	const filteredTags = $derived(() => {
		const query = searchQuery.toLowerCase().trim();
		const availableTags = tags.filter((t) => !selectedTagIds.includes(t.id));

		if (!query) {
			return availableTags.slice(0, 10); // Show first 10 when no query
		}

		return availableTags
			.filter((t) => t.name.toLowerCase().includes(query))
			.slice(0, 10);
	});

	// Check if the search query matches an existing tag exactly
	const exactMatch = $derived(() => {
		const query = searchQuery.toLowerCase().trim();
		return tags.some((t) => t.name.toLowerCase() === query);
	});

	// Show create option if query doesn't match existing tag
	const showCreateOption = $derived(() => {
		return (
			allowCreate &&
			onCreateTag &&
			searchQuery.trim().length > 0 &&
			!exactMatch()
		);
	});

	function handleInputFocus() {
		showDropdown = true;
		highlightedIndex = -1;
	}

	function handleInput() {
		// Ensure dropdown is shown when typing
		if (!showDropdown) {
			showDropdown = true;
		}
		highlightedIndex = -1;
	}

	function handleInputBlur(e: FocusEvent) {
		// Delay hiding to allow clicking on dropdown items
		setTimeout(() => {
			showDropdown = false;
			highlightedIndex = -1;
		}, 200);
	}

	function handleKeydown(e: KeyboardEvent) {
		const items = filteredTags();
		const totalItems = items.length + (showCreateOption() ? 1 : 0);

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlightedIndex = Math.min(highlightedIndex + 1, totalItems - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightedIndex = Math.max(highlightedIndex - 1, -1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (highlightedIndex >= 0 && highlightedIndex < items.length) {
				selectTag(items[highlightedIndex].id);
			} else if (highlightedIndex === items.length && showCreateOption()) {
				createAndSelectTag();
			} else if (items.length === 1) {
				selectTag(items[0].id);
			} else if (showCreateOption()) {
				createAndSelectTag();
			}
		} else if (e.key === 'Escape') {
			showDropdown = false;
			inputRef?.blur();
		} else if (e.key === 'Backspace' && searchQuery === '' && selectedTagIds.length > 0) {
			// Remove last tag when backspace is pressed on empty input
			removeTag(selectedTagIds[selectedTagIds.length - 1]);
		}
	}

	function selectTag(tagId: string) {
		if (!selectedTagIds.includes(tagId)) {
			onChange([...selectedTagIds, tagId]);
		}
		searchQuery = '';
		highlightedIndex = -1;
		// Keep dropdown open and refocus for adding more tags
		showDropdown = true;
		inputRef?.focus();
	}

	function removeTag(tagId: string) {
		onChange(selectedTagIds.filter((id) => id !== tagId));
	}

	async function createAndSelectTag() {
		if (!onCreateTag || creating) return;

		const name = searchQuery.trim();
		if (!name) return;

		creating = true;
		try {
			const newTag = await onCreateTag(name);
			if (newTag) {
				onChange([...selectedTagIds, newTag.id]);
				searchQuery = '';
			}
		} finally {
			creating = false;
			// Keep dropdown open and refocus for adding more tags
			showDropdown = true;
			inputRef?.focus();
		}
	}
</script>

<div class="tag-input-container">
	<div class="tag-input-wrapper" class:disabled class:focused={showDropdown}>
		{#each selectedTags as tag}
			<span
				class="tag-chip"
				style={tag.color
					? `background-color: ${tag.color}20; color: ${tag.color}; border-color: ${tag.color}`
					: ''}
			>
				{tag.name}
				<button
					type="button"
					class="tag-remove"
					onclick={() => removeTag(tag.id)}
					{disabled}
					tabindex="-1"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</span>
		{/each}

		<input
			type="text"
			class="tag-search-input"
			bind:value={searchQuery}
			bind:this={inputRef}
			onfocus={handleInputFocus}
			onblur={handleInputBlur}
			oninput={handleInput}
			onkeydown={handleKeydown}
			{placeholder}
			{disabled}
		/>
	</div>

	{#if showDropdown && (filteredTags().length > 0 || showCreateOption())}
		<div class="tag-dropdown">
			{#each filteredTags() as tag, index}
				<button
					type="button"
					class="dropdown-item"
					class:highlighted={highlightedIndex === index}
					onclick={() => selectTag(tag.id)}
					tabindex="-1"
				>
					<span
						class="dropdown-tag"
						style={tag.color
							? `background-color: ${tag.color}20; color: ${tag.color}; border-color: ${tag.color}`
							: ''}
					>
						{tag.name}
					</span>
					{#if tag.category}
						<span class="dropdown-category">{tag.category}</span>
					{/if}
				</button>
			{/each}

			{#if showCreateOption()}
				<button
					type="button"
					class="dropdown-item create-item"
					class:highlighted={highlightedIndex === filteredTags().length}
					onclick={createAndSelectTag}
					tabindex="-1"
					disabled={creating}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					<span>Create "{searchQuery.trim()}"</span>
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tag-input-container {
		position: relative;
	}

	.tag-input-wrapper {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-surface);
		min-height: 36px;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	.tag-input-wrapper.focused {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 2px var(--color-primary-bg, rgba(59, 130, 246, 0.1));
	}

	.tag-input-wrapper.disabled {
		background-color: var(--color-bg);
		cursor: not-allowed;
		opacity: 0.7;
	}

	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px 2px 8px;
		font-size: 0.8rem;
		background-color: var(--color-bg-hover);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.tag-remove {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		background: transparent;
		color: inherit;
		opacity: 0.6;
		cursor: pointer;
		border-radius: 50%;
		transition: opacity 0.15s ease, background-color 0.15s ease;
	}

	.tag-remove:hover {
		opacity: 1;
		background-color: rgba(0, 0, 0, 0.1);
	}

	.tag-remove:disabled {
		cursor: not-allowed;
	}

	.tag-search-input {
		flex: 1;
		min-width: 80px;
		border: none;
		outline: none;
		background: transparent;
		font-size: 0.875rem;
		padding: 4px 0;
	}

	.tag-search-input::placeholder {
		color: var(--color-text-muted);
	}

	.tag-search-input:disabled {
		cursor: not-allowed;
	}

	.tag-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 100;
		margin-top: 4px;
		padding: 4px;
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
		max-height: 200px;
		overflow-y: auto;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px;
		border: none;
		background: transparent;
		text-align: left;
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: background-color 0.1s ease;
	}

	.dropdown-item:hover,
	.dropdown-item.highlighted {
		background-color: var(--color-bg-hover);
	}

	.dropdown-tag {
		display: inline-block;
		padding: 2px 8px;
		font-size: 0.8rem;
		background-color: var(--color-bg-hover);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.dropdown-category {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.create-item {
		color: var(--color-primary);
		font-size: 0.875rem;
	}

	.create-item svg {
		flex-shrink: 0;
	}

	.create-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
