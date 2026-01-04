/**
 * Plugin system entry point
 * Registers all available plugins
 */

import { registerPlugin } from './manager';
import { fitbitPlugin } from './fitbit';

// Register all plugins
export function initializePlugins(): void {
	registerPlugin(fitbitPlugin);
}

// Re-export everything
export * from './types';
export * from './manager';
export * from './oauth';
export { fitbitPlugin } from './fitbit';
