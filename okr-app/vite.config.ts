import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

// Type assertion for the plugin (handles CommonJS default export)
const monacoPlugin = (monacoEditorPlugin as unknown as { default: typeof monacoEditorPlugin }).default || monacoEditorPlugin;

export default defineConfig({
	plugins: [
		sveltekit(),
		monacoPlugin({
			languageWorkers: ['editorWorkerService', 'typescript']
		})
	]
});
