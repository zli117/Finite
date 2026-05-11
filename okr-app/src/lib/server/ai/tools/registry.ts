import type { ToolDef, ToolContext, ToolCall, ToolCallResult } from './types';
import {
	listTasks,
	createTask,
	updateTask,
	deleteTask,
	setTaskAttribute,
	controlTaskTimer
} from './tasks';
import {
	listObjectives,
	getObjective,
	createObjective,
	updateObjective,
	deleteObjective,
	createKeyResult,
	updateKeyResult,
	toggleKeyResultCheckbox,
	deleteKeyResult
} from './objectives';
import {
	listMetrics,
	setMetricValue,
	listMetricsTemplates,
	createMetricsTemplate,
	updateMetricsTemplate,
	deleteMetricsTemplate
} from './metrics';
import {
	getObjectiveReflection,
	setObjectiveReflection,
	getPeriodNotes,
	setPeriodNotes
} from './reflections';
import { listTags, createTag, updateTag, deleteTag, setTaskTags } from './tags';
import {
	listSavedQueries,
	getSavedQuery,
	createSavedQuery,
	updateSavedQuery,
	deleteSavedQuery,
	runQuery
} from './queries';
import {
	listDashboardWidgets,
	createDashboardWidget,
	updateDashboardWidget,
	deleteDashboardWidget
} from './widgets';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_TOOLS: ToolDef<any, any>[] = [
	// Objectives & KRs
	listObjectives,
	getObjective,
	createObjective,
	updateObjective,
	deleteObjective,
	createKeyResult,
	updateKeyResult,
	toggleKeyResultCheckbox,
	deleteKeyResult,
	// Reflections & period notes
	getObjectiveReflection,
	setObjectiveReflection,
	getPeriodNotes,
	setPeriodNotes,
	// Tasks
	listTasks,
	createTask,
	updateTask,
	deleteTask,
	setTaskAttribute,
	controlTaskTimer,
	// Tags
	listTags,
	createTag,
	updateTag,
	deleteTag,
	setTaskTags,
	// Metrics
	listMetrics,
	setMetricValue,
	listMetricsTemplates,
	createMetricsTemplate,
	updateMetricsTemplate,
	deleteMetricsTemplate,
	// Saved queries
	listSavedQueries,
	getSavedQuery,
	createSavedQuery,
	updateSavedQuery,
	deleteSavedQuery,
	runQuery,
	// Dashboard widgets
	listDashboardWidgets,
	createDashboardWidget,
	updateDashboardWidget,
	deleteDashboardWidget
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOOLS: Record<string, ToolDef<any, any>> = Object.fromEntries(
	ALL_TOOLS.map((t) => [t.name, t])
);

export function getToolList(): ReadonlyArray<ToolDef> {
	return ALL_TOOLS;
}

export async function executeTool(ctx: ToolContext, call: ToolCall): Promise<ToolCallResult> {
	const tool = TOOLS[call.name];
	if (!tool) {
		return { id: call.id, name: call.name, ok: false, error: `Unknown tool: ${call.name}` };
	}
	try {
		const result = await tool.execute(ctx, call.args);
		return { id: call.id, name: call.name, ok: true, result };
	} catch (err) {
		return {
			id: call.id,
			name: call.name,
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}

export function describeToolsForPrompt(): string {
	const sections = ALL_TOOLS.map((t) => {
		const props = Object.entries(t.parameters.properties)
			.map(([k, p]) => {
				const req = t.parameters.required?.includes(k) ? ' (required)' : '';
				const enums = p.enum ? ` [${p.enum.join('|')}]` : '';
				const desc = p.description ? ` — ${p.description}` : '';
				return `    - ${k}: ${p.type}${enums}${req}${desc}`;
			})
			.join('\n');
		return `### \`${t.name}\` (${t.category})\n${t.description}\n  Arguments:\n${props}`;
	});
	return sections.join('\n\n');
}

/**
 * Parse <tool_call name="X">{...json...}</tool_call> blocks out of an assistant
 * message. Tolerates surrounding text and minor whitespace differences.
 */
export function parseToolCalls(content: string): ToolCall[] {
	const calls: ToolCall[] = [];
	const regex = /<tool_call\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/tool_call>/g;
	let match;
	let i = 0;
	while ((match = regex.exec(content)) !== null) {
		const name = match[1].trim();
		const rawJson = match[2].trim();
		let args: Record<string, unknown> = {};
		if (rawJson) {
			try {
				args = JSON.parse(rawJson);
			} catch {
				// Skip malformed call — the model will see the error in the next round
				continue;
			}
		}
		calls.push({ id: `call_${Date.now()}_${i++}`, name, args });
	}
	return calls;
}

/** Strip tool_call blocks from a message for display. */
export function stripToolCalls(content: string): string {
	return content.replace(/<tool_call\s+name=["'][^"']+["']\s*>[\s\S]*?<\/tool_call>/g, '').trim();
}
