import { db } from '$lib/db/client';
import { metricsTemplates, dailyMetricValues } from '$lib/db/schema';
import type { MetricDefinition } from '$lib/db/schema';
import { eq, and, lte, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { broadcastDataChange } from '$lib/server/events';
import type { ToolDef } from './types';

type DefinitionInput = {
	name: string;
	label: string;
	type: 'input' | 'computed' | 'external';
	inputType?: 'number' | 'time' | 'text' | 'boolean';
	unit?: string;
	expression?: string;
	source?: string;
};

async function getActiveTemplate(userId: string, date: string) {
	return db.query.metricsTemplates.findFirst({
		where: and(eq(metricsTemplates.userId, userId), lte(metricsTemplates.effectiveFrom, date)),
		orderBy: [desc(metricsTemplates.effectiveFrom)]
	});
}

interface ListMetricsArgs {
	date: string;
}

export const listMetrics: ToolDef<ListMetricsArgs> = {
	name: 'list_metrics',
	category: 'read',
	description:
		"List the user's tracked metric definitions plus stored values for a given date (YYYY-MM-DD). Returns the metrics template and current values.",
	parameters: {
		type: 'object',
		properties: { date: { type: 'string', description: 'YYYY-MM-DD' } },
		required: ['date']
	},
	preview: (a) => `List metrics for ${a.date}`,
	async execute(ctx, args) {
		const template = await getActiveTemplate(ctx.userId, args.date);
		if (!template) return { template: null, values: {} };
		const definitions: MetricDefinition[] = JSON.parse(template.metricsDefinition);
		const stored = await db.query.dailyMetricValues.findMany({
			where: and(eq(dailyMetricValues.userId, ctx.userId), eq(dailyMetricValues.date, args.date))
		});
		const values: Record<string, string | null> = {};
		for (const v of stored) values[v.metricName] = v.value;
		return {
			metrics: definitions.map((d) => ({
				name: d.name,
				label: d.label,
				type: d.type,
				inputType: d.inputType,
				unit: d.unit,
				value: values[d.name] ?? null
			}))
		};
	}
};

interface SetMetricValueArgs {
	date: string;
	name: string;
	value: string | number | boolean | null;
}

export const setMetricValue: ToolDef<SetMetricValueArgs> = {
	name: 'set_metric_value',
	category: 'write',
	description:
		"Set the value of one input-type metric for a date. Only metrics with type='input' can be set; computed/external metrics cannot.",
	parameters: {
		type: 'object',
		properties: {
			date: { type: 'string', description: 'YYYY-MM-DD' },
			name: { type: 'string', description: 'Metric name (machine identifier, not label)' },
			value: { type: 'string', description: 'Value as string; numbers/booleans will be stringified' }
		},
		required: ['date', 'name', 'value']
	},
	preview: (a) => `Set ${a.name} = ${a.value} on ${a.date}`,
	async execute(ctx, args) {
		const template = await getActiveTemplate(ctx.userId, args.date);
		if (!template) throw new Error('No metrics template active for this date');
		const definitions: MetricDefinition[] = JSON.parse(template.metricsDefinition);
		const def = definitions.find((d) => d.name === args.name);
		if (!def) throw new Error(`Unknown metric: ${args.name}`);
		if (def.type !== 'input') throw new Error(`Metric "${args.name}" is ${def.type}, cannot be set directly`);

		const stringValue = args.value === null ? null : String(args.value);
		const existing = await db.query.dailyMetricValues.findFirst({
			where: and(
				eq(dailyMetricValues.userId, ctx.userId),
				eq(dailyMetricValues.date, args.date),
				eq(dailyMetricValues.metricName, args.name)
			)
		});
		if (existing) {
			await db
				.update(dailyMetricValues)
				.set({ value: stringValue })
				.where(eq(dailyMetricValues.id, existing.id));
		} else {
			await db.insert(dailyMetricValues).values({
				id: uuidv4(),
				userId: ctx.userId,
				date: args.date,
				metricName: args.name,
				value: stringValue,
				source: 'user'
			});
		}
		broadcastDataChange(ctx.userId, 'data:metrics');
		return { ok: true };
	}
};

export const listMetricsTemplates: ToolDef = {
	name: 'list_metrics_templates',
	category: 'read',
	description:
		"List all the user's metrics templates (versioned by effectiveFrom date). The template active for a given date is the one with the latest effectiveFrom <= that date.",
	parameters: { type: 'object', properties: {} },
	preview: () => 'List metrics templates',
	async execute(ctx) {
		const rows = await db.query.metricsTemplates.findMany({
			where: eq(metricsTemplates.userId, ctx.userId),
			orderBy: [desc(metricsTemplates.effectiveFrom)]
		});
		return {
			templates: rows.map((t) => ({
				id: t.id,
				name: t.name,
				effectiveFrom: t.effectiveFrom,
				metricsDefinition: JSON.parse(t.metricsDefinition) as MetricDefinition[]
			}))
		};
	}
};

interface CreateTemplateArgs {
	effectiveFrom: string;
	metricsDefinition: DefinitionInput[];
	name?: string;
}

export const createMetricsTemplate: ToolDef<CreateTemplateArgs, { templateId: string }> = {
	name: 'create_metrics_template',
	category: 'write',
	description:
		"Create a new metrics template. effectiveFrom is YYYY-MM-DD — from this date forward the new template controls what fields show on the daily metrics page. metricsDefinition is an array of {name, label, type, inputType?, unit?, expression?, source?} objects.",
	parameters: {
		type: 'object',
		properties: {
			effectiveFrom: { type: 'string', description: 'YYYY-MM-DD' },
			name: { type: 'string' },
			metricsDefinition: {
				type: 'array',
				description: 'Array of MetricDefinition objects',
				items: { type: 'object', description: '{name, label, type, ...}' }
			}
		},
		required: ['effectiveFrom', 'metricsDefinition']
	},
	preview: (a) => `Create metrics template (effective ${a.effectiveFrom}, ${a.metricsDefinition.length} fields)`,
	async execute(ctx, args) {
		const id = uuidv4();
		await db.insert(metricsTemplates).values({
			id,
			userId: ctx.userId,
			name: args.name ?? 'default',
			effectiveFrom: args.effectiveFrom,
			metricsDefinition: JSON.stringify(args.metricsDefinition)
		});
		broadcastDataChange(ctx.userId, 'data:metrics');
		return { templateId: id };
	}
};

interface UpdateTemplateArgs {
	templateId: string;
	name?: string;
	effectiveFrom?: string;
	metricsDefinition?: DefinitionInput[];
}

export const updateMetricsTemplate: ToolDef<UpdateTemplateArgs> = {
	name: 'update_metrics_template',
	category: 'write',
	description:
		'Update an existing metrics template. Passing metricsDefinition replaces the entire array.',
	parameters: {
		type: 'object',
		properties: {
			templateId: { type: 'string' },
			name: { type: 'string' },
			effectiveFrom: { type: 'string' },
			metricsDefinition: { type: 'array', items: { type: 'object' } }
		},
		required: ['templateId']
	},
	preview: (a) => `Update metrics template ${a.templateId.slice(0, 8)}`,
	async execute(ctx, args) {
		const existing = await db.query.metricsTemplates.findFirst({
			where: and(eq(metricsTemplates.id, args.templateId), eq(metricsTemplates.userId, ctx.userId))
		});
		if (!existing) throw new Error('Template not found');
		const updates: Record<string, unknown> = { updatedAt: new Date() };
		if (args.name !== undefined) updates.name = args.name;
		if (args.effectiveFrom !== undefined) updates.effectiveFrom = args.effectiveFrom;
		if (args.metricsDefinition !== undefined)
			updates.metricsDefinition = JSON.stringify(args.metricsDefinition);
		await db.update(metricsTemplates).set(updates).where(eq(metricsTemplates.id, args.templateId));
		broadcastDataChange(ctx.userId, 'data:metrics');
		return { ok: true };
	}
};

interface DeleteTemplateArgs {
	templateId: string;
}

export const deleteMetricsTemplate: ToolDef<DeleteTemplateArgs> = {
	name: 'delete_metrics_template',
	category: 'write',
	description: 'Delete a metrics template.',
	parameters: {
		type: 'object',
		properties: { templateId: { type: 'string' } },
		required: ['templateId']
	},
	preview: (a) => `Delete metrics template ${a.templateId.slice(0, 8)}`,
	async execute(ctx, args) {
		const existing = await db.query.metricsTemplates.findFirst({
			where: and(eq(metricsTemplates.id, args.templateId), eq(metricsTemplates.userId, ctx.userId))
		});
		if (!existing) throw new Error('Template not found');
		await db.delete(metricsTemplates).where(eq(metricsTemplates.id, args.templateId));
		broadcastDataChange(ctx.userId, 'data:metrics');
		return { ok: true };
	}
};
