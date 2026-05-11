/**
 * Tool-use system for the AI assistant.
 *
 * A "tool" is a typed action the AI can invoke to read or write user data.
 * Read tools are auto-executed during a chat turn (the agent loop feeds the
 * result back to the model). Write tools are returned to the client as
 * pending proposals that the user reviews and applies.
 */

export type ToolCategory = 'read' | 'write';

export interface ToolContext {
	userId: string;
	timezone: string;
	weekStartDay: 'sunday' | 'monday';
}

export interface ToolParameter {
	type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
	description?: string;
	enum?: readonly string[];
	items?: ToolParameter;
	properties?: Record<string, ToolParameter>;
	required?: string[];
}

export interface ToolDef<Args = Record<string, unknown>, Result = unknown> {
	name: string;
	description: string;
	category: ToolCategory;
	parameters: {
		type: 'object';
		properties: Record<string, ToolParameter>;
		required?: string[];
	};
	/** Human-readable one-liner shown on the Apply card before execution. */
	preview: (args: Args) => string;
	/** Server-side handler — receives validated args, returns a result. */
	execute: (ctx: ToolContext, args: Args) => Promise<Result>;
}

export interface ToolCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
}

export interface ToolCallResult {
	id: string;
	name: string;
	ok: boolean;
	result?: unknown;
	error?: string;
}
