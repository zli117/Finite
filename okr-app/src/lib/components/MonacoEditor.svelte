<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type * as Monaco from 'monaco-editor';

	interface Props {
		value: string;
		onChange?: (value: string) => void;
		height?: string;
		readonly?: boolean;
	}

	let { value = $bindable(), onChange, height = '200px', readonly = false }: Props = $props();

	let container: HTMLDivElement;
	let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
	let isUpdatingFromProp = false;

	onMount(async () => {
		// Dynamically import Monaco (client-side only)
		// The vite-plugin-monaco-editor handles worker setup automatically
		const monaco = await import('monaco-editor');

		// Create the editor instance
		editor = monaco.editor.create(container, {
			value: value,
			language: 'javascript',
			theme: 'vs',
			minimap: { enabled: false },
			readOnly: readonly,
			automaticLayout: true,
			fontSize: 13,
			lineNumbers: 'on',
			scrollBeyondLastLine: false,
			wordWrap: 'on',
			tabSize: 2,
			folding: true,
			renderLineHighlight: 'line',
			scrollbar: {
				vertical: 'auto',
				horizontal: 'auto',
				verticalScrollbarSize: 10,
				horizontalScrollbarSize: 10
			}
		});

		// Listen for content changes
		editor.onDidChangeModelContent(() => {
			if (editor && !isUpdatingFromProp) {
				const newValue = editor.getValue();
				value = newValue;
				onChange?.(newValue);
			}
		});
	});

	onDestroy(() => {
		if (editor) {
			editor.dispose();
			editor = null;
		}
	});

	// Update editor content when value prop changes externally
	$effect(() => {
		// Read value FIRST to ensure it's tracked as a dependency
		// (if we short-circuit on editor check, value won't be tracked)
		const currentValue = value;

		if (editor && currentValue !== editor.getValue()) {
			isUpdatingFromProp = true;
			editor.setValue(currentValue);
			// Reset flag after Monaco's change event has fired (async)
			requestAnimationFrame(() => {
				isUpdatingFromProp = false;
			});
		}
	});
</script>

<div class="monaco-container" style="height: {height};">
	<div bind:this={container} class="monaco-editor-wrapper"></div>
</div>

<style>
	.monaco-container {
		width: 100%;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.monaco-editor-wrapper {
		width: 100%;
		height: 100%;
	}
</style>
